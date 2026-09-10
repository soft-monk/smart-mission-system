// 启动加载界面（契约 §7.1）
import React, { useEffect } from 'react'
import { useStore } from '@/stores/useStore'
import { Bar, Icon, LogoMark } from '@/components/ui'

export const BootScreen: React.FC = () => {
  const progress = useStore((s) => s.bootProgress)
  const modules = useStore((s) => s.bootModules)
  const overview = useStore((s) => s.bootOverview)
  const footer = useStore((s) => s.bootFooter)
  const loadBoot = useStore((s) => s.loadBoot)

  useEffect(() => {
    void loadBoot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(ellipse at 50% 40%, #0d1e38 0%, #050a14 70%)',
    }}>
      <TopBar />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48 }}>
        {/* 中央 LOGO + 进度 */}
        <div style={{ width: 520, textAlign: 'center' }}>
          <LogoMark />
          <h1 style={{ fontSize: 30, letterSpacing: 6, margin: '22px 0 6px', fontWeight: 700 }}>智能任务管理系统</h1>
          <div style={{ color: 'var(--text-1)', fontSize: 14, marginBottom: 26 }}>系统启动中，请稍候…</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}><Bar value={progress} /></div>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--cyan)', minWidth: 52 }}>{progress}%</span>
          </div>

          {/* 模块加载进度 */}
          <section className="panel" style={{ marginTop: 30, textAlign: 'left' }}>
            <header className="panel-title"><Icon name="layers" /><span>模块加载进度</span></header>
            <div className="panel-body grid-4" style={{ gap: 14 }}>
              {modules.map((m) => (
                <div key={m.key}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-1)', marginBottom: 6 }}>{m.name}</div>
                  <Bar value={m.percent} tone={m.percent >= 100 ? 'green' : 'blue'} />
                  <div style={{ fontSize: 11, color: m.percent >= 100 ? 'var(--green)' : 'var(--cyan)', marginTop: 4 }}>
                    {m.percent}%
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* 右侧系统状态 */}
        <section className="panel" style={{ width: 250 }}>
          <header className="panel-title"><Icon name="shield" /><span>系统状态</span></header>
          <div className="panel-body">
            {overview.map((o) => (
              <div key={o.key} className="kv" style={{ padding: '9px 0', borderBottom: '1px solid rgba(80,160,255,.10)' }}>
                <span className="k">{o.name}</span>
                <span className="v v-green">{o.text}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer style={{
        height: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 26px',
        borderTop: '1px solid var(--panel-border)', color: 'var(--text-1)', fontSize: 13,
      }}>
        <Icon name="dot" className="pulse" />
        {footer}
      </footer>
    </div>
  )
}

const TopBar: React.FC = () => (
  <header style={{
    height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', gap: 10,
    padding: '0 22px', borderBottom: '1px solid var(--panel-border)',
  }}>
    <LogoMark small />
    <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1 }}>智能任务管理系统</span>
    <span className="spacer" />
    <span className="v-green" style={{ fontSize: 12.5 }}>网络：已连接</span>
    <Icon name="wifi" />
    <Icon name="battery" />
    <TimeText />
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(80,160,255,.22)', border: '1px solid var(--panel-border-strong)' }} />
  </header>
)

const TimeText: React.FC = () => {
  const [t, setT] = React.useState(new Date())
  useEffect(() => {
    const id = window.setInterval(() => setT(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span style={{ fontSize: 12.5, color: 'var(--text-1)' }}>{t.toLocaleTimeString('zh-CN', { hour12: false })}</span>
}
