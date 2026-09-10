// Telemetry.h —— UDP 组播接入 + 内置遥测模拟器（契约 §1/§4）
//
// 真实链路：UDP 组播 → Parser 解析 → WS 广播（TRD MSG-02）
// 开发链路：内置模拟器按 1s 周期推送无人机位置/链路质量，驱动界面实时变化；
//          链路协议文档到位后只需替换 Parser，不影响下游。
#pragma once
#include <atomic>
#include <memory>
#include <string>
#include <thread>

namespace mapapp {

class Telemetry {
public:
    static Telemetry& instance();

    void start(bool udpEnabled, const std::string& group, int port);
    void stop();

    bool udpRunning() const { return udpRunning_; }
    long long packetsReceived() const { return packets_; }

    // 由 USR1/管理接口触发的“外部遥测”入口（供模拟器与测试直接注入一条报文）
    void injectPacket(const std::string& json);

private:
    Telemetry() = default;
    ~Telemetry();

    void udpLoop(std::string group, int port);
    void simLoop();

    std::atomic<bool> running_{false};
    std::atomic<bool> udpRunning_{false};
    std::atomic<long long> packets_{0};

    std::unique_ptr<std::thread> udpThread_;
    std::unique_ptr<std::thread> simThread_;
    std::string sockGroup_;
    int sockPort_ = 0;
    unsigned long long sockHandle_ = static_cast<unsigned long long>(~0ULL);  // SOCKET
};

}  // namespace mapapp
