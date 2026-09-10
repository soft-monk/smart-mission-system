// Api.cc —— REST 实现（契约 §3）
#include "api/Api.h"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>

#include <drogon/HttpClient.h>
#include <drogon/utils/Utilities.h>
#include <sqlite3.h>

#include "core/Config.h"
#include "core/Database.h"
#include "core/EventHub.h"
#include "core/Repo.h"

namespace mapapp {
namespace api {

namespace {

sqlite3* db() { return Database::instance().raw(); }

std::string bodyString(const Req& req) {
    if (!req->body().empty()) return std::string(req->body().data(), req->body().size());
    return {};
}

nlohmann::json bodyJson(const Req& req) {
    try {
        const auto s = bodyString(req);
        if (s.empty()) return nlohmann::json::object();
        return nlohmann::json::parse(s);
    } catch (...) {
        return nlohmann::json::object();
    }
}

std::string sval(const nlohmann::json& j, const char* k, const std::string& def = "") {
    if (j.contains(k) && j[k].is_string()) return j[k].get<std::string>();
    return def;
}

// 关键动作互斥（TRD BIZ-12）：已执行则返回 false
bool claimOnce(const std::string& table, const std::string& id, const std::string& col) {
    const long long n = Repo::scalarInt(db(), "SELECT COUNT(*) FROM " + table + " WHERE id=? AND " + col + "=1", {id});
    if (n > 0) return false;
    return Repo::exec(db(), "UPDATE " + table + " SET " + col + "=1 WHERE id=?", {id});
}

// 阶段标题表：T0–T7 为两场景共用骨架、按场景取不同语义（TRD 1.2.1）
struct PhaseDef { const char* phase; const char* s1; const char* s2; };
const PhaseDef kPhases[] = {
    {"T0", "任务加载与场景选择",   "任务加载与场景选择"},
    {"T1", "无人机分组与任务编组", "无人机分组与任务编组"},
    {"T2", "通信链路建立",         "云边通信与协同链路建立"},
    {"T3", "光电侦察展开",         "多源侦察与态势构建"},
    {"T4", "目标识别与筛选",       "目标识别、评估与任务生成"},
    {"T5", "任务决策与打击准备",   "任务决策与打击准备"},
    {"T6", "协同执行与引导",       "协同执行与引导"},
    {"T7", "毁伤评估与任务结束",   "评估与任务结束"},
};

std::string phaseTitle(const std::string& key, const std::string& phase) {
    for (const auto& p : kPhases) {
        if (phase == p.phase) return key == "scenario-2" ? p.s2 : p.s1;
    }
    return phase;
}

// 当前任务：优先未完成任务，其次最新任务
nlohmann::json loadMission(const std::string& id) {
    if (!id.empty()) {
        auto m = Repo::one(db(), "SELECT * FROM mission WHERE id=?", {id});
        if (!m.empty()) return m;
    }
    auto cur = Repo::one(db(),
        "SELECT * FROM mission ORDER BY CASE WHEN status IN ('running','ready') THEN 0 ELSE 1 END, received_at DESC LIMIT 1");
    return cur;
}

// 链路指标聚合（linkMetrics / optimizeLink 共用）
nlohmann::json linkMetricsJson(const std::string& mid) {
    auto l = Repo::one(db(),
        "SELECT * FROM link WHERE mission_id=? ORDER BY CASE state WHEN 'green' THEN 0 WHEN 'yellow' THEN 1 ELSE 2 END LIMIT 1",
        {mid});
    nlohmann::json data;
    data["missionId"] = mid;
    data["signal"] = l.value("signal", "strong");
    data["signalDbm"] = -67;
    data["bandwidthMbps"] = l.value("bandwidth_mbps", 82.0);
    data["latencyMs"] = l.value("latency_ms", 38.0);
    data["lossRate"] = l.value("loss_rate", 0.3);
    data["coverageKm2"] = l.value("coverage_km2", 126.0);
    data["meshProgress"] = l.value("mesh_progress", 78);
    data["edges"] = Repo::query(db(), "SELECT * FROM link WHERE mission_id=?", {mid});
    return data;
}

// ---------------------------------------------------------------- AI 代理
// 统一把请求转发到 Python 桥（127.0.0.1:8090），失败时返回 code=2001 供前端降级
void proxyToAi(const std::string& path, const std::string& jsonBody, Cb callback) {
    const auto& cfg = Config::instance();
    auto client = drogon::HttpClient::newHttpClient("http://" + cfg.aiBridgeHost + ":" +
                                                    std::to_string(cfg.aiBridgePort));
    auto req = drogon::HttpRequest::newHttpRequest();
    req->setMethod(drogon::Post);
    req->setPath(path);
    req->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    req->setBody(jsonBody);

    // 诊断：确认转发内容（AI 联调期间保留，便于定位编码/截断问题）
    if (const char* dbg = std::getenv("MAPAPP_DEBUG_AI"); dbg && *dbg == '1') {
        std::cerr << "[ai-proxy] -> " << path << " bodyLen=" << jsonBody.size()
                  << " body=" << jsonBody.substr(0, 200) << std::endl;
    }

    client->sendRequest(req, [callback, path](drogon::ReqResult r, const drogon::HttpResponsePtr& resp) {
        if (r != drogon::ReqResult::Ok || !resp) {
            callback(fail(2001, "AI bridge unavailable"));
            return;
        }
        const std::string raw(resp->body());
        if (resp->getStatusCode() != drogon::k200OK) {
            std::cerr << "[ai-proxy] <- " << path << " HTTP " << resp->getStatusCode()
                      << " body=" << raw.substr(0, 200) << std::endl;
            callback(fail(2002, "AI bridge error: " + raw.substr(0, 200)));
            return;
        }
        // 桥返回业务对象本身（{text,provider,...}）；文本类需套契约 §2 的统一信封
        // {code,message,data}。音频（/tts）不走此路径。
        try {
            auto j = nlohmann::json::parse(raw);
            auto out = drogon::HttpResponse::newHttpResponse();
            out->setStatusCode(drogon::k200OK);
            out->setContentTypeCode(drogon::CT_APPLICATION_JSON);
            if (j.is_object() && j.contains("code")) {
                out->setBody(raw);           // 桥已自行套信封，原样返回
            } else {
                nlohmann::json env;
                env["code"] = 0;
                env["message"] = "ok";
                env["data"] = j;
                out->setBody(env.dump());
            }
            callback(out);
        } catch (...) {
            callback(fail(2002, "AI bridge returned non-JSON"));
        }
    }, 60.0);
}

// 二进制（音频）透传：/ai/tts
void proxyToAiBinary(const std::string& path, const std::string& jsonBody, Cb callback) {
    const auto& cfg = Config::instance();
    auto client = drogon::HttpClient::newHttpClient("http://" + cfg.aiBridgeHost + ":" +
                                                    std::to_string(cfg.aiBridgePort));
    auto req = drogon::HttpRequest::newHttpRequest();
    req->setMethod(drogon::Post);
    req->setPath(path);
    req->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    req->setBody(jsonBody);

    client->sendRequest(req, [callback](drogon::ReqResult r, const drogon::HttpResponsePtr& resp) {
        if (r != drogon::ReqResult::Ok || !resp || resp->getStatusCode() != drogon::k200OK) {
            callback(fail(2001, "AI bridge unavailable"));
            return;
        }
        auto out = drogon::HttpResponse::newHttpResponse();
        out->setStatusCode(drogon::k200OK);
        out->setContentTypeCode(resp->getContentType());
        out->setBody(std::string(resp->body()));
        callback(out);
    }, 60.0);
}

}  // namespace

// ---------------------------------------------------------------- 统一响应
drogon::HttpResponsePtr ok(const nlohmann::json& data) {
    nlohmann::json body;
    body["code"] = 0;
    body["message"] = "ok";
    body["data"] = data;
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(drogon::k200OK);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    return resp;
}

drogon::HttpResponsePtr fail(int code, const std::string& message, drogon::HttpStatusCode http) {
    nlohmann::json body;
    body["code"] = code;
    body["message"] = message;
    body["data"] = nullptr;
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(http);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    return resp;
}

std::string resolveMissionId(const Req& req) {
    const std::string q = req->getParameter("missionId");
    if (!q.empty()) return q;
    auto m = loadMission("");
    return m.value("id", std::string());
}

// ---------------------------------------------------------------- §3.1
void health(const Req&, Cb cb) {
    const auto& cfg = Config::instance();

    auto module = [](const std::string& key, const std::string& name, bool okFlag,
                     const std::string& detail, int metric) {
        nlohmann::json j;
        j["key"] = key;
        j["name"] = name;
        j["status"] = okFlag ? "ok" : "fail";
        j["detail"] = detail;
        j["metric"] = metric;
        return j;
    };

    // 地图引擎：瓦片目录是否存在
    bool tilesOk = std::filesystem::exists(cfg.tilesDir);
    // 通信链路：UDP 接收是否开启
    bool linkOk = cfg.udpEnabled;
    // AI 引擎：桥健康由 /api/v1/ai/health 单独查，这里按配置判定（前端会再查一次）
    bool aiOk = true;
    // 集群管理：资源台账是否有数据
    long long uavCount = Repo::scalarInt(db(), "SELECT COUNT(*) FROM uav_resource");
    bool clusterOk = uavCount > 0;
    // 数据服务：DB 可读写
    bool dataOk = (db() != nullptr);

    nlohmann::json modules = nlohmann::json::array();
    modules.push_back(module("map", "地图引擎", tilesOk, tilesOk ? "瓦片目录已就绪" : "瓦片目录缺失（用占位底图）", 100));
    modules.push_back(module("link", "通信链路", linkOk, linkOk ? "组播接收正常" : "组播接入已关闭", linkOk ? 100 : 60));
    modules.push_back(module("ai", "AI引擎", aiOk, "AI 桥已配置", 100));
    modules.push_back(module("cluster", "集群管理", clusterOk, clusterOk ? "资源台账就绪" : "资源台账为空", clusterOk ? 100 : 40));
    modules.push_back(module("data", "数据服务", dataOk, dataOk ? "SQLite 可读写" : "SQLite 不可用", dataOk ? 100 : 0));

    auto item = [](const std::string& key, const std::string& name, const std::string& sub,
                   const std::string& status) {
        nlohmann::json j;
        j["key"] = key; j["name"] = name; j["sub"] = sub; j["status"] = status;
        return j;
    };
    nlohmann::json selfCheck = nlohmann::json::array();
    selfCheck.push_back(item("comm", "通信链路检测", "卫星链路 / 数传链路 / 组网链路", linkOk ? "normal" : "abnormal"));
    selfCheck.push_back(item("position", "定位系统检测", "GPS / 北斗定位服务", "normal"));
    selfCheck.push_back(item("cluster", "集群节点检测", "集群节点状态 / 设备在线率", clusterOk ? "normal" : "abnormal"));
    selfCheck.push_back(item("command", "后方指控检测", "指控平台连接 / 数据交互服务", "normal"));
    selfCheck.push_back(item("security", "系统安全检测", "系统完整性 / 安全防护机制", "normal"));

    nlohmann::json overview = nlohmann::json::array();
    auto ov = [](const std::string& key, const std::string& name, const std::string& st, const std::string& txt) {
        nlohmann::json j; j["key"] = key; j["name"] = name; j["status"] = st; j["text"] = txt; return j;
    };
    overview.push_back(ov("network", "网络连接", "online", "在线"));
    overview.push_back(ov("datalink", "数据链路", "stable", "稳定"));
    overview.push_back(ov("gps", "GPS 定位", "normal", "正常"));
    overview.push_back(ov("security", "系统安全", "safe", "安全"));

    nlohmann::json data;
    data["status"] = "ok";
    data["checkedAt"] = Repo::nowString();
    data["modules"] = modules;
    data["selfCheck"] = selfCheck;
    data["systemOverview"] = overview;
    data["wsClients"] = static_cast<long long>(EventHub::instance().clientCount());
    cb(ok(data));
}

void mapConfig(const Req&, Cb cb) {
    const auto& cfg = Config::instance();
    nlohmann::json data;
    data["center"] = nlohmann::json::array({cfg.mapCenterLng, cfg.mapCenterLat});
    data["zoom"] = cfg.mapZoom;
    data["minZoom"] = cfg.mapMinZoom;
    data["maxZoom"] = cfg.mapMaxZoom;

    nlohmann::json basemap;
    basemap["tileUrlTemplate"] = "/tiles/{z}/{x}/{y}.png";
    basemap["attribution"] = "© OpenStreetMap contributors";
    basemap["fallback"] = "solid";   // 无瓦片时前端用纯色底图（保证可演示）
    data["basemap"] = basemap;

    // 视频通道（契约 §3.9 同源数据）
    nlohmann::json videos = nlohmann::json::array();
    const std::string dir = cfg.mediaDir;
    std::error_code ec;
    if (std::filesystem::exists(dir, ec)) {
        for (const auto& e : std::filesystem::directory_iterator(dir, ec)) {
            if (!e.is_regular_file()) continue;
            const std::string ext = e.path().extension().string();
            if (ext == ".mp4" || ext == ".webm") {
                nlohmann::json v;
                v["name"] = e.path().stem().string();
                v["url"] = "/media/" + e.path().filename().string();
                videos.push_back(v);
            }
        }
    }
    data["video"] = videos;
    cb(ok(data));
}

// ---------------------------------------------------------------- §3.2
void scenarios(const Req&, Cb cb) {
    cb(ok(Repo::query(db(), "SELECT * FROM scenario ORDER BY sort")));
}

void recommendScenario(const Req& req, Cb cb) {
    const auto j = bodyJson(req);
    nlohmann::json prompt;
    prompt["scene"] = sval(j, "scene", "scenario-1");
    prompt["prompt"] = sval(j, "prompt", "推荐一个任务模式");
    prompt["context"] = j.value("context", nlohmann::json::object());
    proxyToAi("/chat", prompt.dump(), [cb](const drogon::HttpResponsePtr& resp) {
        if (!resp || resp->getStatusCode() != drogon::k200OK) {
            cb(fail(2001, "AI bridge unavailable"));
            return;
        }
        cb(resp);
    });
}

void createMission(const Req& req, Cb cb) {
    const auto j = bodyJson(req);
    const std::string key = sval(j, "scenarioKey", "scenario-1");
    auto sc = Repo::one(db(), "SELECT * FROM scenario WHERE key=?", {key});
    if (sc.empty()) { cb(fail(1004, "unknown scenarioKey", drogon::k404NotFound)); return; }

    const std::string id = Repo::newId("m");
    const std::string taskNo = "M" + Repo::nowString().substr(0, 10)
                             + "-" + std::to_string(Repo::nowMs() % 100);
    nlohmann::json p{id, key, taskNo, sc.value("name", "") + "（演示）",
                     sc.value("task_type", ""), sc.value("task_region", ""),
                     "上级指派", "T0", "running", 0, Repo::nowString()};
    if (!Repo::exec(db(),
            "INSERT INTO mission(id,scenario_key,task_no,task_name,task_type,task_region,source,phase,status,progress,received_at,started_at) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", p)) {
        cb(fail(1005, "create mission failed", drogon::k500InternalServerError));
        return;
    }

    // 复制该场景的演示台账到新任务下（资源/方案/集群/目标/链路/指标/评估）
    const std::string src = (key == "scenario-2") ? "m-s2" : "m-s1";
    auto copyRows = [&](const std::string& table, const std::string& cols) {
        Repo::exec(db(), "INSERT INTO " + table + "(mission_id," + cols + ") SELECT ?, " + cols +
                             " FROM " + table + " WHERE mission_id=?", {id, src});
    };
    copyRows("uav_resource", "type,total,available,allocated,pending,ability_tags,online_rate");
    copyRows("mission_metrics", "coverage_rate,targets_found,coop_efficiency,link_stability,mesh_duration_sec,alert_count,resource_used,survival_rate");
    copyRows("assessment", "total_damage_rate,destroyed,severe,damaged,intact,area_control,effect_metrics");

    // plan / grp / target / link 需要重写主键，逐行复制
    auto cloneWithNewId = [&](const std::string& table, const std::string& idPrefix,
                              const std::vector<std::string>& cols) {
        auto rows = Repo::query(db(), "SELECT * FROM " + table + " WHERE mission_id=?", {src});
        for (const auto& r : rows) {
            const std::string newId = id + "-" + idPrefix + "-" + std::to_string(r.value("seq", 0));
            std::vector<std::string> params{newId, id};
            std::string collist = "id,mission_id";
            for (const auto& c : cols) {
                collist += "," + c;
                const auto& v = r.contains(c) ? r[c] : nlohmann::json(nullptr);
                if (v.is_null()) params.push_back("");
                else if (v.is_string()) params.push_back(v.get<std::string>());
                else params.push_back(v.dump());
            }
            std::string ph = "?";
            for (size_t i = 0; i < cols.size(); ++i) ph += ",?";
            Repo::exec(db(), "INSERT INTO " + table + "(" + collist + ") VALUES(" + ph + ")", params);
        }
    };
    cloneWithNewId("plan", "plan",
        {"side","seq","name","subtitle","method","groups","success_rate","effect","stars",
         "recommended","reason","advantage","note","adopted","confirmed"});
    cloneWithNewId("grp", "grp",
        {"plan_id","seq","name","optical","radar","electronic","comm","task_dir","cover_area",
         "task_attr","coop_rel","readiness","lng","lat"});
    cloneWithNewId("target", "t",
        {"target_no","name","type","threat","confidence","lng","lat","alt","source",
         "dynamic_state","status","strike_priority","value_tag","upgraded"});
    cloneWithNewId("link", "link",
        {"from_node","to_node","signal","bandwidth_mbps","latency_ms","loss_rate",
         "coverage_km2","mesh_progress","state"});

    // 修正 grp.plan_id 指向新任务的方案
    Repo::exec(db(), "UPDATE grp SET plan_id=REPLACE(plan_id, ?, ?) WHERE mission_id=?", {src, id, id});
    // 修正 target id 引用轨迹
    auto newTargets = Repo::query(db(), "SELECT id, target_no FROM target WHERE mission_id=?", {id});
    for (const auto& t : newTargets) {
        auto tracks = Repo::query(db(), "SELECT ts,lng,lat,speed,heading FROM target_track WHERE target_id=?",
                                  {src + "-t" + std::to_string(t.value("target_no", 0))});
        for (const auto& tr : tracks) {
            Repo::exec(db(), "INSERT INTO target_track(target_id,ts,lng,lat,speed,heading) VALUES(?,?,?,?,?,?)",
                       {t.value("id", ""), tr.value("ts", 0LL) ? std::to_string(tr["ts"].get<long long>()) : "0",
                        tr.value("lng", 0.0) ? tr["lng"].dump() : "0",
                        tr.value("lat", 0.0) ? tr["lat"].dump() : "0",
                        tr.value("speed", 0.0) ? tr["speed"].dump() : "0",
                        tr.value("heading", 0.0) ? tr["heading"].dump() : "0"});
        }
    }

    EventHub::instance().broadcast("mission.phase", {{"missionId", id}, {"phase", "T0"},
                                                     {"scenarioKey", key}, {"progress", 0}});
    EventHub::logEvent(id, "mission.created", {{"scenarioKey", key}});
    cb(ok(loadMission(id)));
}

void currentMission(const Req&, Cb cb) {
    auto m = loadMission("");
    if (m.empty()) { cb(ok(nlohmann::json::object())); return; }
    // 附场景与阶段标题
    auto sc = Repo::one(db(), "SELECT * FROM scenario WHERE key=?", {m.value("scenario_key", "")});
    m["scenario"] = sc;
    m["phaseTitle"] = phaseTitle(m.value("scenario_key", ""), m.value("phase", "T0"));
    cb(ok(m));
}

void missionDetail(const Req&, Cb cb, const std::string& id) {
    auto m = loadMission(id);
    if (m.empty()) { cb(fail(1004, "mission not found", drogon::k404NotFound)); return; }
    auto sc = Repo::one(db(), "SELECT * FROM scenario WHERE key=?", {m.value("scenario_key", "")});
    m["scenario"] = sc;
    m["phaseTitle"] = phaseTitle(m.value("scenario_key", ""), m.value("phase", "T0"));
    cb(ok(m));
}

void setPhase(const Req& req, Cb cb, const std::string& id) {
    const auto j = bodyJson(req);
    const std::string phase = sval(j, "phase");
    if (phase.empty()) { cb(fail(1000, "phase required")); return; }

    auto m = Repo::one(db(), "SELECT * FROM mission WHERE id=?", {id});
    if (m.empty()) { cb(fail(1004, "mission not found", drogon::k404NotFound)); return; }

    static const char* kOrder[] = {"T0","T1","T2","T3","T4","T5","T6","T7"};
    int idx = 0;
    for (int i = 0; i < 8; ++i) if (phase == kOrder[i]) idx = i;
    const int progress = static_cast<int>(idx * 100.0 / 7.0 + 0.5);

    if (!Repo::exec(db(), "UPDATE mission SET phase=?, progress=?, status='running' WHERE id=?",
                    {phase, std::to_string(progress), id})) {
        cb(fail(1005, "set phase failed", drogon::k500InternalServerError));
        return;
    }

    const std::string key = m.value("scenario_key", "");
    nlohmann::json payload;
    payload["missionId"] = id;
    payload["phase"] = phase;
    payload["scenarioKey"] = key;
    payload["prevPhase"] = m.value("phase", "T0");
    payload["progress"] = progress;
    payload["phaseTitle"] = phaseTitle(key, phase);

    EventHub::instance().broadcast("mission.phase", payload);
    EventHub::instance().broadcast("mission.progress",
        {{"missionId", id}, {"progress", progress}, {"phase", phase}, {"label", phaseTitle(key, phase)}});
    EventHub::logEvent(id, "mission.phase", payload);

    payload["status"] = "running";
    cb(ok(payload));
}

void resetMission(const Req&, Cb cb, const std::string& id) {
    if (!Repo::exec(db(), "UPDATE mission SET phase='T0', status='running', progress=0 WHERE id=?", {id})) {
        cb(fail(1005, "reset failed", drogon::k500InternalServerError));
        return;
    }
    auto m = loadMission(id);
    EventHub::instance().broadcast("mission.phase",
        {{"missionId", id}, {"phase", "T0"}, {"scenarioKey", m.value("scenario_key", "")}, {"progress", 0}});
    cb(ok(m));
}

// ---------------------------------------------------------------- §3.3
void uavs(const Req& req, Cb cb) {
    const std::string mid = resolveMissionId(req);
    auto rows = Repo::query(db(), "SELECT * FROM uav_resource WHERE mission_id=?", {mid});
    nlohmann::json data;
    nlohmann::json totals = nlohmann::json::object();
    nlohmann::json avail  = nlohmann::json::object();
    nlohmann::json alloc  = nlohmann::json::object();
    nlohmann::json pend   = nlohmann::json::object();
    for (const auto& r : rows) {
        const std::string t = r.value("type", "");
        totals[t] = r.value("total", 0);
        avail[t]  = r.value("available", 0);
        alloc[t]  = r.value("allocated", 0);
        pend[t]   = r.value("pending", 0);
    }
    data["items"] = rows;
    data["totals"] = totals;
    data["available"] = avail;
    data["allocated"] = alloc;
    data["pending"] = pend;
    long long t = 0, a = 0;
    for (auto it = totals.begin(); it != totals.end(); ++it) t += it.value().get<long long>();
    for (auto it = alloc.begin(); it != alloc.end(); ++it) a += it.value().get<long long>();
    data["allocatedTotal"] = a;
    data["totalAll"] = t;
    data["pendingTotal"] = t - a;
    data["onlineRate"] = rows.empty() ? 0 : rows[0].value("online_rate", 100);
    cb(ok(data));
}

void groups(const Req& req, Cb cb) {
    const std::string mid = resolveMissionId(req);
    cb(ok(Repo::query(db(), "SELECT * FROM grp WHERE mission_id=? ORDER BY seq", {mid})));
}

void generateGroups(const Req& req, Cb cb) {
    const auto j = bodyJson(req);
    const std::string mid = j.value("missionId", resolveMissionId(req));
    auto plans = Repo::query(db(), "SELECT id,recommended FROM plan WHERE mission_id=? AND side='group' ORDER BY seq", {mid});
    std::string recId;
    for (const auto& p : plans) if (p.value("recommended", 0) == 1) recId = p.value("id", "");
    EventHub::instance().broadcast("plan.state", {{"missionId", mid}, {"side", "group"},
                                                  {"action", "generated"}, {"recommendedId", recId}});
    cb(ok(plans));
}

void plans(const Req& req, Cb cb) {
    const std::string mid = resolveMissionId(req);
    const std::string side = req->getParameter("side");
    nlohmann::json rows;
    if (side.empty())
        rows = Repo::query(db(), "SELECT * FROM plan WHERE mission_id=? ORDER BY side,seq", {mid});
    else
        rows = Repo::query(db(), "SELECT * FROM plan WHERE mission_id=? AND side=? ORDER BY seq", {mid, side});
    cb(ok(rows));
}

void adoptPlan(const Req&, Cb cb, const std::string& id) {
    auto p = Repo::one(db(), "SELECT * FROM plan WHERE id=?", {id});
    if (p.empty()) { cb(fail(1004, "plan not found", drogon::k404NotFound)); return; }
    const std::string mid = p.value("mission_id", "");
    const std::string side = p.value("side", "group");

    // 互斥：同侧只能采用一个方案（TRD BIZ-12）
    Repo::exec(db(), "UPDATE plan SET adopted=0 WHERE mission_id=? AND side=?", {mid, side});
    if (!Repo::exec(db(), "UPDATE plan SET adopted=1 WHERE id=?", {id})) {
        cb(fail(1005, "adopt failed", drogon::k500InternalServerError));
        return;
    }
    // 同步方案下的集群到 grp.plan_id（编组侧）
    if (side == "group") {
        Repo::exec(db(), "UPDATE grp SET plan_id=? WHERE mission_id=?", {id, mid});
    }
    EventHub::instance().broadcast("plan.state", {{"missionId", mid}, {"side", side},
                                                  {"planId", id}, {"action", "adopted"}});
    EventHub::logEvent(mid, "plan.adopted", {{"planId", id}, {"side", side}});
    cb(ok(Repo::one(db(), "SELECT * FROM plan WHERE id=?", {id})));
}

void optimizePlan(const Req&, Cb cb, const std::string& id) {
    auto p = Repo::one(db(), "SELECT * FROM plan WHERE id=?", {id});
    if (p.empty()) { cb(fail(1004, "plan not found", drogon::k404NotFound)); return; }
    // 演示级优化：成功率 +3（上限 99），并记录一次优化事件
    const int rate = std::min(99, p.value("success_rate", 0) + 3);
    Repo::exec(db(), "UPDATE plan SET success_rate=? WHERE id=?", {id, std::to_string(rate)});
    const std::string mid = p.value("mission_id", "");
    EventHub::instance().broadcast("plan.state", {{"missionId", mid},
                                                  {"side", p.value("side", "group")},
                                                  {"planId", id}, {"action", "optimized"}});
    cb(ok(Repo::one(db(), "SELECT * FROM plan WHERE id=?", {id})));
}

void confirmPlan(const Req&, Cb cb, const std::string& id) {
    auto p = Repo::one(db(), "SELECT * FROM plan WHERE id=?", {id});
    if (p.empty()) { cb(fail(1004, "plan not found", drogon::k404NotFound)); return; }
    if (p.value("confirmed", 0) == 1) { cb(fail(1002, "正在执行/已执行")); return; }
    if (!Repo::exec(db(), "UPDATE plan SET confirmed=1, adopted=1 WHERE id=?", {id})) {
        cb(fail(1005, "confirm failed", drogon::k500InternalServerError));
        return;
    }
    const std::string mid = p.value("mission_id", "");
    EventHub::instance().broadcast("plan.state", {{"missionId", mid},
                                                  {"side", p.value("side", "strike")},
                                                  {"planId", id}, {"action", "confirmed"}});
    EventHub::logEvent(mid, "plan.confirmed", {{"planId", id}});
    cb(ok(Repo::one(db(), "SELECT * FROM plan WHERE id=?", {id})));
}

// ---------------------------------------------------------------- §3.4
void linkTopology(const Req& req, Cb cb) {
    const std::string mid = resolveMissionId(req);
    auto links = Repo::query(db(), "SELECT * FROM link WHERE mission_id=?", {mid});
    nlohmann::json nodes = nlohmann::json::array();
    nlohmann::json seen = nlohmann::json::object();
    auto push = [&](const std::string& name, const std::string& kind) {
        if (seen.contains(name)) return;
        seen[name] = true;
        nodes.push_back({{"id", name}, {"name", name}, {"kind", kind}});
    };
    for (const auto& l : links) {
        const std::string a = l.value("from_node", "");
        const std::string b = l.value("to_node", "");
        auto kindOf = [](const std::string& n) {
            if (n.find("云端") != std::string::npos) return "cloud";
            if (n.find("边缘") != std::string::npos) return "edge";
            if (n.find("前沿") != std::string::npos) return "forward";
            return "group";
        };
        push(a, kindOf(a));
        push(b, kindOf(b));
    }
    nlohmann::json data;
    data["nodes"] = nodes;
    data["edges"] = links;
    cb(ok(data));
}

void linkMetrics(const Req& req, Cb cb) {
    cb(ok(linkMetricsJson(resolveMissionId(req))));
}

void optimizeLink(const Req& req, Cb cb) {
    const auto j = bodyJson(req);
    const std::string mid = j.value("missionId", resolveMissionId(req));
    // 演示级优化：全部链路转 green，组网进度 +20（上限 100），指标改善
    Repo::exec(db(), "UPDATE link SET state='green', signal='strong', bandwidth_mbps=bandwidth_mbps*1.12, "
                     "latency_ms=latency_ms*0.72, mesh_progress=MIN(100, mesh_progress+20) WHERE mission_id=?", {mid});
    auto l = Repo::one(db(), "SELECT * FROM link WHERE mission_id=? LIMIT 1", {mid});
    EventHub::instance().broadcast("telemetry.link.quality",
        {{"missionId", mid}, {"meshProgress", l.value("mesh_progress", 100)}, {"state", "green"}});
    cb(ok(linkMetricsJson(mid)));
}

void linkCurves(const Req& req, Cb cb) {
    const std::string mid = resolveMissionId(req);
    // 生成带宽提升 / 时延降低两条曲线（优化后形态，演示数据）
    nlohmann::json bandwidth = nlohmann::json::array();
    nlohmann::json latency = nlohmann::json::array();
    const long long base = Repo::nowMs() - 15 * 60 * 1000;
    for (int i = 0; i <= 15; ++i) {
        const double t = i / 15.0;
        const double bw = 46 + 46 * (1.0 - std::exp(-3.2 * t));
        const double lt = 110 * std::exp(-2.8 * t) + 22;
        bandwidth.push_back({{"ts", base + i * 60000LL}, {"value", std::round(bw * 10) / 10}});
        latency.push_back({{"ts", base + i * 60000LL}, {"value", std::round(lt * 10) / 10}});
    }
    nlohmann::json data;
    data["bandwidth"] = bandwidth;
    data["latency"] = latency;
    cb(ok(data));
}

// ---------------------------------------------------------------- §3.5
void targets(const Req& req, Cb cb) {
    const std::string mid = resolveMissionId(req);
    cb(ok(Repo::query(db(), "SELECT * FROM target WHERE mission_id=? ORDER BY target_no", {mid})));
}

void targetDetail(const Req&, Cb cb, const std::string& id) {
    auto t = Repo::one(db(), "SELECT * FROM target WHERE id=?", {id});
    if (t.empty()) { cb(fail(1004, "target not found", drogon::k404NotFound)); return; }
    // AI 分析（演示级规则：AI-02/AI-03）
    nlohmann::json ai;
    const std::string type = t.value("type", "");
    ai["typeJudgement"] = type;
    ai["behavior"] = type.find("指挥") != std::string::npos ? "持续通信活动" : "间歇活动";
    ai["threatLevel"] = t.value("threat", "mid");
    ai["activity"] = t.value("dynamic_state", "");
    ai["suggestion"] = t.value("threat", "mid") == "high" ? "升级为打击目标" : "交由集群重点监视";
    ai["strikeWindow"] = "预计 12 分 32 秒后出现暴露窗口";
    ai["confidence"] = t.value("confidence", 0);
    t["ai"] = ai;
    cb(ok(t));
}

void targetTrack(const Req&, Cb cb, const std::string& id) {
    cb(ok(Repo::query(db(), "SELECT * FROM target_track WHERE target_id=? ORDER BY ts", {id})));
}

void targetAction(const Req&, Cb cb, const std::string& id, const std::string& action) {
    auto t = Repo::one(db(), "SELECT * FROM target WHERE id=?", {id});
    if (t.empty()) { cb(fail(1004, "target not found", drogon::k404NotFound)); return; }
    const std::string mid = t.value("mission_id", "");

    if (action == "strike" || action == "upgrade") {
        if (action == "upgrade" && t.value("upgraded", 0) == 1) { cb(fail(1002, "正在执行/已执行")); return; }
        Repo::exec(db(), "UPDATE target SET upgraded=1, strike_priority=1, value_tag='高价值' WHERE id=?", {id});
        EventHub::instance().broadcast("target.state",
            {{"targetId", id}, {"targetNo", t.value("target_no", 0)}, {"upgraded", 1}});
        EventHub::logEvent(mid, "target." + action, {{"targetId", id}});
    } else if (action == "track") {
        EventHub::instance().broadcast("ai.event",
            {{"level", "info"}, {"title", "持续跟踪"},
             {"text", "已开始持续跟踪 " + t.value("name", "")}, {"speak", false}});
    } else if (action == "watch") {
        EventHub::instance().broadcast("ai.event",
            {{"level", "info"}, {"title", "重点监视"},
             {"text", "已交由集群重点监视 " + t.value("name", "")}, {"speak", false}});
    }
    cb(ok(Repo::one(db(), "SELECT * FROM target WHERE id=?", {id})));
}

// ---------------------------------------------------------------- §3.6
void executionStatus(const Req& req, Cb cb) {
    const std::string mid = resolveMissionId(req);
    auto m = Repo::one(db(), "SELECT progress FROM mission WHERE id=?", {mid});
    nlohmann::json data;
    data["trackingStability"] = 87;
    data["hitProbability"] = 84;
    data["hitProbabilityTrend"] = "up";
    data["deviationM"] = 12;
    data["positionCorrecting"] = true;
    data["coopLink"] = {{"fireLink", "稳定"}, {"radar", "持续校正"}, {"electronic", "正常"}};
    data["sync"] = {{"targetPosition", "实时更新"}, {"fireGuide", "已同步"}, {"deviationFix", "已生成"}};
    data["attackTiming"] = {{"adjusting", true}, {"label", "边缘节点自主调整中"},
                            {"slots", nlohmann::json::array({"16:08", "16:12", "16:16", "16:20"})}};
    data["taskProgress"] = m.value("progress", 0);
    cb(ok(data));
}

void guide(const Req& req, Cb cb) {
    const auto j = bodyJson(req);
    const std::string mid = j.value("missionId", resolveMissionId(req));
    nlohmann::json payload;
    payload["missionId"] = mid;
    payload["text"] = "已确认引导，火力引导信息同步完成。";
    EventHub::instance().broadcast("ai.event",
        {{"level", "info"}, {"title", "确认引导"}, {"text", payload["text"]}, {"speak", true}});
    EventHub::logEvent(mid, "execution.guide", payload);
    cb(ok(payload));
}

void replan(const Req& req, Cb cb) {
    const auto j = bodyJson(req);
    const std::string mid = j.value("missionId", resolveMissionId(req));
    nlohmann::json payload;
    payload["missionId"] = mid;
    payload["text"] = "已重新规划，避开威胁区域并生成新的协同路线。";
    EventHub::instance().broadcast("ai.event",
        {{"level", "warn"}, {"title", "重新规划"}, {"text", payload["text"]}, {"speak", true}});
    EventHub::logEvent(mid, "execution.replan", payload);
    cb(ok(payload));
}

// ---------------------------------------------------------------- §3.7
void assessment(const Req& req, Cb cb) {
    const std::string mid = resolveMissionId(req);
    auto a = Repo::one(db(), "SELECT * FROM assessment WHERE mission_id=?", {mid});
    if (a.empty()) { cb(ok(nlohmann::json::object())); return; }
    a["targetResults"] = Repo::query(db(),
        "SELECT tr.target_id, tr.result, t.target_no, t.name, t.type FROM target_result tr "
        "JOIN target t ON t.id=tr.target_id WHERE tr.mission_id=? ORDER BY t.target_no", {mid});
    a["metrics"] = Repo::one(db(), "SELECT * FROM mission_metrics WHERE mission_id=?", {mid});
    cb(ok(a));
}

void reports(const Req& req, Cb cb) {
    const std::string mid = req->getParameter("missionId");
    if (mid.empty())
        cb(ok(Repo::query(db(), "SELECT * FROM report ORDER BY created_at DESC")));
    else
        cb(ok(Repo::query(db(), "SELECT * FROM report WHERE mission_id=? ORDER BY created_at DESC", {mid})));
}

void createReport(const Req& req, Cb cb) {
    const auto j = bodyJson(req);
    const std::string mid = j.value("missionId", resolveMissionId(req));
    auto m = Repo::one(db(), "SELECT * FROM mission WHERE id=?", {mid});
    if (m.empty()) { cb(fail(1004, "mission not found", drogon::k404NotFound)); return; }

    auto metrics = Repo::one(db(), "SELECT * FROM mission_metrics WHERE mission_id=?", {mid});
    auto assess  = Repo::one(db(), "SELECT * FROM assessment WHERE mission_id=?", {mid});

    const std::string id = Repo::newId("rep");
    const std::string reportNo = "MT-" + Repo::nowString().substr(0, 10)
        + "-" + std::to_string(Repo::nowMs() % 10000);

    // 生成 HTML 报告文件（浏览器可直接打印为 PDF；jsPDF 为前端可选增强）
    const auto& cfg = Config::instance();
    std::error_code ec;
    std::filesystem::create_directories(cfg.reportsDir, ec);
    const std::string fname = reportNo + ".html";
    const std::string fpath = cfg.reportsDir + "/" + fname;

    nlohmann::json doc;
    doc["reportNo"] = reportNo;
    doc["mission"] = m;
    doc["metrics"] = metrics;
    doc["assessment"] = assess;
    doc["generatedAt"] = Repo::nowString();

    std::string html;
    html += "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">";
    html += "<title>任务报告 " + reportNo + "</title>";
    html += "<style>body{font-family:'Microsoft YaHei',sans-serif;background:#fff;color:#111;margin:40px}"
            "h1{font-size:22px}h2{font-size:16px;margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:6px}"
            "table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #ccc;padding:6px 10px;font-size:13px;text-align:left}"
            ".kv td:first-child{width:200px;background:#f6f8fa}</style></head><body>";
    html += "<h1>智能任务管理系统 · 任务报告</h1>";
    html += "<table class=\"kv\">";
    html += "<tr><td>报告编号</td><td>" + reportNo + "</td></tr>";
    html += "<tr><td>任务编号</td><td>" + m.value("task_no", "") + "</td></tr>";
    html += "<tr><td>任务名称</td><td>" + m.value("task_name", "") + "</td></tr>";
    html += "<tr><td>任务区域</td><td>" + m.value("task_region", "") + "</td></tr>";
    html += "<tr><td>生成时间</td><td>" + Repo::nowString() + "</td></tr>";
    html += "</table>";
    html += "<h2>任务指标</h2><table><tr><th>指标</th><th>数值</th></tr>";
    auto kv = [&](const char* label, const nlohmann::json& v) {
        html += "<tr><td>" + std::string(label) + "</td><td>" +
                (v.is_null() ? std::string("—") : (v.is_string() ? v.get<std::string>() : v.dump())) +
                "</td></tr>";
    };
    kv("搜索覆盖率(%)", metrics["coverage_rate"]);
    kv("目标发现数量", metrics["targets_found"]);
    kv("集群协同效率(%)", metrics["coop_efficiency"]);
    kv("链路稳定性(%)", metrics["link_stability"]);
    kv("局部组网时长(秒)", metrics["mesh_duration_sec"]);
    kv("风险预警次数", metrics["alert_count"]);
    kv("任务存活率(%)", metrics["survival_rate"]);
    html += "</table>";
    html += "<h2>毁伤/效果评估</h2><table><tr><th>项</th><th>数值</th></tr>";
    kv("总体毁伤率(%)", assess["total_damage_rate"]);
    kv("被摧毁", assess["destroyed"]);
    kv("重创", assess["severe"]);
    kv("受损", assess["damaged"]);
    kv("完好", assess["intact"]);
    html += "</table>";
    html += "<p style=\"margin-top:32px;color:#888;font-size:12px\">本报告由智能任务管理系统自动生成 · 演示数据</p>";
    html += "</body></html>";

    std::ofstream out(fpath, std::ios::binary);
    if (!out) { cb(fail(1005, "write report failed", drogon::k500InternalServerError)); return; }
    out << html;
    out.close();

    Repo::exec(db(), "INSERT INTO report(id,mission_id,report_no,path,created_at) VALUES(?,?,?,?,?)",
               {id, mid, reportNo, "/reports/" + fname, Repo::nowString()});
    Repo::exec(db(), "UPDATE mission SET status='finished', phase='T7', progress=100, finished_at=?, duration_sec=? WHERE id=?",
               {Repo::nowString(), std::to_string(2 * 3600 + 47 * 60 + 36), mid});

    EventHub::instance().broadcast("mission.progress",
        {{"missionId", mid}, {"progress", 100}, {"phase", "T7"}, {"label", "任务完成"}});
    EventHub::logEvent(mid, "report.created", {{"reportNo", reportNo}});
    cb(ok(Repo::one(db(), "SELECT * FROM report WHERE id=?", {id})));
}

// ---------------------------------------------------------------- §3.8
void aiChat(const Req& req, Cb cb) {
    const auto j = bodyJson(req);
    if (j.empty()) { cb(fail(1000, "empty body")); return; }
    proxyToAi("/chat", j.dump(), [cb](const drogon::HttpResponsePtr& r) { cb(r); });
}

void aiStt(const Req& req, Cb cb) {
    // 转发原始字节到 Python 桥 /stt
    const std::string body = bodyString(req);
    const auto& cfg = Config::instance();
    auto client = drogon::HttpClient::newHttpClient("http://" + cfg.aiBridgeHost + ":" +
                                                    std::to_string(cfg.aiBridgePort));
    auto r = drogon::HttpRequest::newHttpRequest();
    r->setMethod(drogon::Post);
    r->setPath("/stt");
    r->setContentTypeCode(drogon::CT_APPLICATION_OCTET_STREAM);
    r->setBody(body);
    client->sendRequest(r, [cb](drogon::ReqResult res, const drogon::HttpResponsePtr& resp) {
        if (res != drogon::ReqResult::Ok || !resp) { cb(fail(2001, "AI bridge unavailable")); return; }
        cb(resp);
    }, 60.0);
}

void aiTts(const Req& req, Cb cb) {
    const auto j = bodyJson(req);
    proxyToAiBinary("/tts", j.dump(), std::move(cb));
}

void aiHealth(const Req&, Cb cb) {
    // 桥的 /health 是 GET，不能用 proxyToAi（POST）
    const auto& cfg = Config::instance();
    auto client = drogon::HttpClient::newHttpClient("http://" + cfg.aiBridgeHost + ":" +
                                                    std::to_string(cfg.aiBridgePort));
    auto r = drogon::HttpRequest::newHttpRequest();
    r->setMethod(drogon::Get);
    r->setPath("/health");
    client->sendRequest(r, [cb](drogon::ReqResult res, const drogon::HttpResponsePtr& resp) {
        if (res != drogon::ReqResult::Ok || !resp || resp->getStatusCode() != drogon::k200OK) {
            cb(fail(2001, "AI bridge unavailable"));
            return;
        }
        try {
            auto j = nlohmann::json::parse(std::string(resp->body()));
            nlohmann::json env;
            env["code"] = 0;
            env["message"] = "ok";
            env["data"] = j;
            auto out = drogon::HttpResponse::newHttpResponse();
            out->setStatusCode(drogon::k200OK);
            out->setContentTypeCode(drogon::CT_APPLICATION_JSON);
            out->setBody(env.dump());
            cb(out);
        } catch (...) {
            cb(fail(2002, "AI bridge returned non-JSON"));
        }
    }, 20.0);
}

// ---------------------------------------------------------------- §3.9
void videos(const Req&, Cb cb) {
    const auto& cfg = Config::instance();
    nlohmann::json arr = nlohmann::json::array();
    std::error_code ec;
    if (std::filesystem::exists(cfg.mediaDir, ec)) {
        for (const auto& e : std::filesystem::directory_iterator(cfg.mediaDir, ec)) {
            if (!e.is_regular_file()) continue;
            const std::string ext = e.path().extension().string();
            if (ext == ".mp4" || ext == ".webm") {
                arr.push_back({{"name", e.path().stem().string()},
                               {"url", "/media/" + e.path().filename().string()}});
            }
        }
    }
    cb(ok(arr));
}

}  // namespace api
}  // namespace mapapp
