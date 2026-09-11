// Config.cc
#include "core/Config.h"

#include <cctype>
#include <cstdlib>
#include <fstream>
#include <mutex>

#include <nlohmann/json.hpp>

namespace mapapp {

namespace {

// ---- 环境变量读取helpers：空字符串视为未设置 ------------------------------
const char* envRaw(const char* name) {
    const char* v = std::getenv(name);
    return (v && *v) ? v : nullptr;
}

void envS(const char* name, std::string& dst) {
    if (const char* v = envRaw(name)) dst = v;
}

void envI(const char* name, int& dst) {
    if (const char* v = envRaw(name)) {
        try {
            dst = std::stoi(v);
        } catch (...) {
        }
    }
}

void envD(const char* name, double& dst) {
    if (const char* v = envRaw(name)) {
        try {
            dst = std::stod(v);
        } catch (...) {
        }
    }
}

void envB(const char* name, bool& dst) {
    if (const char* v = envRaw(name)) {
        std::string s(v);
        for (auto& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        dst = (s == "1" || s == "true" || s == "yes" || s == "on");
    }
}

}  // namespace

Config& Config::instance() {
    static Config cfg;
    return cfg;
}

bool Config::load(const std::string& path) {
    std::ifstream in(path);
    if (!in.is_open()) {
        // 无配置文件时使用默认值（不视为错误）
        return false;
    }
    nlohmann::json j;
    try {
        in >> j;
    } catch (...) {
        return false;
    }

    auto getS = [&](const char* k, std::string& dst) {
        if (j.contains(k) && j[k].is_string()) dst = j[k].get<std::string>();
    };
    auto getI = [&](const char* k, int& dst) {
        if (j.contains(k) && j[k].is_number_integer()) dst = j[k].get<int>();
    };
    auto getD = [&](const char* k, double& dst) {
        if (j.contains(k) && j[k].is_number()) dst = j[k].get<double>();
    };
    auto getB = [&](const char* k, bool& dst) {
        if (j.contains(k) && j[k].is_boolean()) dst = j[k].get<bool>();
    };

    getS("listenAddr", listenAddr);
    getI("listenPort", listenPort);
    getI("threadNum", threadNum);

    getS("aiBridgeHost", aiBridgeHost);
    getI("aiBridgePort", aiBridgePort);

    getS("udpGroup", udpGroup);
    getI("udpPort", udpPort);
    getB("udpEnabled", udpEnabled);
    getI("nodeTimeoutMs", nodeTimeoutMs);

    getS("staticDir", staticDir);
    getS("tilesDir", tilesDir);
    getS("mediaDir", mediaDir);
    getS("reportsDir", reportsDir);
    getS("dbPath", dbPath);
    getS("scenariosDir", scenariosDir);

    getD("mapCenterLng", mapCenterLng);
    getD("mapCenterLat", mapCenterLat);
    getI("mapZoom", mapZoom);
    getI("mapMinZoom", mapMinZoom);
    getI("mapMaxZoom", mapMaxZoom);

    getB("simEnabled", simEnabled);
    getI("simIntervalMs", simIntervalMs);

    return true;
}

// 环境变量覆盖（优先级：命令行 > 环境变量 > config.json > 内置默认）
// 由 scripts\env.bat 统一导出，机器差异写在 scripts\env.local.bat 中。
void Config::applyEnv() {
    envS("MAPAPP_LISTEN_ADDR", listenAddr);
    envI("MAPAPP_HTTP_PORT", listenPort);
    envI("MAPAPP_THREAD_NUM", threadNum);

    envS("MAPAPP_AI_HOST", aiBridgeHost);
    envI("MAPAPP_AI_PORT", aiBridgePort);

    envS("MAPAPP_UDP_GROUP", udpGroup);
    envI("MAPAPP_UDP_PORT", udpPort);
    envB("MAPAPP_UDP_ENABLED", udpEnabled);
    envI("MAPAPP_NODE_TIMEOUT_MS", nodeTimeoutMs);

    envS("MAPAPP_STATIC_DIR", staticDir);
    envS("MAPAPP_TILES_DIR", tilesDir);
    envS("MAPAPP_MEDIA_DIR", mediaDir);
    envS("MAPAPP_REPORTS_DIR", reportsDir);
    envS("MAPAPP_DB_PATH", dbPath);
    envS("MAPAPP_SCENARIOS_DIR", scenariosDir);

    envD("MAPAPP_MAP_LNG", mapCenterLng);
    envD("MAPAPP_MAP_LAT", mapCenterLat);
    envI("MAPAPP_MAP_ZOOM", mapZoom);
    envI("MAPAPP_MAP_MIN_ZOOM", mapMinZoom);
    envI("MAPAPP_MAP_MAX_ZOOM", mapMaxZoom);

    envB("MAPAPP_SIM_ENABLED", simEnabled);
    envI("MAPAPP_SIM_INTERVAL_MS", simIntervalMs);
}

}  // namespace mapapp
