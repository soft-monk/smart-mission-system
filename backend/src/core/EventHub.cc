// EventHub.cc
#include "core/EventHub.h"

#include <algorithm>
#include <chrono>
#include <memory>
#include <mutex>

#include <drogon/WebSocketConnection.h>

#include <sqlite3.h>

#include "core/Database.h"

namespace mapapp {

EventHub& EventHub::instance() {
    static EventHub hub;
    return hub;
}

void EventHub::add(const std::shared_ptr<drogon::WebSocketConnection>& conn) {
    std::lock_guard<std::mutex> lk(mtx_);
    clients_.push_back(conn);
}

void EventHub::remove(const std::shared_ptr<drogon::WebSocketConnection>& conn) {
    std::lock_guard<std::mutex> lk(mtx_);
    clients_.erase(std::remove(clients_.begin(), clients_.end(), conn), clients_.end());
}

size_t EventHub::clientCount() {
    std::lock_guard<std::mutex> lk(mtx_);
    return clients_.size();
}

void EventHub::sendTo(const std::shared_ptr<drogon::WebSocketConnection>& conn,
                      const std::string& type, const nlohmann::json& data) {
    if (!conn) return;
    nlohmann::json msg;
    msg["type"] = type;
    msg["data"] = data;
    msg["ts"] = std::chrono::duration_cast<std::chrono::milliseconds>(
                    std::chrono::system_clock::now().time_since_epoch())
                    .count();
    conn->send(msg.dump());
}

void EventHub::broadcast(const std::string& type, const nlohmann::json& data) {
    nlohmann::json msg;
    msg["type"] = type;
    msg["data"] = data;
    msg["ts"] = std::chrono::duration_cast<std::chrono::milliseconds>(
                    std::chrono::system_clock::now().time_since_epoch())
                    .count();
    const std::string payload = msg.dump();

    std::vector<std::shared_ptr<drogon::WebSocketConnection>> snapshot;
    {
        std::lock_guard<std::mutex> lk(mtx_);
        snapshot = clients_;
    }
    for (auto& c : snapshot) {
        if (c) c->send(payload);
    }
}

void EventHub::logEvent(const std::string& missionId, const std::string& type,
                        const nlohmann::json& data) {
    auto* db = Database::instance().raw();
    if (!db) return;
    sqlite3_stmt* st = nullptr;
    const char* sql = "INSERT INTO event_log(mission_id,type,payload,ts) VALUES(?,?,?,?)";
    if (sqlite3_prepare_v2(db, sql, -1, &st, nullptr) != SQLITE_OK) return;
    sqlite3_bind_text(st, 1, missionId.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(st, 2, type.c_str(), -1, SQLITE_TRANSIENT);
    const std::string p = data.dump();
    sqlite3_bind_text(st, 3, p.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int64(st, 4, std::chrono::duration_cast<std::chrono::milliseconds>(
                                  std::chrono::system_clock::now().time_since_epoch())
                                  .count());
    sqlite3_step(st);
    sqlite3_finalize(st);
}

}  // namespace mapapp
