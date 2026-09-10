// Database.h —— SQLite 封装（TRD DAT-01/02，契约 §5）
#pragma once
#include <mutex>
#include <string>

struct sqlite3;

namespace mapapp {

class Database {
public:
    static Database& instance();

    bool open(const std::string& path);
    void close();

    // 建表 + 首次播种（演示数据）
    bool migrate();
    bool seedIfEmpty();

    sqlite3* raw() { return db_; }
    std::mutex& mutex() { return mtx_; }

private:
    Database() = default;
    sqlite3*   db_ = nullptr;
    std::mutex mtx_;
};

}  // namespace mapapp
