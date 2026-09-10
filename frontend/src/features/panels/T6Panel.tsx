// T6Panel —— T6「协同执行与引导」地图浮层（契约 §7.3/§7.4、需求初稿 §6 T6 / §8 T6）
// 场景一：T6-1 执行态势（底部状态条 + 【调整观察角度】【保持跟踪】）/ T6-2 引导控制（【确认引导】【重新规划】）
// 场景二：T6-1 无按钮，改为攻击时序调整时间轴 + 任务进度环；T6-2 三路实时回传画面 + 【确认执行同步】【重新优化策略】
// 全部数值优先取 store.execution，缺失时用契约 §7.5 演示值兜底。
import React, { useState } from 'react'
import { useStore } from '@/stores/useStore'
import { Bar, Btn, Dot, Icon, Ring, Timeline } from '@/components/ui'
import { BottomBar, FloatCard, Sub, TopBanner } from '@/features/panels/common'

const DEMO_SLOTS = ['16:08', '16:12', '16:16', '16:20']
const DEMO_LABEL = '边缘节点自主调整中'

/** 协同链路取值：兼容后端英文键与中文键（后端 /execution/status 返回 fireLink/radar/electronic） */
function pick(rec: Record<string, string> | undefined, keys: string[], fallback: string): string {
  if (rec) for (const k of keys) { const v = rec[k]; if (v) return v }
  return fallback
}

/** 只读条目（含状态点） */
const Row: React.FC<{ label: string; value: React.ReactNode; tone?: 'green' | 'amber' | 'red' | 'cyan' | 'gray' }> = ({
  label, value, tone = 'green',
}) => (
  <div className="kv">
    <span className="k">{label}</span>
    <span className="v"><Dot tone={tone} /><span>{value}</span></span>
  </div>
)

/** 可点击选中的功能页签（T6-1 / T6-2 互斥视图） */
const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string; sub: string }> = ({
  active, onClick, icon, label, sub,
}) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer',
      borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', textAlign: 'left',
      border: `1px solid ${active ? 'var(--cyan)' : 'var(--panel-border)'}`,
      background: active ? 'linear-gradient(180deg,rgba(34,211,238,.22),rgba(34,211,238,.05))' : 'rgba(10,18,32,.72)',
      color: active ? '#d9fbff' : 'var(--text-1)',
    }}
  >
    <Icon name={icon} size={15} />
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
      <b style={{ fontSize: 12.5 }}>{label}</b>
      <span style={{ fontSize: 10.5, color: 'var(--text-2)' }}>{sub}</span>
    </span>
  </button>
)

/** 目标锁定框（T6-1 中央 / T6-2 光电回传画面内的红色十字锁定框） */
const LockBox: React.FC<{ tone?: string; label?: string; size?: number }> = ({ tone = 'var(--red)', label, size = 46 }) => (
  <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
    {(['top', 'right', 'bottom', 'left'] as const).map((s) => (
      <span
        key={s}
        style={{
          position: 'absolute', width: 13, height: 13,
          top: s === 'top' ? 0 : s === 'bottom' ? undefined : 0,
          bottom: s === 'bottom' ? 0 : undefined,
          left: s === 'left' ? 0 : s === 'right' ? undefined : 0,
          right: s === 'right' ? 0 : undefined,
          borderTop: s === 'top' || s === 'left' || s === 'right' ? `2px solid ${tone}` : undefined,
          borderBottom: s === 'bottom' || s === 'left' || s === 'right' ? `2px solid ${tone}` : undefined,
          borderLeft: s === 'top' || s === 'bottom' || s === 'left' ? `2px solid ${tone}` : undefined,
          borderRight: s === 'top' || s === 'bottom' || s === 'right' ? `2px solid ${tone}` : undefined,
        }}
      />
    ))}
    <span style={{
      position: 'absolute', left: '50%', top: '50%', width: 12, height: 1,
      background: tone, transform: 'translate(-50%,-50%)',
    }} />
    <span style={{
      position: 'absolute', left: '50%', top: '50%', width: 1, height: 12,
      background: tone, transform: 'translate(-50%,-50%)',
    }} />
    {label && (
      <span style={{
        position: 'absolute', left: '50%', bottom: -15, transform: 'translateX(-50%)',
        fontSize: 10, color: tone, whiteSpace: 'nowrap',
      }}>{label}</span>
    )}
  </div>
)

/** 实时回传画面占位（光电图像 / 雷达回波 / 电子频谱） */
const Feed: React.FC<{ title: string; sub: string; tone: string; children?: React.ReactNode }> = ({
  title, sub, tone, children,
}) => (
  <div style={{
    flex: '1 1 0', minWidth: 0, borderRadius: 'var(--radius-sm)', padding: '6px 8px',
    border: `1px solid ${tone}`, background: 'rgba(6,12,24,.8)',
  }}>
    <div className="row" style={{ gap: 5 }}>
      <Dot tone={tone === 'var(--green)' ? 'green' : tone === 'var(--cyan)' ? 'cyan' : 'amber'} />
      <b style={{ fontSize: 11.5, color: 'var(--text-0)' }}>{title}</b>
    </div>
    <div style={{ marginTop: 4, height: 54, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
    <div style={{ fontSize: 10, color: 'var(--text-2)', textAlign: 'center' }}>{sub}</div>
  </div>
)

/** 中央合成态势示意（绝对定位的小标牌，避免遮挡地图交互） */
const MapBadge: React.FC<{ icon: string; text: string; tone?: string; style?: React.CSSProperties }> = ({
  icon, text, tone = 'var(--cyan)', style,
}) => (
  <span className="panel" style={{
    position: 'absolute', padding: '4px 9px', fontSize: 11, color: tone,
    borderColor: tone, background: 'rgba(6,12,24,.8)', pointerEvents: 'none', ...style,
  }}>
    <Icon name={icon} size={12} /> {text}
  </span>
)

export const T6Panel: React.FC = () => {
  const scenarioKey = useStore((s) => s.scenarioKey)
  const execution = useStore((s) => s.execution)
  const guide = useStore((s) => s.guide)
  const replan = useStore((s) => s.replan)
  const pushTimeline = useStore((s) => s.pushTimeline)
  // 默认停在「动作页签」：两场景的推进按钮都在 T6-2
  // （场景一 T6-2 = 引导控制，含【确认引导】；场景二 T6-2 = 实时回传+引导，含【确认执行同步】）。
  // 这样进入阶段即可看到可执行动作，避免"看不到按钮以为流程断了"。
  const [mode, setMode] = useState<'T6-1' | 'T6-2'>('T6-2')

  // ---- 演示值兜底（契约 §7.5）----
  const stability = execution?.trackingStability ?? 87
  const hit = execution?.hitProbability ?? 84
  const deviation = execution?.deviationM ?? 12
  const progress = execution?.taskProgress ?? 75
  const correcting = execution?.positionCorrecting ?? true
  const slots = execution?.attackTiming?.slots?.length ? execution.attackTiming.slots : DEMO_SLOTS
  const timingLabel = execution?.attackTiming?.label ?? DEMO_LABEL
  const adjusting = execution?.attackTiming?.adjusting ?? true
  const fireLink = pick(execution?.coopLink, ['fireLink', '火力协同链路', 'fire'], '稳定')
  const radarLink = pick(execution?.coopLink, ['radar', '雷达数据', 'radarData'], '持续校正')
  const elecLink = pick(execution?.coopLink, ['electronic', '电子侦察', 'electronicRecon'], '正常')
  const targetPos = pick(execution?.sync, ['targetPosition', '目标位置', '目标位置实时更新'], '实时更新')
  const fireGuide = pick(execution?.sync, ['fireGuide', '火力引导信息', '火力引导信息已同步'], '已同步')
  const deviationFix = pick(execution?.sync, ['deviationFix', '偏差修正', '偏差修正已生成'], '已生成')

  const s1 = scenarioKey === 'scenario-1'
  const tone = (v: boolean): 'green' | 'amber' => (v ? 'green' : 'amber')

  const onAngle = () => pushTimeline({ kind: 'tip', text: '已调整光电集群观察角度，目标区域持续在视场内。' })
  const onKeep = () => pushTimeline({ kind: 'tip', text: '已保持跟踪，雷达与电子侦察数据持续校正目标位置。' })

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} className="fade-in">
      {/* 顶部 AI 提示与功能页签 */}
      <TopBanner icon="wave">
        {s1
          ? '目标区域出现移动迹象，建议调整光电集群观察角度；雷达与电子侦察数据正在持续校正目标位置。'
          : `${timingLabel}，${slots[0]} 起依次调整攻击时序，云边端策略保持一致。`}
      </TopBanner>

      <div className="row" style={{
        position: 'absolute', left: 12, top: 58, gap: 6, pointerEvents: 'auto', zIndex: 9,
      }}>
        <TabBtn active={mode === 'T6-1'} onClick={() => setMode('T6-1')} icon="situation"
          label="T6-1 执行态势" sub={s1 ? '实时态势 · 多源叠加' : '融合图层 · 攻击时序'} />
        <TabBtn active={mode === 'T6-2'} onClick={() => setMode('T6-2')} icon="crosshair"
          label="T6-2 引导控制" sub={s1 ? 'AI 轨迹修正 · 偏差标注' : '实时回传 · 目标追踪'} />
      </div>

      {s1
        ? (mode === 'T6-1'
          ? (
            <>
              <MapBadge icon="target" text="目标003 锁定框" tone="var(--red)" style={{ left: '46%', top: '30%' }} />
              <MapBadge icon="plane" text="集群轨迹动态运行" style={{ left: '26%', top: '46%' }} />
              <MapBadge icon="layers" text="多源数据叠加" style={{ left: '34%', top: '60%' }} />
              <MapBadge icon="antenna" text="火力协同链路" tone="var(--amber)" style={{ left: '30%', top: '72%' }} />
              <MapBadge icon="situation" text="前沿指挥节点" tone="var(--green)" style={{ left: '52%', top: '74%' }} />
            </>
          )
          : (
            <>
              <MapBadge icon="target" text="目标003 位置更新" tone="var(--red)" style={{ left: '45%', top: '29%' }} />
              <MapBadge icon="crosshair" text="偏差标注 12 m" tone="var(--amber)" style={{ left: '50%', top: '41%' }} />
              <MapBadge icon="refresh" text="AI 轨迹修正" style={{ left: '27%', top: '53%' }} />
              <MapBadge icon="wifi" text="信息同步链路" tone="var(--green)" style={{ left: '34%', top: '68%' }} />
            </>
          ))
        : (
          <>
            <MapBadge icon="target" text="中央目标标记" tone="var(--red)" style={{ left: '45%', top: '31%' }} />
            <MapBadge icon="wave" text="红色虚线攻击走廊" tone="var(--red)" style={{ left: '30%', top: '47%' }} />
            <MapBadge icon="layers" text="攻击轨迹 / 侦察轨迹" style={{ left: '26%', top: '60%' }} />
            <MapBadge icon="cloud" text="边缘节点" tone="var(--cyan)" style={{ left: '52%', top: '72%' }} />
            <MapBadge icon="antenna" text="前沿指控节点" tone="var(--green)" style={{ left: '38%', top: '78%' }} />
          </>
        )}

      {/* 左列数据卡：与底部动作条留出 88px，避免遮挡 */}
      <FloatCard
        title={mode === 'T6-1' ? 'T6-1 执行态势' : 'T6-2 引导控制'}
        icon={mode === 'T6-1' ? 'situation' : 'crosshair'}
        style={{ position: 'absolute', left: 12, bottom: 88, width: s1 ? 286 : 400, maxHeight: 'calc(100% - 214px)' }}
      >
        {mode === 'T6-1' && (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b style={{ fontSize: 12.5 }}>目标跟踪稳定度</b>
              <span className="v-cyan" style={{ fontWeight: 700 }}>{stability}%</span>
            </div>
            <Bar value={stability} tone="green" />
            <Row label="位置校正状态" value={correcting ? '校正中' : '已稳定'} tone={tone(correcting)} />
            <Row label="锁定目标" value={s1 ? '目标003 · 高价值' : '目标002 · 机动指挥节点'} tone="red" />

            <Sub title="协同链路">
              <Row label="火力协同链路" value={fireLink} />
              <Row label="雷达数据" value={radarLink} />
              <Row label="电子侦察" value={elecLink} />
            </Sub>

            <Sub title="命中概率">
              <div className="row" style={{ gap: 12 }}>
                <Ring value={hit} size={64} tone="var(--cyan)" sub={execution?.hitProbabilityTrend === 'up' ? '上升' : '稳定'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Row label="趋势" value={execution?.hitProbabilityTrend === 'up' ? '持续上升' : '保持稳定'} tone="cyan" />
                  <Row label="偏差修正" value={deviationFix} />
                  <Row label="偏差量" value={`${deviation} m`} tone="amber" />
                </div>
              </div>
            </Sub>

            <Sub title="同步状态">
              <Row label="目标位置" value={targetPos} />
              <Row label="火力引导信息" value={fireGuide} />
              <Row label="偏差修正" value={deviationFix} />
            </Sub>

            {s1 ? (
              <Sub title="T6-1 底部状态">
                <div className="row wrap" style={{ gap: 12, fontSize: 11.5 }}>
                  <Dot tone="green" label="多源数据叠加" />
                  <Dot tone="green" label="实时锁定" />
                  <Dot tone="green" label="轨迹修正" />
                </div>
              </Sub>
            ) : (
              <Sub title="攻击时序调整">
                <div className="row" style={{ gap: 6, marginBottom: 2 }}>
                  <Icon name="clock" size={13} className="v-cyan" />
                  <span style={{ fontSize: 11.5, color: adjusting ? 'var(--amber)' : 'var(--green)' }}>{timingLabel}</span>
                </div>
                <Timeline nodes={slots.map((t, i) => ({ label: t, state: i === 0 ? 'active' : 'todo' }))} />
                <div className="row" style={{ gap: 12, marginTop: 6 }}>
                  <Ring value={progress} size={62} tone="var(--green)" label={`${Math.round(progress)}%`} sub="任务进度" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Row label="执行集群" value="6 个集群协同" tone="cyan" />
                    <Row label="链路状态" value="云端 / 边缘 / 集群 正常" />
                  </div>
                </div>
              </Sub>
            )}
          </>
        )}

        {mode === 'T6-2' && (
          s1 ? (
            <>
              <Sub title="AI 轨迹修正说明">
                目标区域出现移动迹象，光电集群已调整观察角度；雷达与电子侦察数据正在持续校正目标位置，AI
                已重新规划引导航路并生成偏差修正量。
              </Sub>
              <div className="row" style={{ gap: 12, marginTop: 8 }}>
                <LockBox tone="var(--amber)" label="偏差 12 m" size={52} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Row label="目标位置更新" value="目标003" tone="cyan" />
                  <Row label="偏差标注" value={`${deviation} m`} tone="amber" />
                  <Row label="信息同步链路" value={fireGuide} />
                </div>
              </div>
              <div className="row" style={{ gap: 12, marginTop: 10 }}>
                <Ring value={hit} size={64} tone="var(--cyan)" sub="命中概率" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Row label="目标位置实时更新" value={targetPos} />
                  <Row label="火力引导信息已同步" value={fireGuide} />
                  <Row label="偏差修正已生成" value={deviationFix} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
                <Feed title="光电图像" sub="锁定十字框 · 目标002" tone="var(--red)">
                  <LockBox tone="var(--red)" size={40} />
                </Feed>
                <Feed title="雷达回波" sub="持续跟踪 · 距离更新" tone="var(--cyan)">
                  <svg viewBox="0 0 74 44" width="100%" height="44" preserveAspectRatio="none">
                    <polyline
                      fill="none" stroke="var(--cyan)" strokeWidth="1.6" strokeLinejoin="round"
                      points="0,36 14,24 24,32 38,10 50,22 62,6 74,16"
                    />
                  </svg>
                </Feed>
                <Feed title="电子频谱" sub="干扰压制待命" tone="var(--amber)">
                  <div className="row" style={{ gap: 3, alignItems: 'flex-end', height: 44 }}>
                    {[10, 18, 30, 42, 26, 16, 34, 20].map((h, i) => (
                      <i key={i} style={{
                        display: 'block', width: 5, height: h, borderRadius: 2,
                        background: h > 32 ? 'var(--amber)' : 'rgba(245,158,11,.5)',
                      }} />
                    ))}
                  </div>
                </Feed>
              </div>

              <Sub title="目标追踪">
                <div className="row" style={{ gap: 12 }}>
                  <Ring value={hit} size={62} tone="var(--cyan)" sub="命中概率" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Row label="目标" value="目标002 · 机动指挥节点" tone="red" />
                    <Row label="距离" value="12.4 km" tone="cyan" />
                    <Row label="状态" value="锁定跟踪" />
                  </div>
                </div>
              </Sub>

              <Sub title="集群协同状态">
                <Row label="侦察集群" value="协同进入执行链路" />
                <Row label="电子对抗集群" value={elecLink} />
                <Row label="执行集群" value="6 个集群并行执行" tone="cyan" />
              </Sub>

              <Sub title="任务执行状态">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12 }}>任务进度</span>
                  <span className="v-cyan" style={{ fontWeight: 700 }}>{Math.round(progress)}%</span>
                </div>
                <Bar value={progress} tone="green" />
              </Sub>
            </>
          )
        )}
      </FloatCard>

      {/* 底部动作条（契约 §7.3 / §7.4 逐字） */}
      {s1
        ? (mode === 'T6-1'
          ? (
            <BottomBar>
              <div className="row wrap" style={{ gap: 14, fontSize: 12 }}>
                <Dot tone="green" label="多源数据叠加" />
                <Dot tone="green" label="实时锁定" />
                <Dot tone="green" label="轨迹修正" />
              </div>
              <span className="spacer" />
              <Btn icon="eye" onClick={onAngle}>调整观察角度</Btn>
              <Btn variant="primary" icon="crosshair" onClick={onKeep}>保持跟踪</Btn>
            </BottomBar>
          )
          : (
            <BottomBar>
              <div className="row wrap" style={{ gap: 14, fontSize: 12 }}>
                <Dot tone="green" label="轨迹已修正" />
                <Dot tone="green" label="目标锁定" />
                <Dot tone="green" label="信息同步" />
              </div>
              <span className="spacer" />
              <Btn variant="primary" icon="check" onClick={() => void guide()}>确认引导</Btn>
              <Btn icon="refresh" onClick={() => void replan()}>重新规划</Btn>
            </BottomBar>
          ))
        : (mode === 'T6-1'
          ? (
            // 场景二 T6-1 界面无按钮（契约 §7.4）：仅展示攻击时序调整与任务进度
            null
          )
          : (
            <BottomBar>
              <div className="row wrap" style={{ gap: 14, fontSize: 12 }}>
                <Dot tone="green" label="云边策略一致" />
                <Dot tone="green" label="目标锁定" />
                <Dot tone="amber" label={timingLabel} />
              </div>
              <span className="spacer" />
              <Btn variant="primary" icon="check" onClick={() => void guide()}>确认执行同步</Btn>
              <Btn icon="refresh" onClick={() => void replan()}>重新优化策略</Btn>
            </BottomBar>
          ))}

      {/* 场景二 T6-1：底部仅时间轴与进度环（无按钮） */}
      {!s1 && mode === 'T6-1' && (
        <div className="panel" style={{
          position: 'absolute', left: 12, bottom: 12, right: 320, padding: '10px 14px',
          pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 16, zIndex: 9,
        }}>
          <div className="row" style={{ gap: 6, flex: '1 1 auto', minWidth: 0 }}>
            <Icon name="clock" className="v-cyan" />
            <b style={{ fontSize: 12.5 }}>攻击时序调整</b>
            <span style={{ fontSize: 11.5, color: 'var(--amber)' }}>{timingLabel}</span>
          </div>
          <div style={{ flex: '1 1 320px', minWidth: 240 }}>
            <Timeline nodes={slots.map((t, i) => ({ label: t, state: i === 0 ? 'active' : 'todo' }))} />
          </div>
          <Ring value={progress} size={58} tone="var(--green)" label={`${Math.round(progress)}%`} sub="任务进度" />
        </div>
      )}
    </div>
  )
}
