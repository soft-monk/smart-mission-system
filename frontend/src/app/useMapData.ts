// 地图数据适配器：把应用业务 store 映射为地图模块的 MapData
//
// 这是**应用与地图模块之间唯一的连接点**：换业务状态源、接真实遥测，
// 都只改这里；frontend/src/map/ 内部零改动（保持模块可独立移植）。
import { useMemo } from 'react'
import { useStore } from '@/stores/useStore'
import type { MapData } from '@/map'

export function useMapData(): MapData {
  const config = useStore((s) => s.mapConfig)
  const scenarioKey = useStore((s) => s.scenarioKey)
  const phase = useStore((s) => s.phase)
  const targets = useStore((s) => s.targets)
  const selectedTargetId = useStore((s) => s.selectedTargetId)
  const groups = useStore((s) => s.groups)
  const uavPositions = useStore((s) => s.uavPositions)
  const edges = useStore((s) => s.linkEdges)
  const topology = useStore((s) => s.linkTopology)
  const track = useStore((s) => s.trackPoints)

  return useMemo<MapData>(() => ({
    config: config ?? null,
    scenarioKey,
    phase,
    targets,
    selectedTargetId,
    groups,
    uavs: Object.values(uavPositions),
    edges,
    topology: topology ?? null,
    track,
  }), [config, scenarioKey, phase, targets, selectedTargetId, groups, uavPositions, edges, topology, track])
}
