// Config.cc
#include "core/Config.h"

#include <fstream>
#include <mutex>

#include <nlohmann/json.hpp>

namespace mapapp {

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

}  // namespace mapapp
