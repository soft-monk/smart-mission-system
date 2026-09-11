# 地图模块（2D Map Module）

二维地图能力的**独立模块**：把「地图怎么画」与「业务怎么跑」彻底分开。
应用（T0–T7 流程界面、右侧面板、语音等）只通过本模块的公开 API 与数据契约交互。

## 1. 模块边界

```
frontend/src/map/
├─ index.ts            # 唯一公开入口（应用只能从 '@/map' 导入）
├─ MapView.tsx         # 地图容器：初始化 MapLibre、创建图层、同步数据
├─ MapToolbar.tsx      # 地图工具条（选择/测距/图层/区域/新建/清屏/全屏/标绘）+ 显示模式徽标
├─ Compass.tsx         # 指北针（自绘 SVG，随 bearing 旋转，点击复位正北）
├─ displayMode.ts      # 显示模式定义（随场景/阶段）
├─ store.ts            # 模块内 UI 状态：清屏、图层开关、工具、视口、显示模式
├─ instance.ts         # MapLibre 实例单例引用
├─ types.ts            # 对外类型契约（MapData 等）
└─ layers/
   └─ LayerManager.ts  # 原生图层管理：区域/链路/集群/目标/无人机/扫描/轨迹 + 分组显隐
```

**依赖规则**（保证可整模块移植）：

- 允许依赖：`maplibre-gl`、`@/api/types`（后端契约 DTO，纯类型）
- **禁止依赖**：`@/stores/useStore`（应用业务 store）、`@/features/*`（功能面板）、`@/components/*`（应用 UI 组件库）
- 工具条与指北针自带内联 SVG 图标与内联样式，不借用应用组件

## 2. 公开 API

| 导出 | 用途 |
|---|---|
| `<MapView data={MapData}>{children}</MapView>` | 地图容器；children 作为地图内浮层（工具条、面板等） |
| `<MapToolbar />` | 地图级控件：工具组 + 图层面板 + 清屏 + 全屏 |
| `<MapModeBadge mode={string} />` | 显示模式徽标（右上角） |
| `<Compass size?={number} />` | 指北针（默认随 `MapView` 内的 `mapInstance` 联动） |
| `useMapUiStore()` | 模块 UI 状态：`clearMode` / `activeTool` / `layersOpen` / `hiddenGroups` / `viewport` / `displayMode` |
| `LayerManager` | 命令式图层 API（`setGroupVisible`、`focus` 等），一般不需要直接用 |
| `LAYER_GROUPS` / `LAYER_GROUP_LABELS` | 图层分组清单与中文名 |
| `displayModeOf(scenarioKey, phase)` | 按场景+阶段取显示模式名 |
| `mapInstance` | MapLibre 实例（只读引用，供高级用法） |

## 3. 数据契约（`MapData`）

```ts
interface MapData {
  config: MapConfigData | null   // GET /api/v1/map/config 的结果（中心/缩放/瓦片模板/attribution）
  scenarioKey: ScenarioKey       // 'scenario-1' | 'scenario-2'
  phase: Phase                   // 'T0' … 'T7'
  targets: Target[]              // 目标台账（威胁配色、选中态由模块处理）
  selectedTargetId?: string | null
  groups: Group[]                // 集群编组
  uavs: UavPosEvent[]            // 无人机实时位置（遥测）
  edges: LinkEdge[]              // 链路边
  topology: LinkTopology | null  // 拓扑节点
  track: TargetTrackPoint[]      // 目标轨迹（回溯）
}
```

应用侧组装示例见 `frontend/src/app/useMapData.ts`（把业务 store 映射为 `MapData`）。
**接新数据源时只需换这个适配器，地图模块零改动。**

## 4. 图层分组（可独立开关）

`area`(任务区域) · `group`(集群编组) · `uav`(无人机/航迹) · `target`(目标/锁定框) ·
`link`(数据链路) · `scan`(扫描覆盖) · `track`(目标轨迹) · `trail`(飞行尾迹) · `pulse`(脉冲标记)

开关状态保存在 `useMapUiStore.hiddenGroups`，并在重新初始化地图后由 `LayerManager.applyVisibility()` 恢复。

## 5. 清屏（区别于全屏）

| 模式 | 行为 |
|---|---|
| 全屏 | 浏览器 Fullscreen API，页面布局不变 |
| **清屏** | 隐藏应用框架中除**左侧导航**与**底部状态栏**之外的一切（顶栏、右侧 AI 面板、阶段面板、语音球/语音卡、视频浮层、告警浮层、地图工具条），只留下**地图与地图上的绘制物** |

- 进入方式：地图工具条【清屏】
- 退出方式：屏幕右上角【退出清屏】小按钮，或按 `Esc`
- 状态：`useMapUiStore.clearMode`；应用框架据此决定隐藏哪些区域（见 `app/AppShell.tsx`）

## 6. 需求映射

| 需求编号 | 本模块实现 |
|---|---|
| MAP-01 二维底图漫游/缩放/控件 | `MapView`（NavigationControl + ScaleControl + 拖拽/滚轮/双击） |
| CAND-MAP-03 指北针 | `Compass` |
| MAP-02/03/05 动态图层 | `layers/LayerManager.ts` |
| MAP-04 多图层独立开关 | `MapToolbar` 图层面板 + `LayerManager.setGroupVisible` |
| CAND-MAP-01 显示模式 | `displayMode.ts` + `MapModeBadge` |
| CAND-MAP-02 工具组 | `MapToolbar`（选择/图层/清屏/全屏已实现；测距/区域/新建/标绘为占位） |
| 清屏（本次新增） | `useMapUiStore.clearMode` + 应用框架适配 |

## 7. 复用方式

1. 拷贝 `frontend/src/map/` 整个目录
2. 保证目标工程有 `@/api/types`（或把 `types.ts` 里的 DTO 换成自己的类型）
3. 提供 `MapData`：直接传 props，或照抄 `app/useMapData.ts` 写适配器
4. 渲染：`<MapView data={data}><MapToolbar /><Compass /><MapModeBadge mode={mode} /></MapView>`

## 8. 约束与注意事项

- **仅二维**：`dragRotate/maxPitch` 已锁定为平面；三维能力已在 v1.2 范围收敛中放弃
- 瓦片路径 `/tiles/raster/{z}/{x}/{y}.jpg`，缺瓦片回落纯色底（`fallback: solid`）
- 图层数据一律 `source.setData()` 增量更新，不重建图层（性能设计要点 UI-06）
- 地图渲染走 WebGL canvas，React 只负责 DOM 浮层，避免互相拖累帧率

## 9. 模块级开关（`options.ts`）

| 选项 | 默认 | 说明 |
|---|---|---|
| `showAttribution` | `false` | 是否在地图右下角显示底图版权署名（Esri / Maxar / Earthstar Geographics） |
| `compactAttribution` | `true` | 显示署名时的紧凑模式（悬停展开） |

> ⚠️ **合规提醒**：Esri World Imagery 条款通常要求保留署名。当前默认隐藏（按项目要求保持界面整洁），
> **合规责任由使用方承担**；需要恢复时把 `options.ts` 里的 `showAttribution` 改回 `true` 即可，
> 无需改动其它文件（关闭时同时不写入 `source.attribution`，避免残留署名文本）。
