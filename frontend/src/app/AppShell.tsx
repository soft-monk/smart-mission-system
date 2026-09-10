// AppShell —— 全局框架（契约 §7.2）
// 顶栏（Logo/系统名/网络/WiFi/电量/时间/头像）+ 左侧 7 项导航 + 中央地图 + 右侧面板 + 底栏状态槽
// 语音入口两形态：ball（场景一，右下角悬浮球）/ inline（场景二，页面内语音卡）
import React, { useEffect } from 'react'
import { useStore, PHASE_ORDER, type LeftNavKey } from '@/stores/useStore'
import { ws } from '@/ws/client'
import { Btn, Icon, LogoMark } from '@/components/ui'
import { MapView } from '@/map/MapView'
import { VoiceBall, VoiceInlinePanel } from '@/components/Voice'
import { PhasePanel } from '@/features/PhasePanel'
import { RightRail } from '@/features/RightRail'
import { AlertToasts } from '@/features/AlertToasts'
import { VideoPanel } from '@/features/VideoPanel'

const NAV: { key: LeftNavKey; label: string; icon: string }[] = [
  { key: 'situation', label: '态势', icon: 'situation' },
  { key: 'mission', label: '任务', icon: 'mission' },
  { key: 'target', label: '目标', icon: 'target' },
  { key: 'area', label: '区域', icon: 'area' },
  { key: 'resource', label: '资源', icon: 'resource' },
  { key: 'alert', label: '告警', icon: 'alert' },
  { key: 'setting', label: '设置', icon: 'setting' },
]

export const AppShell: React.FC = () => {
  const phase = useStore((s) => s.phase)
  const scenarioKey = useStore((s) => s.scenarioKey)
  const scenarios = useStore((s) => s.scenarios)
  const mission = useStore((s) => s.mission)
  const phaseTitle = useStore((s) => s.phaseTitle)
  const progress = useStore((s) => s.progress)
  const leftNav = useStore((s) => s.leftNav)
  const setLeftNav = useStore((s) => s.setLeftNav)
  const wsStatus = useStore((s) => s.wsStatus)
  const setWsStatus = useStore((s) => s.setWsStatus)
  const uavPositions = useStore((s) => s.uavPositions)
  const linkMetrics = useStore((s) => s.linkMetrics)
  const alerts = useStore((s) => s.alerts)
  const voiceMode = useStore((s) =>
    s.scenarios.find((x) => x.key === s.scenarioKey)?.voice_mode ?? 'ball')

  useEffect(() => {
    const offStatus = ws.onStatus(setWsStatus)
    const off = ws.on((env) => useStore.getState().applyWs(env))
    ws.connect()
    return () => { off(); offStatus() }
  }, [setWsStatus])

  const onlineUav = Object.keys(uavPositions).length
  const linkState = linkMetrics ? '稳定' : '—'

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' }}>
      {/* 顶栏 */}
      <header style={{
        height: 'var(--topbar-h)', flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 18px', borderBottom: '1px solid var(--panel-border)', background: 'rgba(8,16,30,.9)',
        backdropFilter: 'blur(8px)', zIndex: 30,
      }}>
        <LogoMark small />
        <span style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: 1 }}>智能任务管理系统</span>

        {/* 阶段进度 */}
        <div className="row" style={{ marginLeft: 22, gap: 4 }}>
          {PHASE_ORDER.map((p) => {
            const active = p === phase
            const done = PHASE_ORDER.indexOf(p) < PHASE_ORDER.indexOf(phase)
            return (
              <span key={p} className={`tag ${active ? 'cyan' : done ? 'green' : 'gray'}`} style={{ fontSize: 11 }}>{p}</span>
            )
          })}
        </div>
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-1)' }}>{phaseTitle}</span>

        <span className="spacer" />

        <span className={wsStatus === 'open' ? 'v-green' : 'v-amber'} style={{ fontSize: 12.5 }}>
          网络：{wsStatus === 'open' ? '已连接' : '连接中'}
        </span>
        <Icon name="wifi" />
        <Icon name="battery" />
        <Clock />
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(80,160,255,.22)', border: '1px solid var(--panel-border-strong)' }} />
      </header>

      {/* 主体 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左侧导航 */}
        <nav style={{
          width: 'var(--nav-w)', flex: '0 0 auto', borderRight: '1px solid var(--panel-border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 0',
          background: 'rgba(8,16,30,.75)', zIndex: 20,
        }}>
          {NAV.map((n) => {
            const active = leftNav === n.key
            const badge = n.key === 'alert' ? alerts.length : 0
            return (
              <button
                key={n.key}
                onClick={() => setLeftNav(n.key)}
                title={n.label}
                style={{
                  width: 62, padding: '9px 0', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: active ? 'linear-gradient(180deg,rgba(34,211,238,.24),rgba(34,211,238,.06))' : 'transparent',
                  border: `1px solid ${active ? 'var(--cyan)' : 'transparent'}`,
                  color: active ? '#d9fbff' : 'var(--text-1)', fontFamily: 'inherit', fontSize: 11.5,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, position: 'relative',
                }}
              >
                <Icon name={n.icon} size={19} />
                {n.label}
                {badge > 0 && (
                  <span style={{
                    position: 'absolute', top: 4, right: 8, background: 'var(--red)', color: '#fff',
                    borderRadius: 8, fontSize: 10, padding: '0 5px', lineHeight: '14px',
                  }}>{badge}</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* 中央地图 + 阶段面板浮层 */}
        <main style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <MapView>
            <MapToolbar />
            <MapModeBadge />
            <PhasePanel />
            {voiceMode === 'inline' && <VoiceInlinePanel />}
          </MapView>
        </main>

        {/* 右侧 AI/状态栏 */}
        <RightRail />
      </div>

      {/* 底栏状态条 */}
      <footer style={{
        height: 'var(--statusbar-h)', flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 18,
        padding: '0 18px', borderTop: '1px solid var(--panel-border)', background: 'rgba(8,16,30,.9)',
        fontSize: 12, color: 'var(--text-1)', zIndex: 30,
      }}>
        <StatusSlot label="系统状态" value="运行正常" tone="green" />
        <StatusSlot label="无人机状态" value={onlineUav > 0 ? `${onlineUav} 架在线` : '全部正常'} tone="green" />
        <StatusSlot label="数据链路" value={linkState} tone="green" />
        <StatusSlot label="定位状态" value="正常" tone="green" />
        <StatusSlot label="AI决策引擎" value="在线" tone="green" />
        <StatusSlot label="安全状态" value="安全" tone="green" />
        <span className="spacer" />
        {scenarios.length > 0 && (
          <span style={{ color: 'var(--text-2)' }}>
            场景：{scenarios.find((s) => s.key === scenarioKey)?.name ?? scenarioKey}
            {mission ? ` · ${mission.task_no}` : ''}
          </span>
        )}
        <span style={{ color: 'var(--text-2)' }}>进度 {progress}%</span>
      </footer>

      {/* 语音悬浮球（场景一） */}
      {voiceMode === 'ball' && <VoiceBall />}

      {/* 告警浮层 */}
      <AlertToasts />

      {/* 视频面板（T3 起可用，浮层收起态） */}
      <VideoPanel />
    </div>
  )
}

const StatusSlot: React.FC<{ label: string; value: string; tone: 'green' | 'amber' | 'red' }> = ({ label, value, tone }) => (
  <span className="row" style={{ gap: 6 }}>
    <span className={`dot ${tone}`} />
    <span style={{ color: 'var(--text-2)' }}>{label}：</span>
    <span style={{ color: tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>
      {value}
    </span>
  </span>
)

const Clock: React.FC = () => {
  const [t, setT] = React.useState(new Date())
  useEffect(() => {
    const id = window.setInterval(() => setT(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span style={{ fontSize: 12.5, color: 'var(--text-1)' }}>{t.toLocaleTimeString('zh-CN', { hour12: false })}</span>
}

/** 地图左上工具组（契约 §9.1：选择/测距/图层/区域/新建/全屏/标绘；**不含 3D 切换**） */
const MapToolbar: React.FC = () => {
  const [active, setActive] = React.useState('select')
  const tools = [
    { key: 'select', label: '选择', icon: 'dot' },
    { key: 'measure', label: '测距', icon: 'crosshair' },
    { key: 'layer', label: '图层', icon: 'layers' },
    { key: 'area', label: '区域', icon: 'area' },
    { key: 'new', label: '新建', icon: 'target' },
    { key: 'full', label: '全屏', icon: 'eye' },
  ]
  return (
    <div className="row" style={{
      position: 'absolute', top: 12, left: 12, gap: 6, zIndex: 8,
    }}>
      {tools.map((t) => (
        <button
          key={t.key}
          onClick={() => {
            setActive(t.key)
            if (t.key === 'full') {
              if (document.fullscreenElement) void document.exitFullscreen()
              else void document.documentElement.requestFullscreen().catch(() => undefined)
            }
          }}
          className="panel"
          style={{
            padding: '6px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            cursor: 'pointer', fontSize: 10.5, fontFamily: 'inherit',
            color: active === t.key ? 'var(--cyan)' : 'var(--text-1)',
            borderColor: active === t.key ? 'var(--cyan)' : 'var(--panel-border)',
          }}
        >
          <Icon name={t.icon} size={15} />
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** 显示模式徽标（右上角，随阶段变化） */
const MapModeBadge: React.FC = () => {
  const phase = useStore((s) => s.phase)
  const scenarioKey = useStore((s) => s.scenarioKey)
  const mode = DISPLAY_MODE[scenarioKey][phase]
  return (
    <div className="panel" style={{
      position: 'absolute', top: 12, right: 58, padding: '7px 14px', fontSize: 12.5, zIndex: 8,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ color: 'var(--text-2)' }}>显示模式：</span>
      <b className="v-cyan">{mode}</b>
    </div>
  )
}

export const DISPLAY_MODE: Record<string, Record<string, string>> = {
  'scenario-1': {
    T0: '综合态势', T1: '综合态势', T2: '链路拓扑', T3: '侦察展开',
    T4: '目标识别', T5: '任务规划', T6: '实时态势', T7: '复核态势',
  },
  'scenario-2': {
    T0: '综合态势', T1: '综合态势', T2: '云边端拓扑', T3: '边缘融合态势',
    T4: '目标识别', T5: '任务规划', T6: '引导控制', T7: '结果汇总',
  },
}
