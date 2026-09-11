// 地图模块 · 显示模式定义（CAND-MAP-01）
//
// 显示模式随任务阶段（T0–T7）与场景变化，是"地图当前呈现什么"的语义标签，
// 也决定区域/图层的高亮侧重。定义放模块内，应用只负责按阶段传入。
import type { Phase, ScenarioKey } from '@/api/types'

export const DISPLAY_MODE: Record<ScenarioKey, Record<Phase, string>> = {
  'scenario-1': {
    T0: '综合态势', T1: '综合态势', T2: '链路拓扑', T3: '侦察展开',
    T4: '目标识别', T5: '任务规划', T6: '实时态势', T7: '复核态势',
  },
  'scenario-2': {
    T0: '综合态势', T1: '综合态势', T2: '云边端拓扑', T3: '边缘融合态势',
    T4: '目标识别', T5: '任务规划', T6: '引导控制', T7: '结果汇总',
  },
}

export function displayModeOf(scenarioKey: ScenarioKey, phase: Phase): string {
  return DISPLAY_MODE[scenarioKey]?.[phase] ?? '综合态势'
}
