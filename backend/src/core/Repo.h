// Repo.h —— 轻量数据访问层：把 SQL 行集直接转成 JSON
//
// 设计取舍：演示系统的查询都是小结果集，用 sqlite3 通用行转 JSON 避免为每张表写映射代码；
// 写操作统一走 exec()/bind 参数化，避免拼串注入。
#pragma once
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

struct sqlite3;
struct sqlite3_stmt;

namespace mapapp {

class Repo {
public:
    // ---- 读 ----
    static nlohmann::json query(sqlite3* db, const std::string& sql,
                                const std::vector<std::string>& params = {});
    static nlohmann::json one(sqlite3* db, const std::string& sql,
                              const std::vector<std::string>& params = {});
    static long long scalarInt(sqlite3* db, const std::string& sql,
                               const std::vector<std::string>& params = {});

    // ---- 写 ----
    static bool exec(sqlite3* db, const std::string& sql,
                     const std::vector<std::string>& params = {});
    static bool execScript(sqlite3* db, const std::string& sql);

    // 生成短 ID
    static std::string newId(const std::string& prefix);
    static std::string nowString();
    static long long   nowMs();
};

}  // namespace mapapp
