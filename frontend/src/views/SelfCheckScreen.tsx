// 语音引导校验界面（契约 §7.1）——一键自检 5 项 + 系统状态概览
import React from 'react'
import { useStore } from '@/stores/useStore'
import { Btn, Icon, KV, LogoMark } from '@/components/ui'

export const SelfCheckScreen: React.FC = () => {
  const items = useStore((s) => s.selfCheckItems)
  const done = useStore((s) => s.selfCheckDone)
  const running = useStore((s) => s.selfCheckRunning)
  const run = useStore((s) => s.runSelfCheck)
  const overview = useStore((s) => s.bootOverview)
  const setView = useStore((s) => s.setView)
  const bootstrap = useStore((s) => s.bootstrap)

  const enter = async () => {
    await bootstrap()
    setView('flow')
  }

  const allNormal = items.length > 0 && items.every((i) => i.status === 'normal')

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(ellipse at 50% 40%, #0d1e38 0%, #050a14 70%)',
    }}>
      <header style={{
        height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 22px', borderBottom: '1px solid var(--panel-border)',
      }}>
        <LogoMark small />
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1 }}>智能任务管理系统</span>
        <span className="spacer" />
        <span className="v-green" style={{ fontSize: 12.5 }}>网络：已连接</span>
        <Icon name="wifi" /><Icon name="battery" />
      </header>

      <div style={{ flex: 1, display: 'flex', gap: 26, padding: 30, alignItems: 'stretch' }}>
        {/* 左：标题 + 一键自检 */}
        <section className="panel" style={{ width: 300, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <h2 style={{ fontSize: 19, margin: 0, letterSpacing: 2 }}>系统状态自检</h2>
            <p style={{ color: 'var(--text-1)', fontSize: 12.5, margin: 0, textAlign: 'center' }}>
              请确认系统状态，确保各模块正常运行
            </p>
            <div style={{ margin: '8px 0 4px' }} className={running ? 'pulse' : ''}>
              <LogoMark />
            </div>
            <Btn variant="primary" onClick={() => void run()} disabled={running} className="pulse-none">
              {running ? '自检中…' : '一键自检'}
            </Btn>
          </div>
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--panel-border)', color: 'var(--text-2)', fontSize: 11.5 }}>
            <Icon name="dot" /> 自检过程预计耗时 15~30 秒
          </div>
        </section>

        {/* 中：自检结果 */}
        <section className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <header className="panel-title"><Icon name="check" /><span>自检结果</span></header>
          <div className="panel-body" style={{ flex: 1, overflow: 'auto' }}>
            {items.length === 0 && (
              <div style={{ color: 'var(--text-2)', padding: '24px 0', textAlign: 'center' }}>
                点击【一键自检】开始分项检测
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((it) => (
                <div key={it.key} className="panel fade-in" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Icon name="shield" size={20} className={it.status === 'normal' ? 'v-cyan' : 'v-amber'} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{it.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{it.sub}</div>
                  </div>
                  <span className={it.status === 'normal' ? 'v-green' : 'v-amber'} style={{ fontSize: 13, fontWeight: 700 }}>
                    {it.status === 'normal' ? '正常' : '异常'}
                  </span>
                  <span className={it.status === 'normal' ? 'v-green' : 'v-amber'}>
                    <Icon name={it.status === 'normal' ? 'check' : 'close'} size={16} />
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: 14, borderTop: '1px solid var(--panel-border)', display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Btn onClick={() => void run()} disabled={running}>重新检测</Btn>
            <Btn variant="primary" onClick={() => void enter()} disabled={!done}>进入任务 »</Btn>
          </div>
        </section>

        {/* 右：系统状态概览 */}
        <section className="panel" style={{ width: 240 }}>
          <header className="panel-title"><Icon name="setting" /><span>系统状态概览</span></header>
          <div className="panel-body">
            {overview.map((o) => (
              <KV key={o.key} k={o.name} v={o.text} vClass="v-green" />
            ))}
            {!allNormal && done && (
              <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--amber)' }}>
                <Icon name="alert" /> 存在异常项，可重检后进入
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
