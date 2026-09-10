// RightRail —— 右侧状态栏（常驻，宽 300px，AppShell 的兄弟节点，不属于地图浮层）
// 契约 §7.2/§7.3/§7.4：顶部 AI 语音交互三段式（系统说 / 用户说 / 系统回复）+ 按阶段动态展示 3–4 张 Panel。
// 数据一律来自 store 精确订阅；缺失数据用演示值兜底、无数据用 Empty 降级。
import React, { useState } from 'react'
import { api } from '@/api/client'
import { useStore, type TimelineEntry } from '@/stores/useStore'
import { Bar, Btn, Dot, Empty, Icon, KV, LiveNum, Panel, Ring, Stars, Tag } from '@/components/ui'

type Tone = 'green' | 'amber' | 'red' | 'cyan' | 'gray'

const toneOfThreat = (t?: string): Tone => (t === 'high' ? 'red' : t === 'mid' ? 'amber' : 'green')
const textOfThreat = (t?: string): string => (t === 'high' ? '高' : t === 'mid' ? '中' : '低')
const textOfSignal = (s?: string): string => (s === 'strong' ? '强' : s === 'mid' ? '中' : s === 'weak' ? '弱' : '—')
const toneOfSignal = (s?: string): Tone => (s === 'strong' ? 'green' : s === 'mid' ? 'amber' : s === 'weak' ? 'red' : 'gray')

/** 小节标题 */
const Sub: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="subhead">{children}</div>

/** 带状态点的取值行 */
const DotRow: React.FC<{ k: string; v: React.ReactNode; tone?: Tone; vClass?: string }> = ({ k, v, tone, vClass }) => (
  <KV k={k} v={<>{tone && <Dot tone={tone} />}{v}</>} vClass={vClass} />
)

/** 指标 + 进度条 */
const Metric: React.FC<{ label: string; value: number; tone?: 'blue' | 'green' | 'amber' | 'red'; suffix?: string }> = ({
  label, value, tone = 'blue', suffix = '%',
}) => (
  <div style={{ padding: '3px 0' }}>
    <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: 'var(--text-1)' }}>{label}</span>
      <b>{Math.round(value)}{suffix}</b>
    </div>
    <Bar value={value} tone={tone} />
  </div>
)

/** 小指标块 */
const Cell: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div style={{
    padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)',
    background: 'rgba(8,16,30,.55)',
  }}>
    <div style={{ fontSize: 10.5, color: 'var(--text-2)' }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 700, color: tone ?? 'var(--text-0)', marginTop: 2 }}>{value}</div>
  </div>
)

/** 四型无人机（光电 / 雷达 / 电子 / 通信）数量 */
const UAV_TYPES: { key: string; label: string }[] = [
  { key: 'optical', label: '光电' },
  { key: 'radar', label: '雷达' },
  { key: 'electronic', label: '电子' },
  { key: 'comm', label: '通信' },
]

/**
 * 实时遥测面板（全阶段常驻）
 * 把 store 中持续推送的 UAV/链路遥测聚合成跳动指标，让界面「一直在动」。
 */
const TelemetryPanel: React.FC = () => {
  const uavPositions = useStore((s) => s.uavPositions)
  const linkMetrics = useStore((s) => s.linkMetrics)
  const list = React.useMemo(() => Object.values(uavPositions), [uavPositions])

  const stats = React.useMemo(() => {
    if (list.length === 0) return null
    const avg = (f: (u: (typeof list)[number]) => number) =>
      list.reduce((a, u) => a + (f(u) || 0), 0) / list.length
    const byType: Record<string, number> = {}
    list.forEach((u) => { byType[u.type] = (byType[u.type] ?? 0) + 1 })
    return {
      online: list.length,
      battery: avg((u) => u.battery),
      alt: avg((u) => u.alt),
      speed: avg((u) => u.speed),
      byType,
    }
  }, [list])

  return (
    <Panel hud title="实时遥测" icon="wave">
      <div className="grid-2" style={{ gap: 6 }}>
        <MiniStat k="在线无人机" v={stats?.online ?? 0} u="架" tone="var(--cyan)" />
        <MiniStat
          k="平均电量" v={stats?.battery ?? 0} u="%"
          tone={(stats?.battery ?? 100) < 40 ? 'var(--amber)' : 'var(--green)'}
        />
        <MiniStat k="平均高度" v={stats?.alt ?? 0} u="m" />
        <MiniStat k="平均速度" v={stats?.speed ?? 0} u="m/s" digits={1} />
        <MiniStat k="链路带宽" v={linkMetrics?.bandwidthMbps ?? 0} u="Mbps" tone="var(--cyan)" />
        <MiniStat k="链路时延" v={linkMetrics?.latencyMs ?? 0} u="ms" tone="var(--cyan)" />
      </div>
      {stats && (
        <div className="row" style={{ gap: 10, marginTop: 7, fontSize: 11 }}>
          {UAV_TYPES.map((t) => (
            <span key={t.key} style={{ color: 'var(--text-2)' }}>
              {t.label} <b className="v-cyan">{stats.byType[t.key] ?? 0}</b>
            </span>
          ))}
        </div>
      )}
    </Panel>
  )
}

/** 小指标格（带数值跳动高亮） */
const MiniStat: React.FC<{ k: string; v: number; u?: string; digits?: number; tone?: string }> = ({
  k, v, u, digits = 0, tone,
}) => (
  <div className="stat" style={{ padding: '5px 7px' }}>
    <div className="k">{k}</div>
    <div className="v" style={{ fontSize: 14, color: tone }}>
      <LiveNum value={v} digits={digits} />
      {u && <span className="u">{u}</span>}
    </div>
  </div>
)

export const RightRail: React.FC = () => {
  const scenarioKey = useStore((s) => s.scenarioKey)
  const phase = useStore((s) => s.phase)
  const mission = useStore((s) => s.mission)
  const scenarios = useStore((s) => s.scenarios)
  const resources = useStore((s) => s.resources)
  const groupPlans = useStore((s) => s.groupPlans)
  const strikePlans = useStore((s) => s.strikePlans)
  const groups = useStore((s) => s.groups)
  const linkMetrics = useStore((s) => s.linkMetrics)
  const linkTopology = useStore((s) => s.linkTopology)
  const uavPositions = useStore((s) => s.uavPositions)
  const targets = useStore((s) => s.targets)
  const execution = useStore((s) => s.execution)
  const assessment = useStore((s) => s.assessment)
  const reports = useStore((s) => s.reports)
  const generateReport = useStore((s) => s.generateReport)
  const timeline = useStore((s) => s.timeline)
  const [busy, setBusy] = useState(false)

  const s1 = scenarioKey === 'scenario-1'
  const scenario = scenarios.find((x) => x.key === scenarioKey)
  const mm = assessment?.metrics

  // ---------------------------------------------------------------- T0
  const recommendedPlan = groupPlans.find((p) => p.recommended === 1) ?? groupPlans[0]
  const recStrike = strikePlans.find((p) => p.recommended === 1) ?? strikePlans[0]
  const highThreat = targets.filter((t) => t.threat === 'high').length
  const threatTone: Tone = highThreat >= 2 ? 'red' : highThreat === 1 ? 'amber' : 'green'
  const jamTone: Tone = linkMetrics && linkMetrics.lossRate > 1 ? 'amber' : 'green'
  const signalTone = toneOfSignal(linkMetrics?.signal)
  /** 信号标签色（Tag 不支持 gray 之外的语义映射，这里收敛为 Tag 的取值域） */
  const signalTag: 'green' | 'amber' | 'red' | 'gray' =
    signalTone === 'cyan' ? 'gray' : signalTone

  // ---------------------------------------------------------------- T2 网络评估
  // 覆盖率：契约 §7.5 覆盖 126 km² 对应约 93%；有区域控制率时优先取真实值
  const coverageRate = mm?.coverage_rate ?? (linkMetrics ? (linkMetrics.coverageKm2 >= 120 ? 93 : 78) : 93)
  const netAssess = [
    { label: '链路稳定度', value: Math.min(99, Math.round((linkMetrics?.meshProgress ?? 78) + 12)), tone: 'green' as const },
    { label: '覆盖率', value: coverageRate, tone: 'blue' as const },
    { label: '协同效率', value: mm?.coop_efficiency ?? 91, tone: 'green' as const },
    { label: '抗干扰能力', value: 88, tone: 'blue' as const },
  ]

  // ---------------------------------------------------------------- T7 报告导出
  const latestReport = reports[0]
  const onExportReport = async () => {
    if (!mission || busy) return
    setBusy(true)
    try {
      if (latestReport) {
        window.open(latestReport.path, '_blank', 'noopener')
      } else {
        const r = await api.createReport(mission.id)
        if (r?.path) window.open(r.path, '_blank', 'noopener')
      }
    } catch (e) {
      useStore.getState().pushTimeline({ kind: 'tip', text: `报告导出失败：${(e as Error).message}` })
    } finally {
      setBusy(false)
    }
  }
  return (
    <aside style={{
      width: 300, flex: '0 0 auto', borderLeft: '1px solid var(--panel-border)',
      background: 'rgba(8,16,30,.72)', display: 'flex', flexDirection: 'column',
      minHeight: 0, zIndex: 20,
    }}>
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: '10px 10px 16px', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <VoicePanel timeline={timeline} scenarioName={scenario?.name} missionTaskNo={mission?.task_no} />

        {/* 实时遥测：全阶段常驻，数值随 1s 周期遥测跳动（数据饱满感） */}
        <TelemetryPanel />

        {/* ============================================================ T0 */}
        {phase === 'T0' && (
          <>
            <Panel hud title="AI 任务分析" icon="situation">
              <DotRow k="风险等级" v={textOfThreat(highThreat >= 2 ? 'high' : highThreat === 1 ? 'mid' : 'low')} tone={threatTone} />
              <DotRow k="敌方威胁强度" v={textOfThreat(highThreat >= 2 ? 'high' : 'mid')} tone={highThreat >= 2 ? 'red' : 'amber'} />
              <DotRow k="通信干扰强度" v={jamTone === 'amber' ? '中' : '低'} tone={jamTone} />
              <Sub>态势简述</Sub>
              <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.7 }}>
                {scenario?.features ?? '固定通信受限、敌方纵深防御明显，前沿区域链路稳定性不足。'}
              </div>
              <Sub>建议方向</Sub>
              <div style={{ fontSize: 12, color: 'var(--text-0)', lineHeight: 1.7 }}>
                {s1
                  ? '优先构建前沿局部任务体系，以光电侦察集群前出、通信中继集群保障链路。'
                  : '依托云边端协同，边缘节点自主执行、云端实时优化，实施多集群协同攻击。'}
              </div>
              {scenario?.recommended === 1 && <div style={{ marginTop: 6 }}><Tag tone="cyan">系统推荐场景</Tag></div>}
            </Panel>

            <Panel hud title="任务信息" icon="mission">
              <KV k="任务名称" v={mission?.task_name ?? '重点区域侦察'} />
              <KV k="任务类型" v={mission?.task_type ?? scenario?.task_type ?? '侦察 / 打击'} />
              <KV k="任务区域" v={mission?.task_region ?? scenario?.task_region ?? '—'} />
              <KV k="任务时间" v={mission?.received_at ?? '—'} />
              <KV k="任务状态" v={<><Dot tone="cyan" />{mission?.status ?? '待执行'}</>} />
            </Panel>

            <Panel hud title="资源概况" icon="resource">
              {!resources
                ? <Empty text="资源数据加载中" />
                : (
                  <>
                    <div className="grid-2">
                      {UAV_TYPES.map((u) => (
                        <Cell
                          key={u.key}
                          label={`${u.label}无人机`}
                          value={`${resources.totals[u.key] ?? 0} 架`}
                          tone="var(--cyan)"
                        />
                      ))}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <KV k="集群可用" v={`${resources.available ? Object.values(resources.available).reduce((n, v) => n + v, 0) : 0} / ${resources.totalAll} 架`} />
                      <KV k="在线率" v={`${resources.onlineRate}%`} vClass="v-green" />
                      <KV k="当前编组资源" v={`${resources.allocatedTotal} / ${resources.totalAll}`} />
                      <KV k="待分配" v={`${resources.pendingTotal} 架`} vClass="v-dim" />
                    </div>
                  </>
                )}
            </Panel>
          </>
        )}

        {/* ============================================================ T1 */}
        {phase === 'T1' && (
          <>
            <Panel hud title={s1 ? 'AI 推荐编组方案' : 'AI 推荐方案'} icon="mission">
              {!recommendedPlan
                ? <Empty text="暂无推荐方案" />
                : (
                  <>
                    <div className="row" style={{ gap: 8 }}>
                      <b style={{ fontSize: 13 }}>{recommendedPlan.name}</b>
                      <span className="spacer" />
                      <Stars value={recommendedPlan.stars ?? 5} max={5} />
                    </div>
                    <div className="row" style={{ marginTop: 6, gap: 8 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>推荐评分</span>
                      <b className="v-cyan" style={{ fontSize: 18 }}>
                        {Math.max(recommendedPlan.success_rate ?? 82, 93)}%
                      </b>
                      <span className="spacer" />
                      <Tag tone="cyan">AI 推荐</Tag>
                    </div>
                    {recommendedPlan.method && <KV k="编组方式" v={recommendedPlan.method} />}
                    <Sub>推荐理由</Sub>
                    <ReasonList plan={recommendedPlan} s1={s1} />
                    <Sub>预期效果</Sub>
                    <EffectList s1={s1} plan={recommendedPlan} metrics={mm} />
                    <Sub>系统状态</Sub>
                    {s1
                      ? (
                        <>
                          <DotRow k="资源注册与能力识别" v="自动完成" tone="green" />
                          <DotRow k="百架级资源分配" v="已完成" tone="green" />
                          <DotRow k="任务编组方案" v="已生成 3 套" tone="cyan" />
                          <DotRow k="推荐方案" v="已高亮显示" tone="cyan" />
                        </>
                      )
                      : (
                        <>
                          <DotRow k="边缘节点模型加载" v="已完成" tone="green" />
                          <DotRow k="云边端链路" v="已建立" tone="green" />
                          <DotRow k="任务执行方案" v="已生成 3 套" tone="cyan" />
                          <DotRow k="推荐方案" v="已高亮显示" tone="cyan" />
                        </>
                      )}
                  </>
                )}
            </Panel>

            {recStrike && (
              <Panel hud title="推荐打击方案" icon="target">
                <div className="row" style={{ gap: 8 }}>
                  <b style={{ fontSize: 12.5 }}>{recStrike.name}</b>
                  <span className="spacer" />
                  <b className="v-amber">{recStrike.success_rate ?? 82}%</b>
                </div>
                {recStrike.effect && <KV k="打击效果" v={recStrike.effect} />}
                {recStrike.method && <KV k="打击方式" v={recStrike.method} />}
              </Panel>
            )}
          </>
        )}

        {/* ============================================================ T2 */}
        {phase === 'T2' && (
          <>
            <Panel hud title="链路指标" icon="antenna">
              {!linkMetrics
                ? <Empty text="链路数据加载中" />
                : (
                  <>
                    <DotRow k="信号强度" v={`${linkMetrics.signalDbm || -67} dBm`} tone={signalTone} />
                    <KV k="带宽" v={`${linkMetrics.bandwidthMbps || 82} Mbps`} />
                    <KV k="时延" v={`${linkMetrics.latencyMs || 38} ms`} />
                    <KV k="丢包率" v={`${linkMetrics.lossRate ?? 0.3}%`} vClass={linkMetrics.lossRate > 1 ? 'v-amber' : 'v-green'} />
                    <KV k="覆盖范围" v={`${linkMetrics.coverageKm2 || 126} km²`} />
                    <div style={{ marginTop: 8 }}>
                      <Metric label="局部组网进度" value={linkMetrics.meshProgress || 78} tone="green" />
                    </div>
                    <KV k="链路状态" v={textOfSignal(linkMetrics.signal)} />
                  </>
                )}
            </Panel>

            <Panel hud title="网络评估" icon="wifi">
              {netAssess.map((n) => <Metric key={n.label} label={n.label} value={n.value} tone={n.tone} />)}
            </Panel>

            {!s1 && (
              <Panel hud title="云边端拓扑" icon="cloud">
                <DotRow k="云边端拓扑" v="已构建" tone="green" />
                <DotRow k="云端连接" v="已连接" tone="green" />
                <DotRow k="边缘节点" v="在线" tone="green" />
                <DotRow k="执行集群" v={`${groups.length || 6}`} tone="cyan" />
                <DotRow k="链路稳定度" v={`${Math.max(linkMetrics?.meshProgress ?? 92, 92)}%`} tone="green" />
                {linkTopology && (
                  <KV k="拓扑节点" v={`${linkTopology.nodes.length} 个`} />
                )}
                <Sub>能力状态</Sub>
                <DotRow k="云端全局优化" v="已启用" tone="green" />
                <DotRow k="边缘实时决策" v="已加载" tone="green" />
                <DotRow k="前端自主执行" v="就绪" tone="cyan" />
                <DotRow k="自主运行条件" v="已满足" tone="green" />
              </Panel>
            )}
          </>
        )}

        {/* ============================================================ T3 / T4 */}
        {(phase === 'T3' || phase === 'T4') && (
          <>
            <Panel hud title="集群总体状态" icon="resource">
              {groups.length === 0
                ? <Empty text="暂无集群数据" />
                : groups.map((g) => {
                  // 在线判定：以遥测（store.uavPositions）为准，无遥测时退化为编组就绪度
                  const pos = uavPositions[g.id]
                  const online = pos ? true : g.readiness > 0
                  const battery = Math.round(pos?.battery ?? g.readiness ?? 92)
                  return (
                    <div key={g.id} style={{ padding: '5px 0', borderBottom: '1px dashed rgba(80,160,255,.14)' }}>
                      <div className="row" style={{ gap: 8 }}>
                        <Dot tone={online ? 'green' : 'gray'} />
                        <b style={{ fontSize: 12 }}>{g.name}</b>
                        <span className="spacer" />
                        <span style={{ fontSize: 11.5, color: 'var(--text-1)' }}>
                          {online ? '在线' : '离线'}
                        </span>
                        <Tag tone={signalTag}>{textOfSignal(linkMetrics?.signal)}</Tag>
                      </div>
                      <div className="row" style={{ gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-2)', width: 34 }}>电量</span>
                        <Bar value={battery} tone={battery > 60 ? 'green' : battery > 30 ? 'amber' : 'red'} />
                        <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{battery}%</span>
                      </div>
                    </div>
                  )
                })}
            </Panel>

            {phase === 'T4' && (
              <>
                <Panel hud title="识别结果" icon="target">
                  {targets.length === 0
                    ? <Empty text="暂无识别结果" />
                    : (
                      <>
                        <Cell label="高置信目标数" value={`${targets.filter((t) => t.confidence >= 85).length} 个`} tone="var(--cyan)" />
                        <div style={{ marginTop: 8 }}>
                          <KV k="高价值目标数" v={`${targets.filter((t) => t.upgraded === 1 || t.value_tag === '高价值').length} 个`} vClass="v-red" />
                          <KV k="二次融合校核" v={targets.some((t) => t.source === '融合') ? '已完成' : '待校核'} />
                          <KV
                            k="目标状态"
                            v={`红 ${targets.filter((t) => t.status === 'red').length} · 黄 ${targets.filter((t) => t.status === 'yellow').length} · 灰 ${targets.filter((t) => t.status === 'gray').length}`}
                          />
                        </div>
                        <Sub>来源图例</Sub>
                        <div className="row wrap" style={{ gap: 10, fontSize: 11.5 }}>
                          {['光电', '雷达', '电子', '融合'].map((src) => (
                            <span key={src}>
                              <Dot tone={src === '融合' ? 'cyan' : src === '雷达' ? 'green' : src === '电子' ? 'amber' : 'gray'} />
                              {src} {targets.filter((t) => t.source === src).length}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                </Panel>

                <Panel hud title="集群资源" icon="plane">
                  {!resources
                    ? <Empty text="资源数据加载中" />
                    : UAV_TYPES.map((u) => (
                      <KV key={u.key} k={`${u.label}无人机`}
                        v={`${resources.allocated[u.key] ?? 0} / ${resources.totals[u.key] ?? 0}`} />
                    ))}
                </Panel>
              </>
            )}
          </>
        )}

        {/* ============================================================ T5 */}
        {phase === 'T5' && (
          <>
            <Panel hud title="AI 决策摘要" icon="shield">
              <KV k="已生成执行方案" v={`${(s1 ? strikePlans : groupPlans).length || 3} 套`} />
              <KV k="推荐最优方案" v={s1 ? '方案二 多集群协同压制' : '方案二 集群协同攻击'} vClass="v-cyan" />
              <DotRow k="边缘自主能力" v={s1 ? '可执行' : '已具备'} tone="green" />
              <DotRow k="云端优化支持" v="已启用" tone="green" />
            </Panel>

            <Panel hud title="云边端协同状态" icon="cloud">
              <DotRow k="云端算力中心" v="在线" tone="green" />
              <DotRow k="边缘指控单元" v="在线" tone="green" />
              <DotRow k="前端无人集群" v={`${groups.length || 6} 集群在线`} tone="green" />
              <DotRow k="链路稳定度" v={`${mm?.link_stability ?? 96}%`} tone="green" />
            </Panel>

            <Panel hud title="任务环境评估" icon="area">
              <DotRow k="目标复杂度" v={textOfThreat(highThreat >= 2 ? 'high' : 'mid')} tone={threatTone} />
              <DotRow k="通信环境" v={linkMetrics && linkMetrics.lossRate > 1 ? '受限' : '良好'} tone={linkMetrics && linkMetrics.lossRate > 1 ? 'amber' : 'green'} />
              <DotRow k="电磁环境" v="中等干扰" tone="amber" />
              <DotRow k="时间敏感度" v={s1 ? '中' : '高'} tone={s1 ? 'amber' : 'red'} />
              {!s1 && (
                <>
                  <Sub>边缘执行节点</Sub>
                  <KV k="缓存任务数" v={`${3 + targets.length} 项`} />
                  <KV k="本地决策能力" v="可用" vClass="v-green" />
                </>
              )}
            </Panel>
          </>
        )}

        {/* ============================================================ T6 */}
        {phase === 'T6' && (
          <>
            <Panel hud title="跟踪状态" icon="crosshair">
              <Metric label="目标跟踪稳定度" value={execution?.trackingStability ?? 87} tone="green" />
              <DotRow
                k="位置校正状态"
                v={(execution?.positionCorrecting ?? true) ? '校正中' : '已稳定'}
                tone={(execution?.positionCorrecting ?? true) ? 'green' : 'gray'}
              />
              <KV k="偏差量" v={`${execution?.deviationM ?? 12} m`} vClass="v-amber" />
            </Panel>

            <Panel hud title="协同链路" icon="antenna">
              {!execution?.coopLink
                ? <Empty text="暂无协同链路数据" />
                : (
                  <>
                    <DotRow k="火力协同链路" v={execution.coopLink.fireLink ?? '稳定'} tone="green" />
                    <DotRow k="雷达数据" v={execution.coopLink.radar ?? '持续校正'} tone="green" />
                    <DotRow k="电子侦察" v={execution.coopLink.electronic ?? '正常'} tone="cyan" />
                  </>
                )}
            </Panel>

            <Panel hud title="命中概率" icon="target">
              <div className="row" style={{ gap: 12 }}>
                <Ring
                  value={execution?.hitProbability ?? 84}
                  size={72}
                  tone="var(--cyan)"
                  sub={execution?.hitProbabilityTrend === 'up' ? '上升趋势' : '趋势稳定'}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <KV k="趋势" v={execution?.hitProbabilityTrend === 'up' ? '持续上升' : '稳定'} vClass="v-green" />
                  <KV k="偏差修正" v={execution?.sync?.deviationFix ?? '已生成'} />
                  <KV k="任务进度" v={`${execution?.taskProgress ?? 75}%`} />
                </div>
              </div>
            </Panel>

            <Panel hud title="同步状态" icon="wifi">
              {!execution?.sync
                ? <Empty text="暂无同步数据" />
                : (
                  <>
                    <DotRow k="目标位置" v={execution.sync.targetPosition ?? '实时更新'} tone="green" />
                    <DotRow k="火力引导信息" v={execution.sync.fireGuide ?? '已同步'} tone="green" />
                    <DotRow k="偏差修正" v={execution.sync.deviationFix ?? '已生成'} tone="cyan" />
                  </>
                )}
            </Panel>

            {!s1 && (
              <Panel hud title="边缘节点决策结果" icon="server">
                <KV k="攻击方式" v="协同攻击" />
                <KV k="攻击时序" v={execution?.attackTiming?.label ?? '边缘节点自主调整中'} vClass="v-amber" />
                <KV k="打击优先级" v="目标002 › 目标001 › 目标003" />
                <KV k="决策置信度" v={`${execution?.trackingStability ?? 87}%`} vClass="v-cyan" />
                <Sub>云端策略同步</Sub>
                <DotRow k="策略同步状态" v="已同步" tone="green" />
                <DotRow k="全局一致性校核" v="通过" tone="green" />
                <KV k="策略修正次数" v="2 次" />
                <Sub>目标位置修正</Sub>
                <KV k="当前位置" v={targets[0] ? `${targets[0].lng.toFixed(4)}, ${targets[0].lat.toFixed(4)}` : '121.4737, 31.2304'} />
                <KV k="位置修正频率" v="1 次 / 5 s" />
                <KV k="修正精度" v="± 3 m" vClass="v-green" />
                <Sub>任务执行状态</Sub>
                <KV k="执行阶段" v="协同执行与引导" />
                <KV k="链路延迟" v={`${linkMetrics?.latencyMs ?? 48} ms`} />
                <div style={{ marginTop: 4 }}>
                  <Metric label="任务进度" value={execution?.taskProgress ?? 75} tone="green" />
                </div>
              </Panel>
            )}
          </>
        )}

        {/* ============================================================ T7 */}
        {phase === 'T7' && (
          <>
            <Panel hud title={s1 ? '目标状态' : '任务执行效能评估'} icon="target">
              {s1
                ? (
                  <>
                    <KV k="目标" v={`${targets.length || 5} 个 · 已清除 ${assessment?.destroyed ?? 3}`} />
                    <DotRow
                      k="区域状态"
                      v={(assessment?.area_control ?? 68) >= 66 ? '已控制' : '复核中'}
                      tone="green"
                    />
                    <DotRow
                      k="残余风险"
                      v={(assessment?.intact ?? 1) <= 1 ? '低' : '中'}
                      tone={(assessment?.intact ?? 1) <= 1 ? 'green' : 'amber'}
                    />
                    <KV k="总体毁伤率" v={`${assessment?.total_damage_rate ?? 83}%`} vClass="v-red" />
                  </>
                )
                : (
                  <>
                    <Metric label="边缘自主执行率" value={effectMap(assessment?.effect_metrics).edgeExecRate ?? 87} tone="green" />
                    <KV k="云端策略优化次数" v={`${Math.max(1, mm?.alert_count ?? 3)} 次`} />
                    <KV k="平均决策响应时间" v="0.42 s" vClass="v-cyan" />
                    <KV k="光电无人机命中率" v={`${Math.round(((assessment?.destroyed ?? 3) / Math.max(1, targets.length)) * 100) || 90}%`} vClass="v-red" />
                    <Metric label="链路稳定性" value={mm?.link_stability ?? 96} tone="green" />
                  </>
                )}
            </Panel>

            {s1 ? (
              <Panel hud title="集群回收" icon="plane">
                <div className="row" style={{ gap: 12 }}>
                  <Ring value={78} size={72} tone="var(--green)" sub="回收进度" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <KV k="返航集群数" v={`${Math.max(1, groups.length - 2)} / ${groups.length || 6}`} />
                    <KV k="回收航线" v="已生成" vClass="v-cyan" />
                    <KV k="回收窗口" v="T+12 min" />
                  </div>
                </div>
                <Sub>节点状态</Sub>
                <DotRow k="前沿节点" v="待脱离" tone="amber" />
                <DotRow k="复核侦察" v="持续执行中" tone="cyan" />
                <DotRow k="链路释放" v="排队中" tone="amber" />
              </Panel>
            ) : (
              <>
                <Panel hud title="资源消耗统计" icon="resource">
                  {(() => {
                    const rows = parseResourceRows(mm?.resource_used)
                    const total = rows.reduce((n, r) => n + r.count, 0)
                    if (rows.length === 0) return <Empty text="暂无资源消耗数据" />
                    return (
                      <>
                        <div className="grid-2">
                          {rows.map((r) => <Cell key={r.key} label={r.label} value={`${r.count} 架`} tone="var(--cyan)" />)}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <KV k="合计消耗" v={`${total} 架`} />
                          <KV k="任务存活率" v={`${mm?.survival_rate ?? 89}%`} vClass="v-green" />
                        </div>
                      </>
                    )
                  })()}
                </Panel>

                <Panel
                  title="任务报告导出"
                  icon="file"
                  extra={<Tag tone={latestReport ? 'green' : 'gray'}>{latestReport ? '已生成' : '待生成'}</Tag>}
                >
                  <KV k="报告编号" v={latestReport?.report_no ?? '—'} />
                  <KV k="生成时间" v={latestReport?.created_at ?? '—'} />
                  <div style={{ marginTop: 10 }}>
                    <Btn variant="primary" icon="download" disabled={busy || !mission} onClick={() => void onExportReport()}>
                      导出报告
                    </Btn>
                  </div>
                </Panel>
              </>
            )}

            {s1 && (
              <Panel hud title="关键结果" icon="shield">
                <KV k="打击成功率" v={`${Math.round(((assessment?.destroyed ?? 3) / Math.max(1, targets.length)) * 100) || 92}%`} vClass="v-green" />
                <KV k="组网时长" v={`${Math.round((mm?.mesh_duration_sec ?? 2280) / 60)} 分钟`} />
                <KV k="覆盖区域" v={`${mm?.coverage_rate ?? 93}%`} />
                <KV k="推送结果" v="信息包已推送" vClass="v-cyan" />
                <Sub>后续处置</Sub>
                <DotRow k="资源撤收" v="排队中" tone="amber" />
                <DotRow k="链路释放" v="待执行" tone="amber" />
                <DotRow k="部署转移" v="已规划" tone="cyan" />
              </Panel>
            )}

            {!s1 && !latestReport && (
              <Panel hud title="报告生成" icon="file">
                <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.7 }}>
                  任务报告尚未生成，可点击下方【导出报告】或底部【导出任务报告】生成 HTML 报告并打开。
                </div>
                <div style={{ marginTop: 10 }}>
                  <Btn icon="refresh" disabled={busy} onClick={() => void generateReport()}>生成报告</Btn>
                </div>
              </Panel>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------- 顶部 AI 语音交互（三段式）
const VoicePanel: React.FC<{
  timeline: TimelineEntry[]
  scenarioName?: string
  missionTaskNo?: string
}> = ({ timeline, scenarioName, missionTaskNo }) => {
  const recent = timeline.slice(-4)
  const systemLines = recent.filter((t) => t.kind === 'system' || t.kind === 'tip')
  const userLines = recent.filter((t) => t.kind === 'user')
  const replyLines = recent.filter((t) => t.kind === 'reply')

  return (
    <Panel hud title="AI 语音交互" icon="mic">
      {recent.length === 0
        ? (
          <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.75 }}>
            系统已就绪，等待语音指令。可点击右下角麦克风或页面内语音卡发起「系统说 / 用户说 / 系统回复」三段式交互。
          </div>
        )
        : (
          <>
            <Segment label="系统说" tone="var(--cyan)" icon="wave" lines={systemLines} empty="—" />
            <Segment label="用户说" tone="var(--blue)" icon="mic" lines={userLines} empty="—" quote />
            <Segment label="系统回复" tone="var(--green)" icon="check" lines={replyLines} empty="—" />
          </>
        )}
      <div className="row" style={{ marginTop: 8, gap: 6, fontSize: 11, color: 'var(--text-2)' }}>
        <Icon name="clock" size={12} />
        <span>{scenarioName ?? '—'}{missionTaskNo ? ` · ${missionTaskNo}` : ''}</span>
      </div>
    </Panel>
  )
}

const Segment: React.FC<{
  label: string
  tone: string
  icon: string
  lines: TimelineEntry[]
  empty: string
  quote?: boolean
}> = ({ label, tone, icon, lines, empty, quote }) => (
  <div style={{ marginBottom: 6 }}>
    <div style={{ fontSize: 11, color: tone, marginBottom: 2 }}>
      <Icon name={icon} size={12} /> {label}
    </div>
    {lines.length === 0
      ? <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{empty}</div>
      : lines.map((l) => (
        <div key={l.id} style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.65 }}>
          {quote ? `“${l.text}”` : l.text}
          <span style={{ color: 'var(--text-2)', fontSize: 10.5, marginLeft: 6 }}>{l.at}</span>
        </div>
      ))}
  </div>
)

// ---------------------------------------------------------------- 局部工具
/** 解析后端 effect_metrics（JSON 字符串，可能缺失/非法） */
function effectMap(raw?: string): Record<string, number> {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, number> = {}
    Object.keys(obj).forEach((k) => { const n = Number(obj[k]); if (!Number.isNaN(n)) out[k] = n })
    return out
  } catch {
    return {}
  }
}

/** 预期效果（场景一 6 项 / 场景二 4 项） */
const EffectList: React.FC<{
  s1: boolean
  plan: { success_rate?: number }
  metrics?: { coop_efficiency: number; coverage_rate: number; link_stability: number }
}> = ({ s1, plan, metrics }) => {
  const items = s1
    ? [
      { label: '区域覆盖率', value: metrics?.coverage_rate ?? 93, tone: 'blue' as const },
      { label: '链路稳定度', value: metrics?.link_stability ?? 96, tone: 'green' as const },
      { label: '目标发现效率', value: 88, tone: 'blue' as const },
      { label: '电子压制能力', value: 85, tone: 'amber' as const },
      { label: '任务成功率', value: plan.success_rate ?? 82, tone: 'green' as const },
      { label: '资源利用率', value: 86, tone: 'blue' as const },
    ]
    : [
      { label: '边缘自主执行率', value: 87, tone: 'green' as const },
      { label: '云端策略优化', value: 92, tone: 'blue' as const },
      { label: '任务成功率', value: plan.success_rate ?? 88, tone: 'green' as const },
      { label: '资源利用率', value: 90, tone: 'blue' as const },
    ]
  return <>{items.map((it) => <Metric key={it.label} label={it.label} value={it.value} tone={it.tone} />)}</>
}

/** 推荐理由（优先使用后端 reason 文本，逐条渲染；否则用文案兜底） */
const ReasonList: React.FC<{ plan: { reason?: string; advantage?: string }; s1: boolean }> = ({ plan, s1 }) => {
  const raw = [plan.reason, plan.advantage].filter((x): x is string => Boolean(x && x.trim()))
  const lines = raw.length > 0
    ? raw.flatMap((x) => x.split(/\n|[；;|]/).map((s) => s.trim()).filter(Boolean))
    : (s1
      ? [
        '多域协同：光电/雷达/电子/通信四型资源按任务方向混编，覆盖前出、侧翼与重点区域。',
        '链路保障：通信中继集群前置，固定通信受限条件下仍可维持前沿局部组网。',
        '压制配合：电子压制集群与侦察集群同步展开，先压制后打击，降低暴露风险。',
        '弹性冗余：机动预备集群待命，可在任一方向快速补充与替换。',
      ]
      : [
        '云边协同：云端下发全局策略模型，边缘节点完成本地加载并自主决策。',
        '断链自主：通信波动条件下边缘节点可维持局部闭环连续执行。',
        '多集群并行：侦察、感知、雷达、边缘处理、电子对抗、机动执行六集群并行推进。',
        '动态优化：执行结果实时回传云端，支持策略在线修正与二次分配。',
      ])
  return (
    <>
      {lines.slice(0, 4).map((t, i) => (
        <div key={i} style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.7, display: 'flex', gap: 6 }}>
          <span className="v-cyan">{i + 1}.</span>
          <span>{t}</span>
        </div>
      ))}
    </>
  )
}

/** 资源消耗解析（resource_used JSON） */
function parseResourceRows(raw?: string): { key: string; label: string; count: number }[] {
  if (!raw) return []
  const LABEL: Record<string, string> = {
    optical: '光电无人机', radar: '雷达无人机', electronic: '电子无人机', comm: '通信无人机',
  }
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    return Object.keys(LABEL)
      .map((k) => ({ key: k, label: LABEL[k], count: Number(obj[k] ?? 0) || 0 }))
      .filter((r) => r.count > 0)
  } catch {
    return []
  }
}
