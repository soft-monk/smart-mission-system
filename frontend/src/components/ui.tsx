// 通用 UI 原子组件（契约 §8 设计 tokens 的组件化）
import React from 'react'

export const Icon: React.FC<{ name: string; size?: number; className?: string }> = ({ name, size = 16, className }) => (
  <span className={`ico ${className ?? ''}`} style={{ width: size, height: size, display: 'inline-flex' }} aria-hidden>
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name] ?? PATHS.dot}
    </svg>
  </span>
)

const PATHS: Record<string, React.ReactNode> = {
  dot: <circle cx="12" cy="12" r="4" />,
  situation: <><circle cx="12" cy="12" r="8" /><path d="M12 4v3M12 17v3M4 12h3M17 12h3" /></>,
  mission: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  target: <><circle cx="12" cy="12" r="8" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>,
  area: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /></>,
  resource: <><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="12" cy="17" r="2.2" /><path d="M8 8.4l3 6.4M16 8.4l-3 6.4" /></>,
  alert: <><path d="M12 4a6 6 0 016 6v4l2 3H4l2-3v-4a6 6 0 016-6z" /><path d="M10 20h4" /></>,
  setting: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  mic: <><rect x="9" y="3" width="6" height="10" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
  play: <path d="M8 5l11 7-11 7z" />,
  refresh: <><path d="M20 12a8 8 0 10-3 6.2" /><path d="M20 5v5h-5" /></>,
  check: <path d="M4 12l5 5L20 6" />,
  close: <path d="M5 5l14 14M19 5L5 19" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  plane: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
  radar: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><path d="M12 12l6-5" /></>,
  antenna: <><path d="M12 4v10M6 20l6-6 6 6" /><circle cx="12" cy="3" r="1.4" /></>,
  building: <><path d="M4 21V6l8-3 8 3v15" /><path d="M9 21v-5h6v5M9 10h.01M15 10h.01M9 13h.01M15 13h.01" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  file: <><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></>,
  download: <><path d="M12 4v11" /><path d="M7 12l5 5 5-5" /><path d="M5 20h14" /></>,
  eye: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.6" /></>,
  crosshair: <><circle cx="12" cy="12" r="7" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></>,
  wave: <path d="M3 12h2l2-5 3 10 3-14 3 12 2-3h3" />,
  wifi: <><path d="M4 9a13 13 0 0116 0" /><path d="M7 12.5a9 9 0 0110 0" /><circle cx="12" cy="18" r="1.4" /></>,
  battery: <><rect x="2" y="8" width="17" height="9" rx="2" /><path d="M21 11v3" /></>,
  video: <><rect x="3" y="6" width="12" height="12" rx="2" /><path d="M15 10l6-3v10l-6-3z" /></>,
  cloud: <path d="M7 18a4 4 0 010-8 5 5 0 019.6-1.4A4 4 0 0117 18z" />,
  server: <><rect x="4" y="4" width="16" height="6" rx="1.6" /><rect x="4" y="14" width="16" height="6" rx="1.6" /><path d="M8 7h.01M8 17h.01" /></>,
}

export const Panel: React.FC<{
  title?: string
  icon?: string
  extra?: React.ReactNode
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  bodyStyle?: React.CSSProperties
  hud?: boolean
}> = ({ title, icon, extra, children, className, style, bodyStyle, hud }) => (
  <section className={`panel ${hud ? 'hud' : ''} ${className ?? ''}`} style={style}>
    {title && (
      <header className="panel-title">
        {icon && <Icon name={icon} />}
        <span>{title}</span>
        <span className="spacer" />
        {extra}
      </header>
    )}
    <div className="panel-body" style={bodyStyle}>{children}</div>
  </section>
)

/** 指标小格：原型图里成片的密集参数格 */
export const Stat: React.FC<{
  k: string
  v: React.ReactNode
  u?: string
  tone?: string
  toneClass?: string
  style?: React.CSSProperties
}> = ({ k, v, u, tone, toneClass, style }) => (
  <div className="stat" style={style}>
    <div className="k">{k}</div>
    <div className={`v ${toneClass ?? ''}`} style={tone ? { color: tone } : undefined}>
      {v}
      {u && <span className="u">{u}</span>}
    </div>
  </div>
)

/** 实时数值：值变化时短暂高亮，传达「数据在跳」 */
export const LiveNum: React.FC<{
  value: number | string
  digits?: number
  suffix?: string
  toneClass?: string
  style?: React.CSSProperties
}> = ({ value, digits = 0, suffix = '', toneClass, style }) => {
  const num = typeof value === 'number' ? value : Number(value)
  const shown = Number.isFinite(num) ? num.toFixed(digits) : String(value)
  const prev = React.useRef(shown)
  const [flash, setFlash] = React.useState(false)
  React.useEffect(() => {
    if (prev.current !== shown) {
      prev.current = shown
      setFlash(true)
      const t = window.setTimeout(() => setFlash(false), 700)
      return () => window.clearTimeout(t)
    }
  }, [shown])
  return (
    <span className={`${flash ? 'num-flash' : ''} ${toneClass ?? ''}`} style={style}>
      {shown}{suffix}
    </span>
  )
}

/** 密集数据行（带序号徽标，可选选中态） */
export const DataRow: React.FC<{
  index?: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
  active?: boolean
  style?: React.CSSProperties
}> = ({ index, children, onClick, active, style }) => (
  <div
    onClick={onClick}
    style={{
      cursor: onClick ? 'pointer' : undefined,
      margin: '0 -6px', padding: '5px 6px', borderRadius: 4,
      background: active ? 'rgba(34,211,238,.10)' : undefined,
      borderLeft: active ? '2px solid var(--cyan)' : '2px solid transparent',
      ...style,
    }}
  >
    {index !== undefined && <span className="idx">{index}</span>}
    {children}
  </div>
)

export const KV: React.FC<{ k: string; v: React.ReactNode; vClass?: string }> = ({ k, v, vClass }) => (
  <div className="kv">
    <span className="k">{k}</span>
    <span className={`v ${vClass ?? ''}`}>{v}</span>
  </div>
)

export const Bar: React.FC<{ value: number; tone?: 'blue' | 'green' | 'amber' | 'red' }> = ({ value, tone = 'blue' }) => (
  <div className={`bar ${tone === 'blue' ? '' : tone}`}>
    <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
)

export const Dot: React.FC<{ tone: 'green' | 'amber' | 'red' | 'cyan' | 'gray'; label?: string }> = ({ tone, label }) => (
  <span><span className={`dot ${tone}`} />{label}</span>
)

export const Stars: React.FC<{ value: number; max?: number; tone?: string }> = ({ value, max = 5, tone = 'var(--cyan)' }) => (
  <span style={{ color: tone, letterSpacing: 1 }}>
    {'★'.repeat(Math.max(0, value))}
    <span style={{ color: 'var(--text-2)' }}>{'★'.repeat(Math.max(0, max - value))}</span>
  </span>
)

export const Tag: React.FC<{ tone?: 'cyan' | 'green' | 'amber' | 'red' | 'blue' | 'gray'; children: React.ReactNode }> = ({ tone = 'cyan', children }) => (
  <span className={`tag ${tone}`}>{children}</span>
)

export const Btn: React.FC<{
  children: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  icon?: string
  disabled?: boolean
  className?: string
  title?: string
}> = ({ children, onClick, variant = 'default', icon, disabled, className, title }) => (
  <button
    className={`btn ${variant === 'default' ? '' : variant} ${className ?? ''}`}
    onClick={onClick}
    disabled={disabled}
    title={title}
  >
    {icon && <Icon name={icon} />}
    {children}
  </button>
)

/** 环形进度 */
export const Ring: React.FC<{ value: number; size?: number; tone?: string; label?: string; sub?: string }> = ({
  value, size = 62, tone = 'var(--green)', label, sub,
}) => {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(80,160,255,.16)" strokeWidth="6" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="6"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', lineHeight: 1.1,
      }}>
        <b style={{ fontSize: size > 56 ? 15 : 13, color: tone }}>{label ?? `${Math.round(pct)}%`}</b>
        {sub && <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{sub}</span>}
      </div>
    </div>
  )
}

/** 折线图（轻量 SVG，避免额外图表依赖；契约 UI-05 的 ECharts 由后续替换点保留） */
export const LineChart: React.FC<{
  series: { name: string; color: string; points: number[] }[]
  height?: number
  xLabels?: string[]
  yMax?: number
}> = ({ series, height = 90, xLabels, yMax }) => {
  const w = 300
  const h = height
  const pad = 6
  const all = series.flatMap((s) => s.points)
  const max = yMax ?? Math.max(1, ...all) * 1.15
  const n = Math.max(1, ...series.map((s) => s.points.length))
  const px = (i: number) => pad + (i / Math.max(1, n - 1)) * (w - pad * 2)
  const py = (v: number) => h - pad - (v / max) * (h - pad * 2)

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height }} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={pad} x2={w - pad} y1={py(max * g)} y2={py(max * g)} stroke="rgba(80,160,255,.12)" strokeWidth="1" />
        ))}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
            points={s.points.map((v, i) => `${px(i)},${py(v)}`).join(' ')}
          />
        ))}
      </svg>
      <div className="row" style={{ gap: 12, marginTop: 2 }}>
        {series.map((s) => (
          <span key={s.name} style={{ fontSize: 11, color: 'var(--text-1)' }}>
            <i style={{ display: 'inline-block', width: 14, height: 2, background: s.color, marginRight: 4, verticalAlign: 'middle' }} />
            {s.name}
          </span>
        ))}
        {xLabels && <span className="spacer" />}
      </div>
    </div>
  )
}

/** 时间轴（打击窗口 / 攻击时序 / 协同时间轴 / 轨迹回溯 共用） */
export const Timeline: React.FC<{
  nodes: { label: string; sub?: string; state?: 'done' | 'active' | 'todo' }[]
  cursor?: number
  onCursor?: (i: number) => void
}> = ({ nodes, cursor, onCursor }) => (
  <div style={{ position: 'relative', padding: '6px 0 2px' }}>
    <div style={{
      position: 'absolute', left: 10, right: 10, top: 16, height: 2,
      background: 'rgba(80,160,255,.2)',
    }} />
    <div className="row" style={{ position: 'relative', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      {nodes.map((n, i) => {
        const state = n.state ?? (cursor !== undefined ? (i < cursor ? 'done' : i === cursor ? 'active' : 'todo') : 'todo')
        const color = state === 'done' ? 'var(--green)' : state === 'active' ? 'var(--cyan)' : 'var(--text-2)'
        return (
          <div
            key={n.label + i}
            onClick={() => onCursor?.(i)}
            style={{ textAlign: 'center', flex: 1, cursor: onCursor ? 'pointer' : 'default' }}
          >
            <div style={{
              width: 14, height: 14, borderRadius: '50%', margin: '2px auto 6px',
              border: `2px solid ${color}`, background: state === 'todo' ? 'var(--bg-1)' : color,
              boxShadow: state !== 'todo' ? `0 0 8px ${color}` : 'none',
            }} />
            <div style={{ fontSize: 11.5, color: 'var(--text-0)' }}>{n.label}</div>
            {n.sub && <div style={{ fontSize: 10.5, color: 'var(--text-2)' }}>{n.sub}</div>}
          </div>
        )
      })}
    </div>
  </div>
)

export const Empty: React.FC<{ text?: string }> = ({ text = '暂无数据' }) => (
  <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text-2)', fontSize: 12.5 }}>{text}</div>
)

/** 系统 LOGO：三角徽记（与原型图一致的几何形态） */
export const LogoMark: React.FC<{ small?: boolean }> = ({ small }) => {
  const s = small ? 26 : 108
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" style={{ display: 'block', margin: small ? 0 : '0 auto' }}>
      <defs>
        <linearGradient id="mapapp-logo-lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fe9ff" />
          <stop offset="100%" stopColor="#2b8fe6" />
        </linearGradient>
      </defs>
      <path d="M50 8 L92 84 H74 L50 40 L26 84 H8 Z" fill="none" stroke="url(#mapapp-logo-lg)" strokeWidth="5" strokeLinejoin="round" />
      <path d="M50 44 L70 84 H30 Z" fill="none" stroke="url(#mapapp-logo-lg)" strokeWidth="5" strokeLinejoin="round" />
    </svg>
  )
}
