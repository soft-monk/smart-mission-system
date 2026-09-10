// Config.h —— 服务端配置（config.json 外置，TRD 5.3）
#pragma once
#include <string>

namespace mapapp {

struct Config {
    // 服务端监听
    std::string listenAddr = "0.0.0.0";
    int         listenPort = 8080;
    int         threadNum  = 0;  // 0 = 自动

    // Python AI 桥（仅本机）
    std::string aiBridgeHost = "127.0.0.1";
    int         aiBridgePort = 8090;

    // UDP 组播遥测接入
    std::string udpGroup    = "239.10.10.10";
    int         udpPort     = 45454;
    bool        udpEnabled  = true;
    int         nodeTimeoutMs = 10000;  // 心跳超时判定失联

    // 静态资源（相对 backend/ 运行目录）
    std::string staticDir  = "static";     // 前端产物
    std::string tilesDir   = "../tiles";   // 瓦片
    std::string mediaDir   = "../media";   // 本地 mp4
    std::string reportsDir = "data/reports";

    // 数据库
    std::string dbPath = "data/mapapp.db";

    // 场景配置目录
    std::string scenariosDir = "config/scenarios";

    // 地图默认
    double mapCenterLng = 116.3974;
    double mapCenterLat = 39.9093;
    int    mapZoom      = 11;
    int    mapMinZoom   = 3;
    int    mapMaxZoom   = 15;

    // 演示：无外部遥测源时自动启动内置模拟器
    bool   simEnabled   = true;
    int    simIntervalMs = 1000;   // 遥测推送周期

    static Config& instance();
    bool load(const std::string& path);
};

}  // namespace mapapp
