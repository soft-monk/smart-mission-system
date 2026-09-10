// Repo.cc
#include "core/Repo.h"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <iostream>

#include <sqlite3.h>

namespace mapapp {

namespace {

void bindAll(sqlite3_stmt* st, const std::vector<std::string>& params) {
    for (size_t i = 0; i < params.size(); ++i) {
        sqlite3_bind_text(st, static_cast<int>(i + 1), params[i].c_str(), -1, SQLITE_TRANSIENT);
    }
}

nlohmann::json stmtToJson(sqlite3_stmt* st) {
    nlohmann::json arr = nlohmann::json::array();
    const int cols = sqlite3_column_count(st);
    while (sqlite3_step(st) == SQLITE_ROW) {
        nlohmann::json row = nlohmann::json::object();
        for (int c = 0; c < cols; ++c) {
            const char* name = sqlite3_column_name(st, c);
            if (!name) continue;
            switch (sqlite3_column_type(st, c)) {
                case SQLITE_INTEGER:
                    row[name] = static_cast<long long>(sqlite3_column_int64(st, c));
                    break;
                case SQLITE_FLOAT:
                    row[name] = sqlite3_column_double(st, c);
                    break;
                case SQLITE_NULL:
                    row[name] = nullptr;
                    break;
                default: {
                    const unsigned char* t = sqlite3_column_text(st, c);
                    row[name] = t ? reinterpret_cast<const char*>(t) : "";
                }
            }
        }
        arr.push_back(std::move(row));
    }
    return arr;
}

}  // namespace

nlohmann::json Repo::query(sqlite3* db, const std::string& sql,
                           const std::vector<std::string>& params) {
    if (!db) return nlohmann::json::array();
    sqlite3_stmt* st = nullptr;
    if (sqlite3_prepare_v2(db, sql.c_str(), -1, &st, nullptr) != SQLITE_OK) {
        std::cerr << "[repo] prepare failed: " << sqlite3_errmsg(db) << "\n  " << sql << std::endl;
        return nlohmann::json::array();
    }
    bindAll(st, params);
    nlohmann::json out = stmtToJson(st);
    sqlite3_finalize(st);
    return out;
}

nlohmann::json Repo::one(sqlite3* db, const std::string& sql,
                         const std::vector<std::string>& params) {
    auto arr = query(db, sql, params);
    if (arr.is_array() && !arr.empty()) return arr[0];
    return nlohmann::json::object();
}

long long Repo::scalarInt(sqlite3* db, const std::string& sql,
                          const std::vector<std::string>& params) {
    auto arr = query(db, sql, params);
    if (arr.is_array() && !arr.empty()) {
        const auto& row = arr[0];
        if (row.is_object() && row.begin() != row.end()) {
            const auto& v = row.begin().value();
            if (v.is_number()) return v.get<long long>();
        }
    }
    return 0;
}

bool Repo::exec(sqlite3* db, const std::string& sql, const std::vector<std::string>& params) {
    if (!db) return false;
    sqlite3_stmt* st = nullptr;
    if (sqlite3_prepare_v2(db, sql.c_str(), -1, &st, nullptr) != SQLITE_OK) {
        std::cerr << "[repo] prepare failed: " << sqlite3_errmsg(db) << "\n  " << sql << std::endl;
        return false;
    }
    bindAll(st, params);
    const int rc = sqlite3_step(st);
    sqlite3_finalize(st);
    if (rc != SQLITE_DONE && rc != SQLITE_ROW) {
        std::cerr << "[repo] step failed: " << sqlite3_errmsg(db) << "\n  " << sql << std::endl;
        return false;
    }
    return true;
}

bool Repo::execScript(sqlite3* db, const std::string& sql) {
    if (!db) return false;
    char* err = nullptr;
    if (sqlite3_exec(db, sql.c_str(), nullptr, nullptr, &err) != SQLITE_OK) {
        std::cerr << "[repo] exec failed: " << (err ? err : "?") << std::endl;
        if (err) sqlite3_free(err);
        return false;
    }
    return true;
}

std::string Repo::newId(const std::string& prefix) {
    static std::atomic<unsigned> seq{0};
    const auto ms = nowMs();
    char buf[64];
    snprintf(buf, sizeof buf, "%s-%lld-%u", prefix.c_str(),
             static_cast<long long>(ms), seq.fetch_add(1) % 1000);
    return std::string(buf);
}

std::string Repo::nowString() {
    std::time_t t = std::time(nullptr);
    std::tm tmv{};
    localtime_s(&tmv, &t);
    char buf[32];
    std::strftime(buf, sizeof buf, "%Y-%m-%d %H:%M:%S", &tmv);
    return std::string(buf);
}

long long Repo::nowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::system_clock::now().time_since_epoch())
        .count();
}

}  // namespace mapapp
