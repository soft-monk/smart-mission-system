// panels/common.tsx —— 阶段面板共用浮层工具（已由主程完成，子任务请直接复用，勿重复创建）
// 说明：PhasePanel 容器为 pointer-events:none，因此每个可交互卡片必须显式开启 pointerEvents。
import React from 'react'
import { Icon, LiveNum } from '@/components/ui'
import { useStore } from '@/stores/useStore'

/** 地图上的浮层卡片（自带 panel 样式与滚动容器；hud 开启四角括号，scan 开启扫描光带） */
export const FloatCard: React.FC<{
  children: React.ReactNode
  title?: string
  icon?: string
  style?: React.CSSProperties
  extra?: React.ReactNode
  maxHeight?: number | string
  hud?: boolean
  scan?: boolean
}> = ({ children, title, icon, style, extra, maxHeight, hud = true, scan = false }) => (
  <section
    className={`panel ${hud ? 'hud' : ''} ${scan ? 'scanline' : ''}`}
    style={{
      pointerEvents: 'auto', display: 'flex', flexDirection: 'column',
      maxHeight, overflow: 'hidden', ...style,
    }}
  >
    {title && (
      <header className="panel-title">
        {icon && <Icon name={icon} />}
        <span>{title}</span>
        <span className="spacer" />
        {extra}
      </header>
    )}
    <div className="panel-body" style={{ overflow: 'auto', flex: 1 }}>{children}</div>
  </section>
)

/** 底部动作条（跨越地图宽度，左右留边） */
export const BottomBar: React.FC<{ children: React.ReactNode; right?: number }> = ({ children, right = 320 }) => (
  <div
    className="panel"
    style={{
      position: 'absolute', left: 12, right, bottom: 12, pointerEvents: 'auto',
      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', zIndex: 9,
    }}
  >
    {children}
  </div>
)

/** 「进入下一阶段」按钮（自动调用 nextPhase） */
export const NextBtn: React.FC<{ children: React.ReactNode; variant?: 'default' | 'primary' | 'danger' }> = ({
  children, variant = 'primary',
}) => {
  const next = useStore((s) => s.nextPhase)
  return (
    <button className={`btn ${variant === 'default' ? '' : variant}`} onClick={() => void next()}>
      {children}
    </button>
  )
}

/** 一段带标题的小节（浮层卡内部使用） */
export const Sub: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="subhead">{title}</div>
    {children}
  </div>
)

/** 顶部提示横条（AI 提示 / 系统提示） */
export const TopBanner: React.FC<{ icon?: string; children: React.ReactNode; tone?: 'cyan' | 'amber' | 'red' }> = ({
  icon = 'wave', children, tone = 'cyan',
}) => (
  <div
    className="panel"
    style={{
      position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
      pointerEvents: 'auto', padding: '8px 16px', fontSize: 12.5, maxWidth: '52%',
      color: tone === 'cyan' ? '#cdf3ff' : tone === 'amber' ? '#ffe4b5' : '#ffd9d9',
      borderColor: tone === 'cyan' ? 'var(--panel-border-strong)' : tone === 'amber' ? 'var(--amber)' : 'var(--red)',
      zIndex: 9, textAlign: 'center', lineHeight: 1.5,
    }}
  >
    <Icon name={icon} /> {children}
  </div>
)

/**
 * 实时遥测条 —— 把 store 里不断推送的 UAV 遥测聚合成一排跳动指标。
 * 这是"数据饱满感"的核心：数值随 1s 周期遥测变化并短暂高亮，而不是静止的假数字。
 */
export const TelemetryStrip: React.FC<{ bottom?: number; left?: number; right?: number; compact?: boolean }> = ({
  bottom = 74, left = 12, right = 320, compact = false,
}) => {
  const uavPositions = useStore((s) => s.uavPositions)
  const linkMetrics = useStore((s) => s.linkMetrics)

  const list = React.useMemo(() => Object.values(uavPositions), [uavPositions])
  const stats = React.useMemo(() => {
    if (list.length === 0) return null
    const avg = (pick: (u: (typeof list)[number]) => number) =>
      list.reduce((a, u) => a + (pick(u) || 0), 0) / list.length
    const typeCount: Record<string, number> = {}
    list.forEach((u) => { typeCount[u.type] = (typeCount[u.type] ?? 0) + 1 })
    return {
      online: list.length,
      battery: avg((u) => u.battery),
      alt: avg((u) => u.alt),
      speed: avg((u) => u.speed),
      typeCount,
    }
  }, [list])

  return (
    <div
      className="panel grid-bg"
      style={{
        position: 'absolute', left, right, bottom, pointerEvents: 'auto', zIndex: 8,
        display: 'grid',
        gridTemplateColumns: compact ? 'repeat(4, minmax(0,1fr))' : 'repeat(6, minmax(0,1fr))',
        gap: 6, padding: '7px 9px',
      }}
    >
      <MiniStat k="在线无人机" v={stats ? stats.online : 0} u="架" tone="var(--cyan)" />
      <MiniStat k="平均电量" v={stats ? stats.battery : 0} u="%" digits={0}
                tone={stats && stats.battery < 40 ? 'var(--amber)' : 'var(--green)'} />
      <MiniStat k="平均高度" v={stats ? stats.alt : 0} u="m" digits={0} tone="var(--text-0)" />
      <MiniStat k="平均速度" v={stats ? stats.speed : 0} u="m/s" digits={1} tone="var(--text-0)" />
      {!compact && (
        <>
          <MiniStat k="带宽" v={linkMetrics?.bandwidthMbps ?? 0} u="Mbps" digits={0} tone="var(--cyan)" />
          <MiniStat k="时延" v={linkMetrics?.latencyMs ?? 0} u="ms" digits={0} tone="var(--cyan)" />
        </>
      )}
    </div>
  )
}

const MiniStat: React.FC<{ k: string; v: number; u?: string; digits?: number; tone?: string }> = ({
  k, v, u, digits = 0, tone,
}) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 10.5, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {k}
    </div>
    <div style={{ fontSize: 14.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: tone }}>
      <LiveNum value={v} digits={digits} />
      <span style={{ fontSize: 10, color: 'var(--text-2)', marginLeft: 2, fontWeight: 400 }}>{u}</span>
    </div>
  </div>
)
