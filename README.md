# 智能任务管理系统（mapApp）

平板端智能任务指挥与无人集群协同系统。技术栈：**Electron + React/TypeScript + MapLibre GL（+deck.gl）+ Java Spring Boot + MQTT + C++ 性能模块**（视频/语音/推理）。

## 目录结构

```
mapApp/
├─ docs/                     # 全部文档（分类安放）
│  ├─ 01-需求/               # 界面与流程需求初稿（产品需求源，只读）
│  ├─ 02-技术需求/           # 技术需求文档（研发实施依据，含分阶段验证 P0–P4）
│  ├─ 03-方案/               # 最小验证方案（第一步实施切片 P0）
│  ├─ 04-探讨/               # 技术路线与方向探讨（决策过程存档）
│  ├─ 05-参考/               # 术语与工具速查、开发环境与资源下载清单
│  └─ 06-设计/               # 概要设计文档（架构级：怎么做）
├─ frontend/                 # React + TypeScript（Vite）
│  └─ src/{api,map,layers,stores,app}
├─ shell/                    # Electron 主进程
├─ backend/                  # Java Spring Boot sidecar
│  └─ src/main/{java/com/mapapp/..., resources/static}
├─ tiles/                    # 离线瓦片数据（raster/dem/3dtiles/vector；二进制不入库）
├─ scripts/                  # 构建与打包脚本
├─ runtime/                  # jlink 裁剪 JRE 输出（不入库）
└─ release/                  # 打包产物（不入库）
```

## 文档索引

| 文档 | 位置 | 用途 |
|---|---|---|
| 界面与流程需求初稿 | docs/01-需求/ | 产品界面/流程需求源（原始文件只读） |
| 技术需求文档（完整版） | docs/02-技术需求/ | 研发实施依据：85+ 条编号需求、接口契约、分阶段实现与验证 |
| 最小验证方案 | docs/03-方案/ | 第一步实施切片（P0：壳 + 2D 底图 + sidecar + 离线瓦片） |
| 技术路线与方向探讨 | docs/04-探讨/ | 历轮决策确认过程存档 |
| 术语与工具速查 | docs/05-参考/ | 非 C++ 概念对照手册 |
| 开发环境与资源下载清单 | docs/05-参考/ | 工具链/数据/模型下载地址与验证清单 |
| 概要设计文档 | docs/06-设计/ | 架构级设计：进程模型、模块划分、关键流程、接口/数据/部署 |

## 开始

1. 环境准备：见 `docs/05-参考/开发环境与资源下载清单.md`
2. 第一步实施（P0）：见 `docs/03-方案/最小验证方案.md`
3. 完整系统需求与阶段划分：见 `docs/02-技术需求/智能任务管理系统_技术需求文档.md`

## 构建流水线（按最小验证方案 10.2）

```
frontend: pnpm build → 产物复制到 backend 静态目录
backend:  mvn package → fat-jar
runtime:  jlink 生成裁剪 JRE
shell:    electron-builder --win portable → 组装便携包（release/）
```
