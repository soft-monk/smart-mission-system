// panels/common.tsx —— 阶段面板共用浮层工具（已由主程完成，子任务请直接复用，勿重复创建）
// 说明：PhasePanel 容器为 pointer-events:none，因此每个可交互卡片必须显式开启 pointerEvents。
import React from 'react'
import { Icon } from '@/components/ui'
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
