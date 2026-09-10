// EventHub.h —— WebSocket 广播中枢（TRD MSG-01/05）
//
// 单通道 JSON 事件 {type,data,ts} 广播至所有在线客户端；
// 一次发布、多端订阅；并发安全。
#pragma once
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

namespace drogon { class WebSocketConnection; }

namespace mapapp {

class EventHub {
public:
    static EventHub& instance();

    void add(const std::shared_ptr<drogon::WebSocketConnection>& conn);
    void remove(const std::shared_ptr<drogon::WebSocketConnection>& conn);
    size_t clientCount();

    // 广播事件：data 为对象；内部自动附 ts
    void broadcast(const std::string& type, const nlohmann::json& data);

    // 发送给单连接
    static void sendTo(const std::shared_ptr<drogon::WebSocketConnection>& conn,
                       const std::string& type, const nlohmann::json& data);

    // 事件日志（断链续行预留）
    static void logEvent(const std::string& missionId, const std::string& type,
                         const nlohmann::json& data);

private:
    EventHub() = default;
    std::mutex mtx_;
    std::vector<std::shared_ptr<drogon::WebSocketConnection>> clients_;
};

}  // namespace mapapp
