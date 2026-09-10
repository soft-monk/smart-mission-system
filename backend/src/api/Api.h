// Api.h —— REST API 处理器（契约 §3）
//
// 采用手写路由（main.cc 中注册），保持端点表与《开发接口契约规格书》§3 一一对应、便于对照。
#pragma once
#include <functional>
#include <string>

#include <nlohmann/json.hpp>

#include <drogon/HttpRequest.h>
#include <drogon/HttpResponse.h>

namespace mapapp {

using Req = drogon::HttpRequestPtr;
using Cb  = std::function<void(const drogon::HttpResponsePtr&)>;

namespace api {

// 统一响应体 {code,message,data}
drogon::HttpResponsePtr ok(const nlohmann::json& data);
drogon::HttpResponsePtr fail(int code, const std::string& message, drogon::HttpStatusCode http = drogon::k400BadRequest);

// 取当前任务 id（query 参数 missionId 优先，否则取当前任务）
std::string resolveMissionId(const Req& req);

// ---- §3.1 健康与配置 ----
void health(const Req&, Cb);
void mapConfig(const Req&, Cb);

// ---- §3.2 场景与任务 ----
void scenarios(const Req&, Cb);
void recommendScenario(const Req&, Cb);
void createMission(const Req&, Cb);
void currentMission(const Req&, Cb);
void missionDetail(const Req&, Cb, const std::string& id);
void setPhase(const Req&, Cb, const std::string& id);
void resetMission(const Req&, Cb, const std::string& id);

// ---- §3.3 资源与编组 ----
void uavs(const Req&, Cb);
void groups(const Req&, Cb);
void generateGroups(const Req&, Cb);
void plans(const Req&, Cb);
void adoptPlan(const Req&, Cb, const std::string& id);
void optimizePlan(const Req&, Cb, const std::string& id);
void confirmPlan(const Req&, Cb, const std::string& id);

// ---- §3.4 链路 ----
void linkTopology(const Req&, Cb);
void linkMetrics(const Req&, Cb);
void optimizeLink(const Req&, Cb);
void linkCurves(const Req&, Cb);

// ---- §3.5 目标 ----
void targets(const Req&, Cb);
void targetDetail(const Req&, Cb, const std::string& id);
void targetTrack(const Req&, Cb, const std::string& id);
void targetAction(const Req&, Cb, const std::string& id, const std::string& action);

// ---- §3.6 执行 ----
void executionStatus(const Req&, Cb);
void guide(const Req&, Cb);
void replan(const Req&, Cb);

// ---- §3.7 评估与报告 ----
void assessment(const Req&, Cb);
void reports(const Req&, Cb);
void createReport(const Req&, Cb);

// ---- §3.8 AI 代理 ----
void aiChat(const Req&, Cb);
void aiStt(const Req&, Cb);
void aiTts(const Req&, Cb);
void aiHealth(const Req&, Cb);

// ---- §3.9 媒体 ----
void videos(const Req&, Cb);

}  // namespace api
}  // namespace mapapp
