// Database.cc —— 建表 DDL（契约 §5）
#include "core/Database.h"

#include <filesystem>
#include <iostream>

#include <sqlite3.h>

#include "core/Config.h"
#include "core/Seed.h"

namespace mapapp {

namespace {

const char* kSchema = R"SQL(
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS scenario (
  key         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  subtitle    TEXT,
  features    TEXT,
  region      TEXT,
  task_region TEXT,
  task_type   TEXT,
  voice_mode  TEXT DEFAULT 'ball',
  recommended INTEGER DEFAULT 0,
  sort        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mission (
  id           TEXT PRIMARY KEY,
  scenario_key TEXT NOT NULL,
  task_no      TEXT,
  task_name    TEXT,
  task_type    TEXT,
  task_region  TEXT,
  source       TEXT,
  phase        TEXT DEFAULT 'T0',
  status       TEXT DEFAULT 'ready',
  progress     INTEGER DEFAULT 0,
  received_at  TEXT,
  started_at   TEXT,
  finished_at  TEXT,
  duration_sec INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS uav_resource (
  mission_id   TEXT NOT NULL,
  type         TEXT NOT NULL,
  total        INTEGER DEFAULT 0,
  available    INTEGER DEFAULT 0,
  allocated    INTEGER DEFAULT 0,
  pending      INTEGER DEFAULT 0,
  ability_tags TEXT,
  online_rate  INTEGER DEFAULT 100,
  PRIMARY KEY (mission_id, type)
);

CREATE TABLE IF NOT EXISTS uav (
  id         TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  type       TEXT NOT NULL,
  group_id   TEXT,
  status     TEXT DEFAULT 'online',
  battery    INTEGER DEFAULT 100,
  lng        REAL, lat REAL, alt REAL,
  online     INTEGER DEFAULT 1,
  signal     TEXT DEFAULT 'strong'
);

CREATE TABLE IF NOT EXISTS grp (
  id         TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  plan_id    TEXT,
  seq        INTEGER DEFAULT 0,
  name       TEXT NOT NULL,
  optical    INTEGER DEFAULT 0,
  radar      INTEGER DEFAULT 0,
  electronic INTEGER DEFAULT 0,
  comm       INTEGER DEFAULT 0,
  task_dir   TEXT,
  cover_area TEXT,
  task_attr  TEXT,
  coop_rel   TEXT,
  readiness  INTEGER DEFAULT 100,
  lng        REAL, lat REAL
);

CREATE TABLE IF NOT EXISTS target (
  id             TEXT PRIMARY KEY,
  mission_id     TEXT NOT NULL,
  target_no      INTEGER NOT NULL,
  name           TEXT,
  type           TEXT,
  threat         TEXT,
  confidence     INTEGER DEFAULT 0,
  lng            REAL, lat REAL, alt REAL,
  source         TEXT,
  dynamic_state  TEXT,
  status         TEXT DEFAULT 'red',
  strike_priority INTEGER DEFAULT 0,
  value_tag      TEXT,
  upgraded       INTEGER DEFAULT 0,
  UNIQUE (mission_id, target_no)
);

CREATE TABLE IF NOT EXISTS target_track (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  lng       REAL, lat REAL, speed REAL, heading REAL
);

CREATE TABLE IF NOT EXISTS link (
  id            TEXT PRIMARY KEY,
  mission_id    TEXT NOT NULL,
  from_node     TEXT,
  to_node       TEXT,
  signal        TEXT DEFAULT 'strong',
  bandwidth_mbps REAL DEFAULT 0,
  latency_ms    REAL DEFAULT 0,
  loss_rate     REAL DEFAULT 0,
  coverage_km2  REAL DEFAULT 0,
  mesh_progress INTEGER DEFAULT 0,
  state         TEXT DEFAULT 'green'
);

CREATE TABLE IF NOT EXISTS link_metric_curve (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL,
  kind       TEXT NOT NULL,     -- bandwidth | latency
  ts         INTEGER NOT NULL,
  value      REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS plan (
  id            TEXT PRIMARY KEY,
  mission_id    TEXT NOT NULL,
  side          TEXT NOT NULL,  -- group | strike
  seq           INTEGER DEFAULT 0,
  name          TEXT NOT NULL,
  subtitle      TEXT,
  method        TEXT,
  groups        TEXT,
  success_rate  INTEGER DEFAULT 0,
  effect        TEXT,
  stars         INTEGER DEFAULT 3,
  recommended   INTEGER DEFAULT 0,
  reason        TEXT,
  advantage     TEXT,
  note          TEXT,
  adopted       INTEGER DEFAULT 0,
  confirmed     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assessment (
  mission_id        TEXT PRIMARY KEY,
  total_damage_rate INTEGER DEFAULT 0,
  destroyed         INTEGER DEFAULT 0,
  severe            INTEGER DEFAULT 0,
  damaged           INTEGER DEFAULT 0,
  intact            INTEGER DEFAULT 0,
  area_control      INTEGER DEFAULT 0,
  effect_metrics    TEXT
);

CREATE TABLE IF NOT EXISTS target_result (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL,
  target_id  TEXT NOT NULL,
  result     TEXT              -- destroyed | severe | damaged | intact
);

CREATE TABLE IF NOT EXISTS mission_metrics (
  mission_id        TEXT PRIMARY KEY,
  coverage_rate     INTEGER DEFAULT 0,
  targets_found     INTEGER DEFAULT 0,
  coop_efficiency   INTEGER DEFAULT 0,
  link_stability    INTEGER DEFAULT 0,
  mesh_duration_sec INTEGER DEFAULT 0,
  alert_count       INTEGER DEFAULT 0,
  resource_used     TEXT,
  survival_rate     INTEGER DEFAULT 100
);

CREATE TABLE IF NOT EXISTS report (
  id         TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  report_no  TEXT,
  path       TEXT,
  created_at TEXT
);

-- 事件溯源（断链续行预留，TRD DAT-03）
CREATE TABLE IF NOT EXISTS event_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT,
  type       TEXT,
  payload    TEXT,
  ts         INTEGER
);
)SQL";

}  // namespace

Database& Database::instance() {
    static Database db;
    return db;
}

bool Database::open(const std::string& path) {
    std::lock_guard<std::mutex> lk(mtx_);
    if (db_) return true;

    std::error_code ec;
    auto parent = std::filesystem::path(path).parent_path();
    if (!parent.empty()) std::filesystem::create_directories(parent, ec);

    if (sqlite3_open(path.c_str(), &db_) != SQLITE_OK) {
        std::cerr << "[db] open failed: " << sqlite3_errmsg(db_) << std::endl;
        db_ = nullptr;
        return false;
    }
    sqlite3_busy_timeout(db_, 5000);
    return true;
}

void Database::close() {
    std::lock_guard<std::mutex> lk(mtx_);
    if (db_) {
        sqlite3_close(db_);
        db_ = nullptr;
    }
}

bool Database::migrate() {
    std::lock_guard<std::mutex> lk(mtx_);
    if (!db_) return false;
    char* err = nullptr;
    if (sqlite3_exec(db_, kSchema, nullptr, nullptr, &err) != SQLITE_OK) {
        std::cerr << "[db] migrate failed: " << (err ? err : "?") << std::endl;
        if (err) sqlite3_free(err);
        return false;
    }
    return true;
}

bool Database::seedIfEmpty() {
    return Seed::seedIfEmpty();
}

}  // namespace mapapp
