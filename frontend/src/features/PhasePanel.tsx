// PhasePanel —— 阶段面板路由（按 phase 挂载对应面板；TRD 1.2.1 场景配置化的最小落地）
// 面板为地图浮层，互斥挂载，避免叠加遮挡。
import React from 'react'
import { useStore } from '@/stores/useStore'
import { T0Panel } from '@/features/panels/T0Panel'
import { T1Panel } from '@/features/panels/T1Panel'
import { T2Panel } from '@/features/panels/T2Panel'
import { T3Panel } from '@/features/panels/T3Panel'
import { T4Panel } from '@/features/panels/T4Panel'
import { T5Panel } from '@/features/panels/T5Panel'
import { T6Panel } from '@/features/panels/T6Panel'
import { T7Panel } from '@/features/panels/T7Panel'

const PANELS: Record<string, React.FC> = {
  T0: T0Panel,
  T1: T1Panel,
  T2: T2Panel,
  T3: T3Panel,
  T4: T4Panel,
  T5: T5Panel,
  T6: T6Panel,
  T7: T7Panel,
}

export const PhasePanel: React.FC = () => {
  const phase = useStore((s) => s.phase)
  const Panel = PANELS[phase] ?? T0Panel
  return (
    <div key={phase} className="fade-in" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 7 }}>
      <Panel />
    </div>
  )
}
