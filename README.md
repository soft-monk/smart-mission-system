# 智能任务管理系统（mapApp）

内网 Web 应用（B/S）：**一台主机部署服务端，其他电脑/平板通过浏览器输入网址访问操作，客户端零安装**。技术栈：**React/TypeScript + MapLibre GL（+deck.gl）+ C++ 后端（Drogon）+ WebSocket 实时通道 + Python 桥（在线大模型 API）**。

## 目录结构

```
mapApp/
├─ docs/                     # 全部文档（分类安放）
│  ├─ 01-需求/               # 界面与流程需求初稿（产品需求源，只读）+ 原型素材
│  ├─ 02-技术需求/           # 技术需求文档（研发实施依据，含分阶段验证 P0–P4）
│  ├─ 03-参考/               # 术语与工具速查、开发环境与资源下载清单
│  └─ 04-设计/               # 概要设计文档（架构级：怎么做）
├─ frontend/                 # React + TypeScript（Vite，浏览器渲染）
│  └─ src/{api,ws,map,layers,stores,app}
├─ backend/                  # C++ 服务端（Drogon）
│  ├─ src/                   # C++ 源码
│  └─ static/                # 前端产物落点（构建期生成，不入库）
├─ ai/                       # Python AI 桥（FastAPI：LLM/ASR/TTS 在线 API）
├─ tiles/                    # 预切瓦片数据（raster/vector；三维数据已取消，二进制不入库）
├─ media/                    # 本地演示视频 mp4（不入库）
├─ scripts/                  # 构建与部署脚本
└─ release/                  # 服务端部署包输出（不入库）
```

## 文档索引

| 文档 | 位置 | 用途 |
|---|---|---|
| 界面与流程需求初稿 | docs/01-需求/ | 产品界面/流程需求源（原始文件只读） |
| 技术需求文档 | docs/02-技术需求/ | 研发实施依据：编号需求、接口契约、分阶段实现与验证（P0–P4） |
| 概要设计文档 | docs/04-设计/ | 架构级设计：进程模型、模块划分、关键流程、接口/数据/部署 |
| 术语与工具速查 | docs/03-参考/ | 术语对照手册（C++ 工程师向） |
| 开发环境与资源下载清单 | docs/03-参考/ | 工具链/数据/素材/API 下载地址与验证清单 |
| AI 协作开发规范与文档体系指南 | docs/02-技术需求/ | Agent 协作开发规范（文档驱动） |
| 已实现需求文档（as-built） | docs/05-开发/ | **当前代码实际实现了什么** + 接口清单 + 实测记录 + 未实现清单 |
| 开发接口契约规格书 | docs/05-开发/ | REST/WS/数据模型/文案/设计 tokens 的唯一基准 |
| 多端运行与环境配置 | docs/05-开发/ | 换机指南、环境变量（宏）清单、首次构建排障 |

## 快速开始（三步跑通）

在 **cmd**（不是 PowerShell）里，于仓库根目录执行：

```bat
scripts\doctor.bat        :: 1) 环境体检：逐项 OK/MISS + 修复指引
scripts\setup_env.bat     :: 2) 一次性：建 ai\.venv + 装 Python 依赖 + npm install
scripts\fetch_tiles.bat   :: 3) 首次抓底图瓦片（约 1.3 万张，幂等可续跑；停止：scripts\stop_tiles.bat）
scripts\build_all.bat     :: 4) 构建：前端 -> backend\static，C++ -> backend\bin\Release\mapapp.exe
scripts\start_all.bat     :: 5) 启动：AI 桥 + 后端
::    浏览器访问  http://127.0.0.1:8080/   或   http://<本机IP>:8080/
scripts\stop_all.bat      ::    停止
```

**首次构建耗时**：vcpkg 要从源码编译 Drogon 及其依赖（openssl、trantor、sqlite3 等），
实测约 **12 分钟**；之后增量构建十几秒。vcpkg 还会下载 CMake / PowerShell / Perl 等大文件，
国内直连 GitHub 易超时——用 `scripts\env.local.bat` 配代理，或预置到 `%USERPROFILE%\vcpkg\downloads\`，
详见 [多端运行与环境配置](docs/05-开发/多端运行与环境配置.md) 第 5 节。

全新机器若 `doctor.bat` 报 vcpkg 缺失：`scripts\install_vcpkg.bat`（一次性）。

> **为什么必须用 cmd**：Windows 默认执行策略禁止运行 `npm.ps1`，在 PowerShell 里直接敲 `npm` 会报
> `running scripts is disabled on this system`；批处理调用 `npm.cmd` 不受影响。

**换机 / 多端运行**：所有机器相关差异（工具路径、端口）只写 `scripts\env.local.bat`——
复制 `scripts\env.local.bat.example` 后按需修改，该文件已被 git 忽略，不干扰其他机器。
完整的环境变量（宏）清单与故障排查表见 **[docs/05-开发/多端运行与环境配置.md](docs/05-开发/多端运行与环境配置.md)**。

**运行前提**

| 依赖 | 说明 |
|---|---|
| VS2022（C++ 桌面开发） | 提供 MSVC；CMake 由 PATH 或 VS 自带版本自动探测（`vswhere`） |
| vcpkg | 提供 drogon / sqlite3 / nlohmann-json；缺失时运行 `scripts\install_vcpkg.bat` |
| Node.js 18+ | 构建前端（`npm install` + `vite build`） |
| Python 3.10+ | AI 桥（优先 3.12/3.11）；`ai\run_bridge.bat` 自动建 venv 并装依赖 |
| OpenAI API Key | 可选；AI/语音在线能力所需，放环境变量 `OPENAI_API_KEY` |

**端口约定**（全部可由 `scripts\env.local.bat` 覆盖，无需改配置文件）

| 服务 | 默认 | 覆盖变量 |
|---|---|---|
| C++ 服务端（HTTP/WS） | `0.0.0.0:8080` | `MAPAPP_HTTP_PORT` / `MAPAPP_LISTEN_ADDR` |
| Python AI 桥（仅本机） | `127.0.0.1:8090` | `MAPAPP_AI_PORT`（C++ 反代目标同步跟随） |
| UDP 组播遥测 | `239.10.10.10:45454` | `MAPAPP_UDP_GROUP` / `MAPAPP_UDP_PORT` |

优先级：**命令行参数 > 环境变量 > config.json > 内置默认**。

**已规避的环境坑（脚本内处理，换机不再复现）**

- **乱码**：所有 `.bat` 输出改为纯 ASCII 英文；C++/Python 进程经 `run_server.bat` / `run_bridge.bat`
  包装（内部 `chcp 65001`）启动，中文日志正常显示
- **硬编码路径**：旧脚本写死 `VS2022 Community` 与 `C:/vcpkg`，换机必挂 → 改为 `env.bat` 自动探测，
  机器差异集中到 `env.local.bat`
- **重复代理变量**：同时存在 `NO_PROXY` 与 `no_proxy` 时 .NET 环境字典抛"已添加项"，
  MSBuild/CL.exe 直接失败 → `env.bat` 统一清空
- **`no_proxy` 含 `[::1]`**：httpx 建客户端抛 `InvalidURL` 使 AI 桥启动失败 → 桥改为 `trust_env=False`
- **缺少运行目录**：`backend\data`、`data\reports` 不存在导致日志重定向失败 → 启动脚本自动创建

## 开始

1. 环境准备：见 `docs/03-参考/开发环境与资源下载清单.md`
2. 完整系统需求与阶段划分：见 `docs/02-技术需求/智能任务管理系统_技术需求文档.md`
3. 架构级设计：见 `docs/04-设计/概要设计文档.md`
4. **研发接口基准**（REST/WS/数据模型/文案/设计 tokens）：见 `docs/05-开发/开发接口契约规格书.md`

## 构建与部署流水线（B/S）

```
frontend: npm run build → 产物复制到 backend/static
backend:  cmake + vcpkg（drogon/sqlite3/nlohmann-json）→ backend/bin/Release/mapapp.exe
ai:       python -m venv + pip install → FastAPI 桥（仅本机监听）
部署:     mapapp.exe + static（前端/瓦片/视频）+ data + ai 环境 → 服务端部署包（release/）
客户端:   浏览器访问 http://<服务端内网IP>:<端口>/，零安装、零升级
```
