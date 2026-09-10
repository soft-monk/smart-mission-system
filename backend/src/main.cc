// main.cc —— 服务端入口
//
// 职责：加载配置 → 打开/迁移/播种 SQLite → 启动 UDP 组播接入 → 启动遥测模拟器
//       → 注册 REST 路由（契约 §3）→ WebSocket 网关（§4）→ 静态托管 → 运行
#include <filesystem>
#include <iostream>
#include <string>

#include <drogon/drogon.h>

#include "api/Api.h"
#include "core/Config.h"
#include "core/Database.h"
#include "core/Seed.h"
#include "net/Telemetry.h"
#include "ws/WsGateway.h"

namespace fs = std::filesystem;
using namespace mapapp;
using namespace drogon;

namespace {

// 静态资源托管：/tiles/**、/media/**、/reports/** 各挂一个目录处理器；
// 前端产物走 Drogon 内置 document root（setDocumentRoot），未知路径自动回落 index.html（SPA 路由）。
void registerStatic() {
    const auto& cfg = Config::instance();

    auto serveDir = [](const std::string& urlPrefix, const std::string& fsDir) {
        app().registerHandler(urlPrefix + "/{1}",
            [fsDir](const HttpRequestPtr& req,
                    std::function<void(const HttpResponsePtr&)>&& cb,
                    const std::string& rel) {
                // 防止路径穿越
                if (rel.find("..") != std::string::npos) {
                    cb(HttpResponse::newNotFoundResponse());
                    return;
                }
                fs::path full = fs::path(fsDir) / rel;
                std::error_code ec;
                if (fs::exists(full, ec) && fs::is_regular_file(full, ec)) {
                    cb(HttpResponse::newFileResponse(full.string()));
                    return;
                }
                cb(HttpResponse::newNotFoundResponse());
            },
            {Get});
    };

    serveDir("/tiles", cfg.tilesDir);
    serveDir("/media", cfg.mediaDir);
    serveDir("/reports", cfg.reportsDir);

    // SPA 回落：仅对「无文件扩展名的路径」回 index.html。
    // 必须排除带扩展名的资源请求（/assets/x.js、/assets/x.css 等），否则静态资源会被当成
    // HTML 返回（MIME=text/html），浏览器会以「Strict MIME type checking」拒绝执行 module 脚本。
    app().registerHandlerViaRegex(R"(^/(?!api/|tiles/|media/|reports/|ws$)[^.]*$)",
        [](const HttpRequestPtr&, std::function<void(const HttpResponsePtr&)>&& cb) {
            const auto& c = Config::instance();
            fs::path index = fs::path(c.staticDir) / "index.html";
            std::error_code ec;
            if (fs::exists(index, ec)) {
                cb(HttpResponse::newFileResponse(index.string()));
                return;
            }
            cb(HttpResponse::newNotFoundResponse());
        },
        {Get});
}

void registerApi() {
    auto& a = app();

    // §3.1 健康与配置
    a.registerHandler("/api/v1/health", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::health(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/map/config", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::mapConfig(r, std::move(cb)); }, {Get});

    // §3.2 场景与任务
    a.registerHandler("/api/v1/scenarios", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::scenarios(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/scenarios/recommend", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::recommendScenario(r, std::move(cb)); }, {Post});
    a.registerHandler("/api/v1/missions", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::createMission(r, std::move(cb)); }, {Post});
    a.registerHandler("/api/v1/missions/current", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::currentMission(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/missions/{id}/phase",
        [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb, const std::string& id) { api::setPhase(r, std::move(cb), id); }, {Put});
    a.registerHandler("/api/v1/missions/{id}/reset",
        [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb, const std::string& id) { api::resetMission(r, std::move(cb), id); }, {Post});
    a.registerHandler("/api/v1/missions/{id}",
        [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb, const std::string& id) { api::missionDetail(r, std::move(cb), id); }, {Get});

    // §3.3 资源与编组
    a.registerHandler("/api/v1/resources/uavs", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::uavs(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/groups", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::groups(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/groups/generate", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::generateGroups(r, std::move(cb)); }, {Post});
    a.registerHandler("/api/v1/plans", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::plans(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/plans/{id}/adopt",
        [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb, const std::string& id) { api::adoptPlan(r, std::move(cb), id); }, {Post});
    a.registerHandler("/api/v1/plans/{id}/optimize",
        [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb, const std::string& id) { api::optimizePlan(r, std::move(cb), id); }, {Post});
    a.registerHandler("/api/v1/plans/{id}/confirm",
        [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb, const std::string& id) { api::confirmPlan(r, std::move(cb), id); }, {Post});

    // §3.4 链路
    a.registerHandler("/api/v1/links/topology", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::linkTopology(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/links/metrics", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::linkMetrics(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/links/optimize", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::optimizeLink(r, std::move(cb)); }, {Post});
    a.registerHandler("/api/v1/links/curves", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::linkCurves(r, std::move(cb)); }, {Get});

    // §3.5 目标
    a.registerHandler("/api/v1/targets", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::targets(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/targets/{id}/track",
        [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb, const std::string& id) { api::targetTrack(r, std::move(cb), id); }, {Get});
    a.registerHandler("/api/v1/targets/{id}/strike",
        [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb, const std::string& id) { api::targetAction(r, std::move(cb), id, "strike"); }, {Post});
    a.registerHandler("/api/v1/targets/{id}/upgrade",
        [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb, const std::string& id) { api::targetAction(r, std::move(cb), id, "upgrade"); }, {Post});
    a.registerHandler("/api/v1/targets/{id}/watch",
        [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb, const std::string& id) { api::targetAction(r, std::move(cb), id, "watch"); }, {Post});
    a.registerHandler("/api/v1/targets/{id}",
        [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb, const std::string& id) { api::targetDetail(r, std::move(cb), id); }, {Get});

    // §3.6 执行
    a.registerHandler("/api/v1/execution/status", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::executionStatus(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/execution/guide", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::guide(r, std::move(cb)); }, {Post});
    a.registerHandler("/api/v1/execution/replan", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::replan(r, std::move(cb)); }, {Post});

    // §3.7 评估与报告
    a.registerHandler("/api/v1/assessments", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::assessment(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/reports", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::reports(r, std::move(cb)); }, {Get});
    a.registerHandler("/api/v1/reports", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::createReport(r, std::move(cb)); }, {Post});

    // §3.8 AI 代理
    a.registerHandler("/api/v1/ai/chat", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::aiChat(r, std::move(cb)); }, {Post});
    a.registerHandler("/api/v1/ai/stt", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::aiStt(r, std::move(cb)); }, {Post});
    a.registerHandler("/api/v1/ai/tts", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::aiTts(r, std::move(cb)); }, {Post});
    a.registerHandler("/api/v1/ai/health", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::aiHealth(r, std::move(cb)); }, {Get});

    // §3.9 媒体
    a.registerHandler("/api/v1/media/videos", [](const HttpRequestPtr& r, std::function<void(const HttpResponsePtr&)>&& cb) { api::videos(r, std::move(cb)); }, {Get});
}

}  // namespace

int main(int argc, char** argv) {
    const std::string configPath = (argc > 1) ? argv[1] : "config.json";

    auto& cfg = Config::instance();
    if (cfg.load(configPath)) {
        std::cout << "[cfg] loaded " << configPath << std::endl;
    } else {
        std::cout << "[cfg] " << configPath << " not found, using built-in defaults" << std::endl;
    }

    // 数据库
    auto& db = Database::instance();
    if (!db.open(cfg.dbPath)) {
        std::cerr << "[fatal] cannot open sqlite: " << cfg.dbPath << std::endl;
        return 1;
    }
    if (!db.migrate()) {
        std::cerr << "[fatal] schema migration failed" << std::endl;
        return 1;
    }
    Seed::seedIfEmpty();

    // 静态资源目录（缺失则建，避免 newFileResponse 报错）
    std::error_code ec;
    fs::create_directories(cfg.staticDir, ec);
    fs::create_directories(cfg.reportsDir, ec);

    // Drogon 运行参数
    app().addListener(cfg.listenAddr, cfg.listenPort);
    if (cfg.threadNum > 0) app().setThreadNum(cfg.threadNum);
    app().setLogLevel(trantor::Logger::kInfo);

    // 前端产物：Drogon 内置静态托管（未知路径回落 index.html，支持 SPA 路由）
    if (fs::exists(cfg.staticDir, ec)) {
        app().setDocumentRoot(fs::absolute(cfg.staticDir).string());
        std::cout << "[static] document root = " << fs::absolute(cfg.staticDir).string() << std::endl;
    }

    // 路由
    registerApi();
    registerStatic();

    // 遥测：UDP 组播接入 + 内置模拟器（契约 §1/§4）
    Telemetry::instance().start(cfg.udpEnabled, cfg.udpGroup, cfg.udpPort);

    std::cout << "=====================================================\n"
              << " 智能任务管理系统 · 服务端已启动\n"
              << "   访问地址 : http://127.0.0.1:" << cfg.listenPort << "/\n"
              << "   健康检查 : http://127.0.0.1:" << cfg.listenPort << "/api/v1/health\n"
              << "   WebSocket: ws://127.0.0.1:" << cfg.listenPort << "/ws\n"
              << "   UDP 组播 : " << (cfg.udpEnabled ? cfg.udpGroup + ":" + std::to_string(cfg.udpPort) : "已关闭") << "\n"
              << "   遥测模拟 : " << (cfg.simEnabled ? "开启" : "关闭") << "\n"
              << "=====================================================" << std::endl;

    app().run();
    Telemetry::instance().stop();
    db.close();
    return 0;
}
