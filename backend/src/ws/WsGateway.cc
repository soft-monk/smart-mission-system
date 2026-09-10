// WsGateway.cc
#include "ws/WsGateway.h"

#include <iostream>

#include <nlohmann/json.hpp>

#include "core/EventHub.h"

namespace mapapp {

void WsGateway::handleNewConnection(const drogon::HttpRequestPtr&,
                                    const drogon::WebSocketConnectionPtr& conn) {
    EventHub::instance().add(conn);
    std::cout << "[ws] client connected, total=" << EventHub::instance().clientCount() << std::endl;

    // 连接即推送一次握手与当前任务快照，便于客户端立即渲染
    EventHub::sendTo(conn, "alert", {{"level", "info"}, {"code", "ws.ready"},
                                     {"title", "已连接"}, {"text", "实时通道已建立"}});
}

void WsGateway::handleNewMessage(const drogon::WebSocketConnectionPtr& conn,
                                 std::string&& message,
                                 const drogon::WebSocketMessageType& type) {
    if (type == drogon::WebSocketMessageType::Ping) {
        conn->send("{\"type\":\"pong\",\"data\":{}}", drogon::WebSocketMessageType::Pong);
        return;
    }
    if (type == drogon::WebSocketMessageType::Pong) return;

    // 文本消息：约定仅 {type:"ping"}（其余忽略）
    try {
        auto j = nlohmann::json::parse(message);
        if (j.value("type", "") == "ping") {
            EventHub::sendTo(conn, "pong", nlohmann::json::object());
            return;
        }
    } catch (...) {
        // 忽略无法解析的消息
    }
}

void WsGateway::handleConnectionClosed(const drogon::WebSocketConnectionPtr& conn) {
    EventHub::instance().remove(conn);
    std::cout << "[ws] client disconnected, total=" << EventHub::instance().clientCount() << std::endl;
}

}  // namespace mapapp
