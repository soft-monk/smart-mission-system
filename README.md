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

## 开始

1. 环境准备：见 `docs/03-参考/开发环境与资源下载清单.md`
2. 完整系统需求与阶段划分（P0 从第 7.3 节开始）：见 `docs/02-技术需求/智能任务管理系统_技术需求文档.md`
3. 架构级设计：见 `docs/04-设计/概要设计文档.md`

## 构建与部署流水线（B/S）

```
frontend: pnpm build → 产物复制到 backend/static
backend:  cmake + vcpkg（drogon/sqlite3/nlohmann-json）→ mapapp.exe
ai:       python -m venv + pip install → FastAPI 桥（仅本机监听）
部署:     mapapp.exe + static（前端/瓦片/视频）+ data + ai 环境 → 服务端部署包（release/）
客户端:   浏览器访问 http://<服务端内网IP>:<端口>/，零安装、零升级
```
