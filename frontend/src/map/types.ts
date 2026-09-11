// 地图模块 · 对外类型契约
//
// 模块边界（见 ./README.md）：
//   仅依赖 maplibre-gl + @/api/types（后端契约 DTO，纯类型），
//   不依赖应用 store、功能面板、UI 组件库。
// 应用通过 <MapView data={...} /> 注入数据；模块自身只管理"地图怎么画"。
import type { Group, LinkEdge, LinkTopology, MapConfigData, Phase, ScenarioKey, Target, TargetTrackPoint, UavPosEvent } from '@/api/types'

/** 地图模块需要的一次性配置（来自 GET /api/v1/map/config） */
export type { MapConfigData }

/** 每一帧渲染所需的业务数据快照（应用侧组装，模块只读） */
export interface MapData {
  /** 地图初始化配置；为空时使用模块内置缺省视角 */
  config: MapConfigData | null
  scenarioKey: ScenarioKey
  phase: Phase
  /** 目标台账（含威胁配色与选中态） */
  targets: Target[]
  /** 当前选中目标（锁定框高亮） */
  selectedTargetId?: string | null
  /** 集群编组 */
  groups: Group[]
  /** 无人机实时位置（遥测） */
  uavs: UavPosEvent[]
  /** 链路边 + 拓扑节点 */
  edges: LinkEdge[]
  topology: LinkTopology | null
  /** 目标轨迹点（轨迹回溯） */
  track: TargetTrackPoint[]
}

/** 地图 UI 状态（清屏 / 图层开关 / 工具 / 显示模式） */
export type MapToolKey = 'select' | 'measure' | 'layer' | 'area' | 'new' | 'clear' | 'full' | 'draw'

export interface MapViewport {
  lng: number
  lat: number
  zoom: number
  bearing: number
}
