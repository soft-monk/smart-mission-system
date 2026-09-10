// Telemetry.cc
#include "net/Telemetry.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <iostream>
#include <vector>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
using socket_t = SOCKET;
#define CLOSE_SOCKET closesocket
#define BAD_SOCKET INVALID_SOCKET
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
using socket_t = int;
#define CLOSE_SOCKET close
#define BAD_SOCKET (-1)
#endif

#include <nlohmann/json.hpp>
#include <sqlite3.h>

#include "core/Config.h"
#include "core/Database.h"
#include "core/EventHub.h"
#include "core/Repo.h"

namespace mapapp {

namespace {

long long nowMs() { return Repo::nowMs(); }

// 一个小而稳定的伪随机（避免多线程 rand 竞争）
double wrapSin(double t, double base, double amp, double period, double phase = 0.0) {
    return base + amp * std::sin((t / period) * 2.0 * M_PI + phase);
}

}  // namespace

Telemetry& Telemetry::instance() {
    static Telemetry t;
    return t;
}

Telemetry::~Telemetry() { stop(); }

void Telemetry::start(bool udpEnabled, const std::string& group, int port) {
    if (running_.exchange(true)) return;

    sockGroup_ = group;
    sockPort_ = port;

    if (udpEnabled) {
        udpThread_ = std::make_unique<std::thread>(&Telemetry::udpLoop, this, group, port);
    }
    if (Config::instance().simEnabled) {
        simThread_ = std::make_unique<std::thread>(&Telemetry::simLoop, this);
    }
}

void Telemetry::stop() {
    if (!running_.exchange(false)) return;
    if (udpThread_ && udpThread_->joinable()) udpThread_->join();
    if (simThread_ && simThread_->joinable()) simThread_->join();
    udpThread_.reset();
    simThread_.reset();
}

// ---------------------------------------------------------------- UDP 接收
void Telemetry::udpLoop(std::string group, int port) {
#ifdef _WIN32
    WSADATA wsa{};
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        std::cerr << "[udp] WSAStartup failed" << std::endl;
        return;
    }
#endif
    socket_t s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (s == BAD_SOCKET) {
        std::cerr << "[udp] socket() failed" << std::endl;
        return;
    }
    sockHandle_ = static_cast<unsigned long long>(s);

    int reuse = 1;
    setsockopt(s, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&reuse), sizeof(reuse));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(static_cast<unsigned short>(port));
    addr.sin_addr.s_addr = INADDR_ANY;
    if (bind(s, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
        std::cerr << "[udp] bind failed on port " << port << " (组播接入不可用，模拟器继续工作)" << std::endl;
        CLOSE_SOCKET(s);
        sockHandle_ = static_cast<unsigned long long>(~0ULL);
        return;
    }

    ip_mreq mreq{};
    mreq.imr_multiaddr.s_addr = inet_addr(group.c_str());
    mreq.imr_interface.s_addr = htonl(INADDR_ANY);
    if (setsockopt(s, IPPROTO_IP, IP_ADD_MEMBERSHIP, reinterpret_cast<const char*>(&mreq), sizeof(mreq)) != 0) {
        std::cerr << "[udp] join multicast " << group << " failed (模拟器继续工作)" << std::endl;
    }

    udpRunning_ = true;
    std::cout << "[udp] listening on " << group << ":" << port << std::endl;

    char buf[8192];
    while (running_.load()) {
        fd_set fds;
        FD_ZERO(&fds);
        FD_SET(s, &fds);
        timeval tv{};
        tv.tv_sec = 0;
        tv.tv_usec = 300000;   // 300ms 轮询，保证可及时退出
        const int rc = select(static_cast<int>(s + 1), &fds, nullptr, nullptr, &tv);
        if (rc <= 0) continue;

        sockaddr_in from{};
        int fromLen = sizeof(from);
        const int n = recvfrom(s, buf, sizeof(buf) - 1, 0, reinterpret_cast<sockaddr*>(&from), &fromLen);
        if (n <= 0) continue;
        buf[n] = '\0';
        packets_.fetch_add(1);
        injectPacket(std::string(buf, static_cast<size_t>(n)));
    }

    CLOSE_SOCKET(s);
    sockHandle_ = static_cast<unsigned long long>(~0ULL);
    udpRunning_ = false;
}

// ---------------------------------------------------------------- 报文解析
// 期望格式（JSON，UTF-8；协议文档到位后替换本函数即可）：
//   {"kind":"uav.pos","uavId":"..","lng":..,"lat":..,"alt":..,"heading":..,"speed":..,"battery":85}
//   {"kind":"link.quality","linkId":"..","bandwidthMbps":..,"latencyMs":..,"lossRate":..,"state":"green"}
//   {"kind":"target.state","targetId":"..","status":"red","lng":..,"lat":..}
//   {"kind":"node.state","nodeId":"..","online":true}
void Telemetry::injectPacket(const std::string& json) {
    nlohmann::json j;
    try {
        j = nlohmann::json::parse(json);
    } catch (...) {
        return;   // 非法报文丢弃
    }
    const std::string kind = j.value("kind", "");
    if (kind == "uav.pos") {
        EventHub::instance().broadcast("telemetry.uav.pos", j);
    } else if (kind == "link.quality") {
        EventHub::instance().broadcast("telemetry.link.quality", j);
    } else if (kind == "target.state") {
        EventHub::instance().broadcast("target.state", j);
    } else if (kind == "node.state") {
        EventHub::instance().broadcast("node.state", j);
    }
}

// ---------------------------------------------------------------- 内置模拟器
void Telemetry::simLoop() {
    std::cout << "[sim] telemetry simulator started" << std::endl;
    const int interval = std::max(200, Config::instance().simIntervalMs);

    struct UavState {
        std::string id;
        std::string type;
        std::string group;
        double baseLng = 0, baseLat = 0;
        double t = 0;
    };
    std::vector<UavState> uavs;

    // 为每个任务生成 6 架代表无人机（每集群 1 架），围绕该场景地图中心活动
    auto build = [&]() {
        uavs.clear();
        auto missions = Repo::query(Database::instance().raw(), "SELECT id, scenario_key FROM mission");
        const char* types[] = {"optical", "optical", "radar", "electronic", "comm", "comm"};
        for (const auto& m : missions) {
            const std::string mid = m.value("id", "");
            const bool s2 = m.value("scenario_key", "") == "scenario-2";
            const double cLng = s2 ? 121.4737 : 116.3974;
            const double cLat = s2 ? 31.2304  : 39.9093;
            auto groups = Repo::query(Database::instance().raw(),
                                      "SELECT id, seq, name FROM grp WHERE mission_id=? ORDER BY seq", {mid});
            int gi = 0;
            for (const auto& g : groups) {
                UavState u;
                u.id = mid + "-uav-" + std::to_string(gi + 1);
                u.type = types[gi % 6];
                u.group = g.value("name", "");
                const double ang = (gi / 6.0) * 2 * M_PI;
                u.baseLng = cLng + 0.05 * std::cos(ang);
                u.baseLat = cLat + 0.04 * std::sin(ang);
                u.t = gi * 0.7;
                uavs.push_back(u);
                ++gi;
            }
        }
    };
    build();

    long long tick = 0;
    while (running_.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(interval));
        if (!running_.load()) break;
        ++tick;

        if (uavs.empty() || tick % 60 == 0) build();   // 新任务出现时重建

        for (auto& u : uavs) {
            u.t += 0.05;
            nlohmann::json e;
            e["kind"] = "uav.pos";
            e["uavId"] = u.id;
            e["type"] = u.type;
            e["groupId"] = u.group;
            e["lng"] = std::round((u.baseLng + 0.006 * std::sin(u.t)) * 1e6) / 1e6;
            e["lat"] = std::round((u.baseLat + 0.005 * std::cos(u.t * 0.8)) * 1e6) / 1e6;
            e["alt"] = std::round(wrapSin(u.t, 900, 140, 7.0));
            e["heading"] = std::fmod(u.t * 40.0, 360.0);
            e["speed"] = std::round(wrapSin(u.t, 22, 4, 5.0) * 10) / 10;
            e["battery"] = static_cast<int>(std::max(20.0, 95.0 - std::fmod(u.t * 0.25, 60.0)));
            e["ts"] = nowMs();
            EventHub::instance().broadcast("telemetry.uav.pos", e);
        }

        // 链路质量：每 2 个周期推一次
        if (tick % 2 == 0) {
            auto missions = Repo::query(Database::instance().raw(), "SELECT id FROM mission");
            for (const auto& m : missions) {
                const std::string mid = m.value("id", "");
                auto links = Repo::query(Database::instance().raw(),
                                         "SELECT * FROM link WHERE mission_id=?", {mid});
                for (const auto& l : links) {
                    nlohmann::json e;
                    e["kind"] = "link.quality";
                    e["missionId"] = mid;
                    e["linkId"] = l.value("id", "");
                    e["from"] = l.value("from_node", "");
                    e["to"] = l.value("to_node", "");
                    e["signal"] = l.value("signal", "strong");
                    const double bw = l.value("bandwidth_mbps", 82.0);
                    const double lt = l.value("latency_ms", 38.0);
                    e["bandwidthMbps"] = std::round((bw + 3.0 * std::sin(tick / 9.0)) * 10) / 10;
                    e["latencyMs"] = std::round((lt + 4.0 * std::cos(tick / 7.0)) * 10) / 10;
                    e["lossRate"] = l.value("loss_rate", 0.3);
                    e["coverageKm2"] = l.value("coverage_km2", 126.0);
                    e["meshProgress"] = l.value("mesh_progress", 78);
                    e["state"] = l.value("state", "green");
                    e["ts"] = nowMs();
                    EventHub::instance().broadcast("telemetry.link.quality", e);
                }
            }
        }

        // 任务进度缓慢推进（演示：T5 及以后每 4 秒 +1%，封顶 99）
        if (tick % 4 == 0) {
            auto missions = Repo::query(Database::instance().raw(),
                "SELECT id, phase, progress, scenario_key FROM mission WHERE status='running'");
            for (const auto& m : missions) {
                const std::string phase = m.value("phase", "T0");
                if (phase == "T0" || phase == "T1" || phase == "T2" || phase == "T3" || phase == "T4") continue;
                int p = m.value("progress", 0);
                if (p >= 99) continue;
                p = std::min(99, p + 1);
                const std::string mid = m.value("id", "");
                Repo::exec(Database::instance().raw(),
                           "UPDATE mission SET progress=? WHERE id=?", {std::to_string(p), mid});
                EventHub::instance().broadcast("mission.progress",
                    {{"missionId", mid}, {"progress", p}, {"phase", phase},
                     {"label", phase == "T7" ? "任务完成" : "执行中"}});
            }
        }

        // 每 10 个周期推一次资源状态快照
        if (tick % 10 == 0) {
            auto missions = Repo::query(Database::instance().raw(), "SELECT id FROM mission");
            for (const auto& m : missions) {
                const std::string mid = m.value("id", "");
                auto rows = Repo::query(Database::instance().raw(),
                                        "SELECT * FROM uav_resource WHERE mission_id=?", {mid});
                nlohmann::json totals = nlohmann::json::object();
                nlohmann::json avail = nlohmann::json::object();
                nlohmann::json alloc = nlohmann::json::object();
                nlohmann::json pend = nlohmann::json::object();
                for (const auto& r : rows) {
                    const std::string t = r.value("type", "");
                    totals[t] = r.value("total", 0);
                    avail[t] = r.value("available", 0);
                    alloc[t] = r.value("allocated", 0);
                    pend[t] = r.value("pending", 0);
                }
                EventHub::instance().broadcast("resource.uav.state",
                    {{"missionId", mid}, {"totals", totals}, {"available", avail},
                     {"allocated", alloc}, {"pending", pend},
                     {"onlineRate", rows.empty() ? 100 : rows[0].value("online_rate", 100)}});
            }
        }
    }
    std::cout << "[sim] telemetry simulator stopped" << std::endl;
}

}  // namespace mapapp
