// WsGateway.h —— WebSocket 网关（契约 §4）
//
// 单通道 /ws；连接即订阅全部事件；心跳 ping/pong；广播由 EventHub 统一出口。
#pragma once
#include <drogon/WebSocketController.h>

namespace mapapp {

class WsGateway : public drogon::WebSocketController<WsGateway> {
public:
    void handleNewMessage(const drogon::WebSocketConnectionPtr& conn,
                          std::string&& message,
                          const drogon::WebSocketMessageType& type) override;

    void handleNewConnection(const drogon::HttpRequestPtr& req,
                             const drogon::WebSocketConnectionPtr& conn) override;

    void handleConnectionClosed(const drogon::WebSocketConnectionPtr& conn) override;

    WS_PATH_LIST_BEGIN
    WS_PATH_ADD("/ws");
    WS_PATH_LIST_END
};

}  // namespace mapapp
