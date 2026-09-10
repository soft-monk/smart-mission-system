# `ai/` · Python AI 桥（FastAPI）

> 智能任务管理系统「AI 与语音」子系统。基准文档：`docs/05-开发/开发接口契约规格书.md`（下称"契约"）
> §1 端口、§2 统一约定、§3.8 AI 与语音、§7.6 语音文案；设计依据：`docs/04-设计/概要设计文档.md` 3.4。
> **范围**：只做两个场景（`scenario-1` 敏捷拒止布控 / `scenario-2` 集群协同攻击）的 AI 与语音桥。
> **场景三与全部三维能力已放弃，本子系统不实现、不预留**（契约 §0）。

---

## 1. 定位

```
浏览器（前端） ──/api/v1/ai/*──▶ C++ 后端（AiProxy 反代） ──▶ 本桥 127.0.0.1:8090 ──▶(有 Key/有网) OpenAI 兼容 API
                                                              └──(无 Key/超时/报错)──▶ rules.py 规则兜底（离线可跑通全部演示）
```

- **仅监听 `127.0.0.1:8090`**（`config.json` 可改；改成对外地址会打警告日志），密钥只留在服务端，不进前端。
- **无状态**：不落库、不缓存会话；每次请求独立判定"在线/离线"。
- **绝不 5xx**：`/chat`、`/stt`、`/tts` 三个接口在外网不可用、无 Key、上游报错、请求体异常时一律**降级返回 HTTP 200**，由 `provider` / `X-TTS-*` 响应头体现。

## 2. 文件

| 文件 | 作用 |
|---|---|
| `bridge.py` | FastAPI 应用与入口：`/health`、`/chat`、`/stt`、`/tts`，LLM 优先、规则兜底、异常兜底 |
| `rules.py` | 规则兜底引擎：契约 §7.6 逐字语音文案 + §7.3/§7.4 逐字方案名与结构化 `plan`；零第三方依赖 |
| `config.json` | 监听地址/端口、上游 API（Key/BaseUrl/模型）、超时、离线 TTS 兜底参数、日志级别 |
| `run_bridge.bat` | Windows 启动脚本：无 `.venv` 则创建 → 依赖缺失则安装 → 启动 `bridge.py`（`Ctrl+C` 停止） |
| `requirements.txt` | `fastapi`、`uvicorn[standard]`、`httpx`、`python-multipart`、`pydantic`（**必须保持纯 ASCII**，pip 在 Windows 下按本地编码读取） |

## 3. 启动

```bat
:: 一键（推荐）
E:\ds-harness-webMap\smart-mission-system\ai\run_bridge.bat

:: 手动
cd E:\ds-harness-webMap\smart-mission-system\ai
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe bridge.py            :: --port 8090 --log-level DEBUG --print-config
```

自检（不依赖任何第三方库、不联网）：

```bat
python rules.py
```

打印全部逐字文案、三套方案清单与意图命中结果。

## 4. 配置

`config.json` 为基准，**同名环境变量优先**（部署时不改文件即可切上游）。

| config.json | 环境变量 | 默认 | 说明 |
|---|---|---|---|
| `host` | `AI_BRIDGE_HOST` | `127.0.0.1` | 监听地址；非本机地址会警告（契约 §1 要求仅本机） |
| `port` | `AI_BRIDGE_PORT` | `8090` | 监听端口，与 C++ `aiBridgePort` 一致 |
| `apiKey` | `OPENAI_API_KEY` | `""` | 上游密钥；**空 = 全部走规则兜底** |
| `baseUrl` | `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容端点（须含 `/v1`） |
| `chatModel` | `OPENAI_CHAT_MODEL` / `OPENAI_MODEL` | `gpt-4o-mini` | 对话模型 |
| `sttModel` | `OPENAI_STT_MODEL` | `whisper-1` | 识别模型 |
| `ttsModel` / `ttsVoice` | `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` | `tts-1` / `alloy` | 合成模型与音色 |
| `enableLlm` / `enableStt` / `enableTts` | `AI_ENABLE_LLM` / `AI_ENABLE_STT` / `AI_ENABLE_TTS` | `true` | 分能力开关，关掉即强制兜底 |
| `llmTimeoutSec` / `speechTimeoutSec` / `connectTimeoutSec` | — | `12` / `20` / `5` | 秒；超时即静默降级 |
| `llmJsonMode` | — | `true` | 用 `response_format=json_object`；上游 400 时自动去掉重试一次 |
| `maxTtsChars` | — | `4000` | 在线 TTS 输入上限，超出截断 |
| `ruleFirstForDemoIntents` | `AI_RULE_FIRST` | `false` | `true` = 命中演示意图时**强制走规则**（保证演示逐字口径，即使配了 Key）；日常保持 `false` 以"LLM 优先" |
| `healthProbe` / `healthProbeIntervalSec` | — | `true` / `60` | 有 Key 时后台探活 `GET /models`，结果写入 `/health` 的 `llm/stt/tts` |
| `ffmpegPath` | — | `""` | 留空则从 PATH 找 `ffmpeg`；离线兜底时用它将 WAV 转 `audio/mpeg` |
| `logLevel` | `AI_LOG_LEVEL` | `INFO` | 日志级别（`logging` 标准库） |
| `sceneDefault` | — | `scenario-1` | 请求未带 `scene` 时的场景 |
| `ttsFallback.*` | — | 见文件 | 离线占位音频：`mode=tone|silence`、最短 0.3s、每字 0.05s、上限 4s、16kHz、660Hz |

## 5. 接口（契约 §3.8）

### 5.1 `GET /health`

各能力是否可用（`true` = 有 Key、该能力启用、且最近一次探活未判定不可达）。

```json
{"status":"ok","llm":false,"stt":false,"tts":false}
```

### 5.2 `POST /chat`

请求：`{ "missionId"?: string, "scene": "scenario-1"|"scenario-2", "prompt": string, "context"?: {"phase"?: "T0".."T7", "side"?: "group"|"strike"} }`

响应：

```json
{
  "text": "当前态势下，敌方呈分散防御结构……建议优先选择【敏捷拒止布控】模式。",
  "provider": "rule",
  "intent": "recommend_mode",
  "scene": "scenario-1",
  "plan":  { "name": "方案二｜多域协同压制方案", "method": "多域协同压制", "groups": ["前出侦察集群", "…"],
             "successRate": 82, "effect": "…", "reason": "…", "recommended": true },
  "plans": [ { … 方案一 … }, { … 方案二 … }, { … 方案三 … } ]
}
```

- `provider` 必为 `"llm"` 或 `"rule"`（契约要求）。
- `plan` / `plans` 为**附加字段**（契约写的是 `plan?` 单对象）：
  - `plan` = 本次推荐的那一套（`recommended: true`）；
  - `plans` = 该场景该侧别的完整三套，供前端直接渲染 T1 编组卡 / T5 打击卡；
  - `intent` = 命中的意图标识（`recommend_mode`、`link_multicluster`、`target_priority`、`choose_best_plan`、`generate_plan`、`mission_complete` … 或 `fallback`），可用于前端做动作联动；
  - `scene` = 归一后的场景标识。未知字段可安全忽略。
- 侧别推断：`context.side` 优先，其次 `context.phase`（`T1/T2 → group`，`T5/T6 → strike`），否则 `生成方案 → group`、`选择最优方案 → strike`。
- `context` 不是对象、`prompt` 缺失、请求体畸形：一律 200 + 规则兜底（`intent` 为 `fallback`/`invalid-request`）。

### 5.3 `POST /stt`

- 入参三种写法：`multipart/form-data`（字段 `file` / `audio` / `audioFile` / `data`）、裸字节体（`application/octet-stream` 等）、JSON `{"audioBase64":"…"}`。
- 响应：`{"text": "...", "provider": "llm"|"unavailable", "reason": "ok|no-api-key|disabled|upstream-unreachable|upstream-error|empty-audio|audio-read-error|invalid-request"}`。
- 无 Key / 上游失败：`{"text":"","provider":"unavailable","reason":"…"}` + **HTTP 200**（契约之外的可识别占位，前端语音状态机据此回到"文本输入"路径）。

### 5.4 `POST /tts`

请求：`{ "text": "测试", "voice"?: "alloy", "format"?: "mp3"|"wav" }` → 音频字节流。

| 场景 | Content-Type | 响应头 |
|---|---|---|
| 有 Key 且可用 | `audio/mpeg` | `X-TTS-Provider: llm`、`X-TTS-Fallback: 0` |
| 无 Key/失败，有 ffmpeg | `audio/mpeg` | `X-TTS-Provider: rule`、`X-TTS-Fallback: 1`、`X-TTS-Note: local-tone-mp3-fallback` |
| 无 Key/失败，无 ffmpeg | `audio/wav` | `X-TTS-Provider: rule`、`X-TTS-Fallback: 1`、`X-TTS-Note: local-wav-fallback-no-mp3-encoder` |

另有 `X-TTS-Duration-Ms`（占位音频时长）。**离线占位音频由标准库 `wave` 本地合成**（0.3s 起、按字数增长至多 4s 的 660Hz 淡入淡出音调，可配 `silence`），保证前端播放链路不崩。

## 6. 降级行为矩阵（**任何一格都不返回 5xx**）

| 情况 | `/health` | `/chat` | `/stt` | `/tts` |
|---|---|---|---|---|
| 无 Key（默认） | `llm/stt/tts=false` | 200 · `provider:"rule"` · 逐字文案 | 200 · `text:""` · `provider:"unavailable"` | 200 · 占位音频（mp3 或 wav） |
| 有 Key，网络不可达 | 探活失败后 `false` | 200 · `provider:"rule"` | 200 · 占位 | 200 · 占位音频 |
| 有 Key，上游 5xx/超时 | 该能力置 `false` | 200 · `provider:"rule"` | 200 · 占位 | 200 · 占位音频 |
| 有 Key，正常 | `true` | 200 · `provider:"llm"`（方案名强制对齐契约清单） | 200 · `provider:"llm"` | 200 · `audio/mpeg`（在线音色） |
| 请求体畸形 | — | 200 · `intent:"invalid-request"` | 200 · `reason:"invalid-request"` | 200 · 占位音频 |
| 未预期内部异常 | — | 200 · 规则兜底（`intent:"fallback"`） | 200 · 占位 | 200 · 占位音频 |

> 说明：`/health` 的 `llm/stt/tts` 依据"有 Key + 能力开启 + 后台探活（`GET {base}/models`，401/403/5xx/连接失败判不可用）"；`/chat`、`/stt`、`/tts` 真实调用失败时会把对应能力即时置为不可用，探活循环成功后再恢复。

## 7. 规则兜底覆盖（离线逐字口径）

### 7.1 契约 §7.6 逐字语音文案

| 场景 | 阶段 | 说话人 | 触发关键词（示例） | 逐字文案 |
|---|---|---|---|---|
| scenario-1 | T0 | 系统 | 态势建模 / 任务加载 | 已完成战场态势建模，当前区域存在三类任务模式匹配结果。检测到固定通信受限、敌方纵深防御明显，建议构建前沿局部任务体系。 |
| scenario-1 | T0 | 用户→AI | 推荐一个任务模式 / 推荐任务模式 | 当前态势下，敌方呈分散防御结构，通信节点暴露度较高，且前沿区域通信链路不稳定，建议优先选择【敏捷拒止布控】模式。 |
| scenario-1 | T2 | 系统 | 自组网 / 链路质量 | 通信链路已完成自组网，当前链路质量达到任务标准。前沿节点已具备独立通信与感知支撑能力。 |
| scenario-1 | T2 | 用户→AI | 链路是否支持多集群协同？ | 当前链路支持三集群并行数据回传与协同控制，通信延迟满足实时控制要求。在固定通信受限条件下，可支撑前沿节点自主运行。 |
| scenario-1 | T3 | 系统 | 异常电磁信号 / 潜在目标区 | 检测到异常电磁信号聚集区域，已标记为潜在目标区。疑似敌方通信保障节点或机动指挥活动区域。 |
| scenario-1 | T4 | 系统 | 高置信目标 / 威胁初评 | 已识别三处高置信目标，其中一处为指挥通信节点。系统已完成多源目标关联与威胁初评。 |
| scenario-1 | T4 | 用户→AI | 哪个目标优先级最高？ | 目标003为高价值节点，具备指挥与通信双重功能，建议优先纳入打击序列。该目标对敌方区域协同和防御组织具有关键支撑作用。 |
| scenario-1 | T5 | 系统 | 生成三套打击方案 / 目标信息包 | 基于目标价值、暴露时间窗口与链路稳定性，已生成三种打击方案。系统可同步生成目标信息包并推送至后方远程火力与空中支援力量。 |
| scenario-1 | T5 | 用户→AI | 选择最优方案 | 已为你选择方案二：多集群协同压制，该方案在当前环境下综合成功率最高。建议由无人集群持续跟踪目标，并为远程火力提供实时修正信息。 |
| scenario-1 | T6 | 系统 | 移动迹象 / 调整观察角度 | 目标区域出现移动迹象，建议调整光电集群观察角度。雷达与电子侦察数据正在持续校正目标位置。 |
| scenario-1 | T7 | 系统 | 任务完成 / 毁伤评估 | 任务完成，目标打击成功率92%，主要威胁节点已清除，建议保持区域持续监视。前沿节点可执行资源撤收、链路释放并转入下一部署地域。 |
| scenario-2 | T0 | 系统 | 态势建模 / 任务加载 | 已完成战场态势建模，当前区域具备多节点协同执行条件，云边端链路已建立，具备自主任务执行基础。 |
| scenario-2 | T0 | 用户→AI | 推荐任务模式 | 当前任务环境下，多源信息已在边缘节点完成融合处理，后方算力可实时参与决策优化，建议采用【集群协同攻击】模式，实现云边端一体化自主执行。 |
| scenario-2 | T2 | 系统 | 模型已下发 | 云端策略模型已下发，边缘节点完成本地模型加载，具备自主决策能力。 |
| scenario-2 | T2 | 系统 | 云端全局优化 / 边缘实时决策 | 当前系统支持云端全局优化 + 边缘实时决策 + 前端自主执行协同模式。 |
| scenario-2 | T2 | 用户→AI | 是否具备断链自主运行能力？ | 边缘节点已具备局部闭环运行能力，在通信波动条件下可维持任务连续执行。 |
| scenario-2 | T3 | 系统 | 态势融合 / 初筛标记 | 边缘节点已完成第一轮态势融合，目标活动区域已完成初筛标记。 |
| scenario-2 | T3 | 系统 | 全局一致性校核 | 多源信息已在边缘侧完成初步关联处理，并回传云端进行全局一致性校核。 |
| scenario-2 | T4 | 用户→AI | 优先处理哪个目标？ | 目标003为关键协同节点，具备通信与指挥双重功能，建议优先纳入集群协同攻击序列。 |
| scenario-2 | T5 | 系统 | 生成执行方案 / 云边端协同 | 基于云边端协同分析结果，系统已生成多种任务执行方案，可由边缘节点自主执行并实时回传云端优化结果。 |
| scenario-2 | T5 | 用户→AI | 选择最优方案 | 已选择方案二：集群协同攻击。该方案支持边缘自主决策与动态优化，适配高动态目标环境。 |
| scenario-2 | T7 | 系统 | 闭环已完成（横幅副文字） | 集群协同攻击闭环已完成 |

> 上表字符串来源为 `rules.py::VOICE`，可用 `python rules.py` 全量打印；跨场景补位（如场景二问"链路是否支持多集群协同"）使用同场景既有文案，不新造口径。

### 7.2 方案（`plan` / `plans`）

| 场景 | 侧别 | 方案（逐字） | 成功率 |
|---|---|---|---|
| scenario-1 | `group` | `方案一｜稳态侦察覆盖方案`、`方案二｜多域协同压制方案`（推荐）、`方案三｜重点区域突破方案` | 68 / 82 / 61（契约 §7.5） |
| scenario-1 | `strike` | `方案一 光电精确打击`、`方案二 多集群协同压制`（推荐）、`方案三 电子干扰配合` | 68 / 82 / 61 |
| scenario-2 | `group` | `方案一｜分布式稳态感知`、`方案二｜云边协同自适应攻击`（推荐）、`方案三｜集中式快速压制` | 74 / 88 / 70（演示占位，见 §9） |
| scenario-2 | `strike` | `方案一｜光电精确打击`、`方案二｜集群协同攻击`（推荐）、`方案三｜电子压制协同` | 74 / 88 / 70（演示占位，见 §9） |

编组侧六集群名、打击方式、打击效果（精准摧毁/压制摧毁/干扰瘫痪后打击）取契约 §7.3/§7.4/§7.5 与需求初稿 T5 表；LLM 路径返回的方案名会被强制对齐到上述清单（含"方案一/二/三"序号匹配）。

## 8. 与后端 / 前端的衔接

- C++ `AiProxy` 反代：`/api/v1/ai/chat` → 本桥 `/chat`，`/api/v1/ai/stt` → `/stt`，`/api/v1/ai/tts` → `/tts`；本桥无 `/api/v1` 前缀（契约 §3.8 由 C++ 补前缀）。
- 建议前端动作映射：`intent=choose_best_plan|generate_plan` → 高亮方案卡 + `plan.state(recommended)`；`intent=target_priority` → 目标详情/打击序列高亮；`intent=mission_complete` → T7 评估面板 + 播报。
- 语音三段式（系统播报→聆听→识别→动作→回复播报）：播报文本可直接用 `/chat` 传系统文案关键词取逐字稿，或用前端本地文案，二者一致。
- 麦克风需 secure context（HTTP 下不可用时退化为文本输入 + 按钮触发，契约 §9），本桥不涉及。

## 9. 存疑项与已知限制

1. **场景二方案成功率无契约来源**：契约 §7.5 只给场景一 68%/82%/61%（推荐评分 93%）。场景二取演示占位 `74/88/70`，集中在 `rules.py::PLANS`，一行可改。
2. **场景二非推荐方案的集群构成**为派生（从场景二 6 集群名单中选取子集）：契约只对场景二方案二的 6 集群与四型资源（光电 22/雷达 12/电子 10/通信 8）作了规定。
3. `effect` 除场景一打击侧（精准摧毁/压制摧毁/干扰瘫痪后打击）外均为**定性描述**，未编造分项百分比。
4. 离线 TTS 占位音为**音调而非语音**（标准库无法合成语音）；有 `ffmpeg` 时输出 `audio/mpeg`，否则 `audio/wav` 并在 `X-TTS-Note` 说明——契约写的是 `audio/mpeg`，本桥在无编码器时以 WAV 保证播放链路可用。
5. `/health` 的 `llm/stt/tts` 是"可用性判断"而非实时压测：有 Key 时以 `GET /models` 探活为准（部分兼容端点无 `/models` 会返回 404/405，本桥判为可用，真实失败在调用时即时置 `false`）。
6. 本桥**不实现** `/api/v1` 前缀、统一响应体 `{code,message,data}`、鉴权与限流——那些属于 C++ 后端（契约 §2），本桥只做本机内部接口。
7. 演示口径如需**绝对逐字**（即使配置了 Key 也不让 LLM 改写台词），把 `config.json` 的 `ruleFirstForDemoIntents` 置 `true`（或设 `AI_RULE_FIRST=1`）。
