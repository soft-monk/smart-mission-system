// AlertToasts —— 告警浮层（契约 §4 WS `alert` 事件 / §8 语义色）
// 从 store.alerts 渲染右上角 toast：最多同时显示 3 条（最新在上），8 秒后自动淡出。
// 位置固定 top:64px / right:318px（右侧栏宽 300px + 间距），不遮挡右侧栏与顶部状态栏。
import React, { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { Icon } from '@/components/ui'
import type { AlertEvent } from '@/api/types'

type Level = 'info' | 'warn' | 'critical'

/** 已入列的 toast（带稳定 id 与入列时刻，用于去重与自动淡出） */
interface Toast extends AlertEvent {
  id: number
  at: number
}

const VISIBLE_MAX = 3
const TTL_MS = 8000

const LEVEL_META: Record<Level, { color: string; icon: string; label: string }> = {
  info: { color: 'var(--blue)', icon: 'dot', label: '提示' },
  warn: { color: 'var(--amber)', icon: 'alert', label: '告警' },
  critical: { color: 'var(--red)', icon: 'alert', label: '严重' },
}

const normalizeLevel = (level: string): Level =>
  level === 'warn' || level === 'critical' ? level : 'info'

export const AlertToasts: React.FC = () => {
  const alerts = useStore((s) => s.alerts)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [now, setNow] = useState(() => Date.now())
  const seq = React.useRef(0)

  // 新告警入列（store 里 alerts 为最新在前）
  useEffect(() => {
    if (alerts.length === 0) return
    setToasts((prev) => {
      const fresh = alerts.filter(
        (a) => !prev.some((p) => p.title === a.title && p.text === a.text),
      )
      if (fresh.length === 0) return prev
      const at = Date.now()
      const added = fresh.map((a) => ({ ...a, id: ++seq.current, at }))
      return [...prev, ...added].slice(-12)
    })
  }, [alerts])

  // 计时器：驱动自动淡出（到点即移除）
  useEffect(() => {
    if (toasts.length === 0) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [toasts.length])

  useEffect(() => {
    setToasts((prev) => {
      const alive = prev.filter((t) => now - t.at < TTL_MS)
      return alive.length === prev.length ? prev : alive
    })
  }, [now])

  const visible = toasts.slice(-VISIBLE_MAX).reverse() // 最新在上

  if (visible.length === 0) return null

  return (
    <div style={{
      position: 'fixed', top: 64, right: 318, zIndex: 60, width: 300,
      display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
    }}>
      <style>{'@keyframes dshAlertOut{from{opacity:1;transform:none}to{opacity:0;transform:translateX(16px)}}'}</style>
      {visible.map((t) => {
        const level = normalizeLevel(t.level)
        const meta = LEVEL_META[level]
        const remain = TTL_MS - (now - t.at)
        const fading = remain <= 900
        return (
          <div
            key={t.id}
            className="panel fade-in"
            style={{
              pointerEvents: 'auto', padding: '9px 11px', borderLeft: `3px solid ${meta.color}`,
              borderColor: meta.color, animation: fading ? 'dshAlertOut .9s ease forwards' : undefined,
            }}
          >
            <div className="row" style={{ gap: 6 }}>
              <Icon name={meta.icon} size={13} className="v-cyan" />
              <b style={{ fontSize: 12.5, color: meta.color, flex: 1, minWidth: 0 }}>{t.title}</b>
              <span style={{ fontSize: 10.5, color: 'var(--text-2)' }}>{meta.label}</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((p) => p.id !== t.id))}
                title="关闭"
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-2)',
                  cursor: 'pointer', padding: 0, display: 'inline-flex',
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.6, marginTop: 4 }}>
              {t.text}
            </div>
            {t.code && (
              <div style={{ fontSize: 10.5, color: 'var(--text-2)', marginTop: 3 }}>代码：{t.code}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
