// Seed.cc —— 演示数据播种
//
// 数值口径严格取自《开发接口契约规格书》§7.5（演示数据，非指标）与 §7.3/§7.4（方案名逐字一致）。
// 场景一：光电48/雷达32/电子28/通信24，编组资源 124/132
// 场景二：光电22/雷达12/电子10/通信 8
#include "core/Seed.h"

#include <chrono>
#include <cstdio>
#include <iostream>
#include <mutex>
#include <string>

#include <sqlite3.h>

#include "core/Database.h"

namespace mapapp {
namespace {

sqlite3* db() { return Database::instance().raw(); }

bool exec(const std::string& sql) {
    char* err = nullptr;
    if (sqlite3_exec(db(), sql.c_str(), nullptr, nullptr, &err) != SQLITE_OK) {
        std::cerr << "[seed] SQL failed: " << (err ? err : "?") << "\n  SQL: " << sql << std::endl;
        if (err) sqlite3_free(err);
        return false;
    }
    return true;
}

std::string q(const std::string& s) {  // 简易单引号转义
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        if (c == '\'') out += "''";
        else out += c;
    }
    return "'" + out + "'";
}

long long nowMs() {
    using namespace std::chrono;
    return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
}

bool isEmpty() {
    sqlite3_stmt* st = nullptr;
    int n = 0;
    if (sqlite3_prepare_v2(db(), "SELECT COUNT(*) FROM scenario", -1, &st, nullptr) == SQLITE_OK) {
        if (sqlite3_step(st) == SQLITE_ROW) n = sqlite3_column_int(st, 0);
        sqlite3_finalize(st);
    }
    return n == 0;
}

// ---------------------------------------------------------------- 场景一
bool seedScenario1() {
    const std::string M = "m-s1";
    const std::string S = "scenario-1";

    if (!exec("INSERT INTO scenario(key,name,subtitle,features,region,task_region,task_type,voice_mode,recommended,sort) VALUES("
              + q(S) + "," + q("敏捷拒止布控") + "," + q("快速布设防御，阻断敌方推进") + "," +
              q("前沿局部组网、侦察覆盖、电子压制、固定通信受限下自主运行") + "," +
              q("山区/城镇/交通节点混合区域") + "," + q("西南方向山区") + "," + q("侦察 / 打击") + "," +
              q("ball") + ",1,1)")) return false;

    if (!exec("INSERT INTO mission(id,scenario_key,task_no,task_name,task_type,task_region,source,phase,status,progress,received_at) VALUES("
              + q(M) + "," + q(S) + "," + q("M20260610-01") + "," + q("敏捷拒止布控（演示）") + "," +
              q("侦察 / 打击") + "," + q("西南方向山区") + "," + q("上级指派") + "," +
              q("T0") + "," + q("ready") + ",0," + q("2026-06-10 15:14:00") + ")")) return false;

    // 四型资源：总数/已分配/待分配（契约 §7.5）
    struct R { const char* type; int total; int alloc; int pend; const char* tags; };
    const R rs[] = {
        {"optical",    48, 34, 14, "侦察 / 识别 / 跟踪"},
        {"radar",      32, 20, 12, "探测 / 扫描 / 跟踪"},
        {"electronic", 28, 18, 10, "干扰 / 压制 / 侦察"},
        {"comm",       24, 16,  8, "中继 / 通信 / 数据"},
    };
    for (const auto& r : rs) {
        if (!exec("INSERT INTO uav_resource(mission_id,type,total,available,allocated,pending,ability_tags,online_rate) VALUES("
                  + q(M) + "," + q(r.type) + "," + std::to_string(r.total) + "," +
                  std::to_string(r.total) + "," + std::to_string(r.alloc) + "," +
                  std::to_string(r.pend) + "," + q(r.tags) + ",92)")) return false;
    }

    // 三套编组方案（契约 §7.3 方案名逐字）—— groups 字段存集群名 JSON 数组
    struct P { int seq; const char* name; const char* subtitle; const char* groups; int rate;
               const char* effect; int rec; const char* reason; };
    const P ps[] = {
        {1, "方案一｜稳态侦察覆盖方案", "5 个任务集群",
         R"(["侦察集群1","侦察集群2","通信中继集群","电子侦察集群","预备支援集群"])", 74,
         "稳定侦察覆盖", 0, "以稳定侦察覆盖为主，适合通信受限条件下的持续态势保持。"},
        {2, "方案二｜多域协同压制方案", "6 个任务集群",
         R"(["前出侦察集群","侧翼侦察集群","雷达探测集群","通信中继集群","电子压制集群","机动预备集群"])", 82,
         "压制摧毁", 1,
         "兼顾大范围侦察覆盖、通信中继保障和电子压制需求；适合当前山区、城镇、交通节点混合区域作战环境；可支撑多方向同步侦察和重点目标持续跟踪；具备较强链路冗余和任务容错能力。"},
        {3, "方案三｜重点区域突破方案", "4 个任务集群",
         R"(["重点侦察集群","目标跟踪集群","通信保障集群","电子干扰集群"])", 71,
         "重点突破", 0, "集中资源于重点区域，适合目标明确的快速突破。"},
    };
    for (const auto& p : ps) {
        std::string id = M + "-plan-g" + std::to_string(p.seq);
        if (!exec("INSERT INTO plan(id,mission_id,side,seq,name,subtitle,groups,recommended,reason,effect,success_rate,stars,advantage,note) VALUES("
                  + q(id) + "," + q(M) + "," + q("group") + "," + std::to_string(p.seq) + "," +
                  q(p.name) + "," + q(p.subtitle) + "," + q(p.groups) + "," +
                  std::to_string(p.rec) + "," + q(p.reason) + "," + q(p.effect) + "," +
                  std::to_string(p.rate) + "," + std::to_string(p.seq == 2 ? 5 : 3) + "," +
                  q("大范围区域覆盖，提高整体态势感知能力|通信中继保障稳定，支撑多域协同作战|多方向侦察协同，增强目标发现效率|电子压制能力突出，压制敌方关键节点") + "," +
                  q("本方案已通过智能评估，建议直接确认编组并执行任务。") + ")")) return false;
    }

    // 方案二 6 集群（四型配比 + 任务方向/属性/协同关系）
    struct G { int seq; const char* name; int o; int r; int e; int c;
               const char* dir; const char* attr; const char* coop; };
    const G gs[] = {
        {1, "前出侦察集群", 6, 3, 2, 1, "前出侦察", "远程侦察 / 目标发现", "直接上报"},
        {2, "侧翼侦察集群", 5, 2, 2, 1, "侧翼侦察", "侧翼侦察 / 威胁感知", "数据共享"},
        {3, "雷达探测集群", 0, 5, 1, 1, "广域探测", "雷达探测 / 跟踪定位", "信息支撑"},
        {4, "通信中继集群", 2, 1, 2, 6, "通信中继", "通信中继 / 链路保障", "链路保障"},
        {5, "电子压制集群", 1, 2, 7, 1, "电子压制", "电子压制 / 干扰压制", "掩护保障"},
        {6, "机动预备集群", 4, 2, 2, 2, "机动待命", "机动待命 / 快速支援", "快速响应"},
    };
    for (const auto& g : gs) {
        std::string id = M + "-grp-" + std::to_string(g.seq);
        if (!exec("INSERT INTO grp(id,mission_id,plan_id,seq,name,optical,radar,electronic,comm,task_dir,cover_area,task_attr,coop_rel,readiness,lng,lat) VALUES("
                  + q(id) + "," + q(M) + "," + q(M + "-plan-g2") + "," + std::to_string(g.seq) + "," +
                  q(g.name) + "," + std::to_string(g.o) + "," + std::to_string(g.r) + "," +
                  std::to_string(g.e) + "," + std::to_string(g.c) + "," + q(g.dir) + "," +
                  q("已圈定任务区") + "," + q(g.attr) + "," + q(g.coop) + "," +
                  std::to_string(86 + g.seq) + ",0,0)")) return false;
    }

    // 打击方案（T5）
    struct SP { int seq; const char* name; const char* method; const char* groups; int rate; const char* effect; int rec; };
    const SP sps[] = {
        {1, "方案一 光电精确打击", "精确打击", R"(["集群2（光电）"])", 68, "精准摧毁", 0},
        {2, "方案二 多集群协同压制", "协同压制", R"(["集群1","集群2","集群3","集群4","集群5","集群6"])", 82, "压制摧毁", 1},
        {3, "方案三 电子干扰配合", "电子干扰+打击", R"(["集群4（电子）","集群5（通信）"])", 61, "干扰瘫痪后打击", 0},
    };
    for (const auto& p : sps) {
        std::string id = M + "-plan-s" + std::to_string(p.seq);
        if (!exec("INSERT INTO plan(id,mission_id,side,seq,name,method,groups,recommended,effect,success_rate,stars) VALUES("
                  + q(id) + "," + q(M) + "," + q("strike") + "," + std::to_string(p.seq) + "," +
                  q(p.name) + "," + q(p.method) + "," + q(p.groups) + "," +
                  std::to_string(p.rec) + "," + q(p.effect) + "," + std::to_string(p.rate) + "," +
                  std::to_string(p.seq == 2 ? 5 : 3) + ")")) return false;
    }

    // 目标台账：5 个（演示数据）。type 三型；高价值红标
    struct T { int no; const char* name; const char* type; const char* threat; int conf;
               double dlng; double dlat; const char* src; const char* dyn; const char* vtag; int prio; };
    const T ts[] = {
        {1, "目标001", "防空火力阵地",   "mid",  86,  0.052,  0.031, "光电", "部署中",   "",       2},
        {2, "目标002", "机动指挥节点",   "high", 92,  0.018, -0.026, "融合", "机动中",   "高价值", 1},
        {3, "目标003", "通信保障节点",   "mid",  88, -0.041, -0.012, "融合", "活跃",     "",       3},
        {4, "目标004", "机动指挥节点",   "mid",  81, -0.020,  0.044, "雷达", "转移中",   "",       4},
        {5, "目标005", "防空火力阵地",   "low",  76,  0.061, -0.048, "电子", "短暂停留", "",       5},
    };
    for (const auto& t : ts) {
        std::string id = M + "-t" + std::to_string(t.no);
        char lng[32], lat[32], alt[32];
        snprintf(lng, sizeof lng, "%.6f", 116.3974 + t.dlng);
        snprintf(lat, sizeof lat, "%.6f", 39.9093 + t.dlat);
        snprintf(alt, sizeof alt, "%d", 1180 + t.no * 27);
        if (!exec("INSERT INTO target(id,mission_id,target_no,name,type,threat,confidence,lng,lat,alt,source,dynamic_state,status,strike_priority,value_tag,upgraded) VALUES("
                  + q(id) + "," + q(M) + "," + std::to_string(t.no) + "," + q(t.name) + "," +
                  q(t.type) + "," + q(t.threat) + "," + std::to_string(t.conf) + "," +
                  std::string(lng) + "," + std::string(lat) + "," + std::string(alt) + "," +
                  q(t.src) + "," + q(t.dyn) + "," + q("red") + "," + std::to_string(t.prio) + "," +
                  q(t.vtag) + ",0)")) return false;
    }

    // 链路：6 集群网状 + 前沿指挥节点接入
    const std::string fwd = "前沿指挥节点";
    const char* n1 = "前出侦察集群"; const char* n2 = "侧翼侦察集群";
    const char* n3 = "雷达探测集群"; const char* n4 = "通信中继集群";
    const char* n5 = "电子压制集群"; const char* n6 = "机动预备集群";
    struct L { const char* a; const char* b; const char* st; };
    const L ls[] = {
        {n1, n2, "green"}, {n1, n3, "green"}, {n1, fwd.c_str(), "green"},
        {n2, n4, "green"}, {n2, n6, "yellow"}, {n3, n4, "green"},
        {n3, n5, "green"}, {n4, n5, "green"}, {n4, n6, "green"},
        {n5, n6, "yellow"}, {n5, fwd.c_str(), "yellow"}, {n6, fwd.c_str(), "yellow"},
    };
    int li = 0;
    for (const auto& l : ls) {
        std::string id = M + "-link-" + std::to_string(++li);
        if (!exec("INSERT INTO link(id,mission_id,from_node,to_node,signal,bandwidth_mbps,latency_ms,loss_rate,coverage_km2,mesh_progress,state) VALUES("
                  + q(id) + "," + q(M) + "," + q(l.a) + "," + q(l.b) + "," +
                  q(l.st[0] == 'g' ? "strong" : "mid") + ",82,38,0.3,126,78," + q(l.st) + ")")) return false;
    }

    // 编组概况基线
    if (!exec("INSERT INTO mission_metrics(mission_id,coverage_rate,targets_found,coop_efficiency,link_stability,mesh_duration_sec,alert_count,resource_used,survival_rate) VALUES("
              + q(M) + ",93,5,91,96,2280,3," +
              q(R"({"optical":48,"radar":32,"electronic":28,"comm":24})") + ",89)")) return false;

    if (!exec("INSERT INTO assessment(mission_id,total_damage_rate,destroyed,severe,damaged,intact,area_control,effect_metrics) VALUES("
              + q(M) + ",83,3,1,1,1,68," +
              q(R"({"linkStability":91,"edgeExecRate":87,"coopEfficiency":78,"taskCompletion":66})") + ")")) return false;

    return true;
}

// ---------------------------------------------------------------- 场景二
bool seedScenario2() {
    const std::string M = "m-s2";
    const std::string S = "scenario-2";

    if (!exec("INSERT INTO scenario(key,name,subtitle,features,region,task_region,task_type,voice_mode,recommended,sort) VALUES("
              + q(S) + "," + q("集群协同攻击") + "," + q("无人集群协同，精准打击目标") + "," +
              q("云边端协同、边缘自治与断链自主运行、多集群并行执行") + "," +
              q("沿海重点方向") + "," + q("沿海重点方向") + "," + q("侦察 / 打击") + "," +
              q("inline") + ",0,2)")) return false;

    if (!exec("INSERT INTO mission(id,scenario_key,task_no,task_name,task_type,task_region,source,phase,status,progress,received_at) VALUES("
              + q(M) + "," + q(S) + "," + q("M20260610-02") + "," + q("集群协同攻击（演示）") + "," +
              q("侦察 / 打击") + "," + q("沿海重点方向") + "," + q("上级指派") + "," +
              q("T0") + "," + q("ready") + ",0," + q("2026-06-10 15:14:00") + ")")) return false;

    // 资源：22 / 12 / 10 / 8
    struct R { const char* type; int total; const char* tags; };
    const R rs[] = {
        {"optical",    22, "侦察 / 识别 / 跟踪"},
        {"radar",      12, "探测 / 扫描 / 跟踪"},
        {"electronic", 10, "干扰 / 压制 / 侦察"},
        {"comm",        8, "中继 / 通信 / 数据"},
    };
    for (const auto& r : rs) {
        if (!exec("INSERT INTO uav_resource(mission_id,type,total,available,allocated,pending,ability_tags,online_rate) VALUES("
                  + q(M) + "," + q(r.type) + "," + std::to_string(r.total) + "," +
                  std::to_string(r.total) + "," + std::to_string(r.total) + ",0," + q(r.tags) + ",100)")) return false;
    }

    // 三套编组方案（契约 §7.4 方案名逐字）
    struct P { int seq; const char* name; const char* subtitle; const char* groups; int rate; int rec; const char* reason; };
    const P ps[] = {
        {1, "方案一｜分布式稳态感知", "持续态势回传 / 稳定侦察覆盖",
         R"(["分布式感知集群1","分布式感知集群2","通信中继集群","边缘处理集群","机动预备集群"])", 76, 0,
         "以持续态势回传与稳定侦察覆盖为主，适合长时监视。"},
        {2, "方案二｜云边协同自适应攻击", "6 个任务集群",
         R"(["前出侦察集群","侧向感知集群","雷达探测集群","边缘协同处理集群","电子对抗集群","机动执行集群"])", 88, 1,
         "边缘节点支持实时融合|云端提供全局优化|前沿集群可自主执行|适配多目标动态变化"},
        {3, "方案三｜集中式快速压制", "局部集中调度 / 快速压制目标",
         R"(["集中侦察集群","集中打击集群","通信保障集群","机动预备集群"])", 73, 0,
         "局部集中调度，快速形成局部优势。"},
    };
    for (const auto& p : ps) {
        std::string id = M + "-plan-g" + std::to_string(p.seq);
        if (!exec("INSERT INTO plan(id,mission_id,side,seq,name,subtitle,groups,recommended,reason,success_rate,stars) VALUES("
                  + q(id) + "," + q(M) + "," + q("group") + "," + std::to_string(p.seq) + "," +
                  q(p.name) + "," + q(p.subtitle) + "," + q(p.groups) + "," + std::to_string(p.rec) + "," +
                  q(p.reason) + "," + std::to_string(p.rate) + "," +
                  std::to_string(p.seq == 2 ? 5 : 3) + ")")) return false;
    }

    // 方案二 6 集群（逐集群四型配比，契约 §7.4/界面图）
    struct G { int seq; const char* name; int o; int r; int e; int c; const char* dir; const char* attr; const char* coop; };
    const G gs[] = {
        {1, "前出侦察集群",     6, 3, 2, 1, "集群协同攻击", "前沿侦察，目标发现", "已联动"},
        {2, "侧向感知集群",     5, 2, 2, 1, "集群协同攻击", "侧向覆盖，补盲感知", "已联动"},
        {3, "雷达探测集群",     0, 5, 1, 1, "集群协同攻击", "广域探测，跟踪定位", "已联动"},
        {4, "边缘协同处理集群", 3, 1, 2, 2, "集群协同攻击", "数据融合，本地处理", "已联动"},
        {5, "电子对抗集群",     1, 0, 3, 1, "集群协同攻击", "信号干扰，电磁压制", "已联动"},
        {6, "机动执行集群",     7, 1, 0, 2, "集群协同攻击", "快速机动，任务执行", "已联动"},
    };
    for (const auto& g : gs) {
        std::string id = M + "-grp-" + std::to_string(g.seq);
        if (!exec("INSERT INTO grp(id,mission_id,plan_id,seq,name,optical,radar,electronic,comm,task_dir,cover_area,task_attr,coop_rel,readiness,lng,lat) VALUES("
                  + q(id) + "," + q(M) + "," + q(M + "-plan-g2") + "," + std::to_string(g.seq) + "," +
                  q(g.name) + "," + std::to_string(g.o) + "," + std::to_string(g.r) + "," +
                  std::to_string(g.e) + "," + std::to_string(g.c) + "," + q(g.dir) + "," +
                  q("已完成区域划分") + "," + q(g.attr) + "," + q(g.coop) + "," +
                  std::to_string(88 + g.seq) + ",0,0)")) return false;
    }

    // 打击方案（T5-1，含副标题与星级）
    struct SP { int seq; const char* name; const char* sub; const char* method; const char* groups; int rate; int stars; int rec; };
    const SP sps[] = {
        {1, "方案一｜光电精确打击", "局部执行", "精确打击", R"(["光电侦察单元"])", 68, 3, 0},
        {2, "方案二｜集群协同攻击", "集群协同", "集群协同攻击", R"(["前出侦察集群","侧向感知集群","雷达探测集群","边缘协同处理集群","电子对抗集群","机动执行集群"])", 88, 5, 1},
        {3, "方案三｜电子压制协同", "电子压制", "电子压制协同", R"(["电子对抗集群","机动执行集群"])", 74, 3, 0},
    };
    for (const auto& p : sps) {
        std::string id = M + "-plan-s" + std::to_string(p.seq);
        if (!exec("INSERT INTO plan(id,mission_id,side,seq,name,subtitle,method,groups,recommended,success_rate,stars) VALUES("
                  + q(id) + "," + q(M) + "," + q("strike") + "," + std::to_string(p.seq) + "," +
                  q(p.name) + "," + q(p.sub) + "," + q(p.method) + "," + q(p.groups) + "," +
                  std::to_string(p.rec) + "," + std::to_string(p.rate) + "," + std::to_string(p.stars) + ")")) return false;
    }

    // 目标台账：5 个（T4-1 表：001 机动指挥节点/高/融合/机动中，002 通信枢纽节点/中/雷达/活跃，
    //                       003 防空火力单元/高/光电/部署中，004 通信枢纽节点/中/电子/转移中，
    //                       005 机动指挥节点/低/融合/短暂停留）
    struct T { int no; const char* name; const char* type; const char* threat; int conf;
               double dlng; double dlat; const char* src; const char* dyn; const char* vtag; int prio; };
    const T ts[] = {
        {1, "目标001", "机动指挥节点", "high", 91, -0.046,  0.038, "融合", "机动中",   "高价值", 1},
        {2, "目标002", "通信枢纽节点", "mid",  84,  0.058,  0.022, "雷达", "活跃",     "",       3},
        {3, "目标003", "防空火力单元", "high", 89,  0.004, -0.052, "光电", "部署中",   "高价值", 2},
        {4, "目标004", "通信枢纽节点", "mid",  79, -0.031, -0.019, "电子", "转移中",   "",       4},
        {5, "目标005", "机动指挥节点", "low",  72,  0.033,  0.048, "融合", "短暂停留", "",       5},
    };
    for (const auto& t : ts) {
        std::string id = M + "-t" + std::to_string(t.no);
        char lng[32], lat[32];
        snprintf(lng, sizeof lng, "%.6f", 121.4737 + t.dlng);
        snprintf(lat, sizeof lat, "%.6f", 31.2304 + t.dlat);
        if (!exec("INSERT INTO target(id,mission_id,target_no,name,type,threat,confidence,lng,lat,alt,source,dynamic_state,status,strike_priority,value_tag,upgraded) VALUES("
                  + q(id) + "," + q(M) + "," + std::to_string(t.no) + "," + q(t.name) + "," +
                  q(t.type) + "," + q(t.threat) + "," + std::to_string(t.conf) + "," +
                  std::string(lng) + "," + std::string(lat) + ",0," + q(t.src) + "," + q(t.dyn) + "," +
                  q("red") + "," + std::to_string(t.prio) + "," + q(t.vtag) + ",0)")) return false;
    }

    // 目标轨迹回溯（003，5 个点位）
    for (int i = 0; i < 5; ++i) {
        char lng[32], lat[32];
        snprintf(lng, sizeof lng, "%.6f", 121.4737 + 0.004 - i * 0.010);
        snprintf(lat, sizeof lat, "%.6f", 31.2304 - 0.052 + i * 0.006);
        if (!exec("INSERT INTO target_track(target_id,ts,lng,lat,speed,heading) VALUES("
                  + q(M + "-t3") + "," + std::to_string(nowMs() - (4 - i) * 60000L) + "," +
                  std::string(lng) + "," + std::string(lat) + ",18.5,135)")) return false;
    }

    // 链路：云边端拓扑（云端算力中心 → 前沿边缘节点 → 6 集群）
    const std::string cloud = "云端算力中心";
    const std::string edge  = "前沿边缘节点";
    struct L { const char* a; const char* b; const char* st; };
    const L ls[] = {
        {cloud.c_str(), edge.c_str(), "green"},
        {edge.c_str(), "前出侦察集群", "green"},
        {edge.c_str(), "侧向感知集群", "yellow"},
        {edge.c_str(), "雷达探测集群", "green"},
        {edge.c_str(), "边缘协同处理集群", "green"},
        {edge.c_str(), "电子对抗集群", "green"},
        {edge.c_str(), "机动执行集群", "red"},
    };
    int li = 0;
    for (const auto& l : ls) {
        std::string id = M + "-link-" + std::to_string(++li);
        if (!exec("INSERT INTO link(id,mission_id,from_node,to_node,signal,bandwidth_mbps,latency_ms,loss_rate,coverage_km2,mesh_progress,state) VALUES("
                  + q(id) + "," + q(M) + "," + q(l.a) + "," + q(l.b) + "," +
                  q(l.st[0] == 'g' ? "strong" : (l.st[0] == 'y' ? "mid" : "weak")) + "," +
                  (l.st[0] == 'g' ? "92" : (l.st[0] == 'y' ? "68" : "45")) + ",48,0.3,126," +
                  (l.st[0] == 'g' ? "92" : "68") + "," + q(l.st) + ")")) return false;
    }

    if (!exec("INSERT INTO mission_metrics(mission_id,coverage_rate,targets_found,coop_efficiency,link_stability,mesh_duration_sec,alert_count,resource_used,survival_rate) VALUES("
              + q(M) + ",96,5,92,96,1908,3," +
              q(R"({"optical":22,"radar":12,"electronic":10,"comm":8})") + ",89)")) return false;

    if (!exec("INSERT INTO assessment(mission_id,total_damage_rate,destroyed,severe,damaged,intact,area_control,effect_metrics) VALUES("
              + q(M) + ",88,3,1,1,0,72," +
              q(R"({"linkStability":96,"edgeExecRate":87,"coopEfficiency":92,"taskCompletion":100})") + ")")) return false;

    return true;
}

}  // namespace

bool Seed::seedIfEmpty() {
    std::lock_guard<std::mutex> lk(Database::instance().mutex());
    if (!Database::instance().raw()) return false;
    if (!isEmpty()) return true;

    if (!exec("BEGIN")) return false;
    bool ok = seedScenario1() && seedScenario2();
    if (ok) {
        ok = exec("COMMIT");
    } else {
        exec("ROLLBACK");
    }
    if (ok) std::cout << "[seed] demo data for 2 scenarios written" << std::endl;
    return ok;
}

}  // namespace mapapp
