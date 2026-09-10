// T7Panel —— T7「毁伤评估与任务结束」地图浮层（契约 §7.3/§7.4、需求初稿 §6 T7 / §8 T7）
// 场景一：T7-1 复核态势（目标状态变化 红→黄→灰、残余威胁、回收轨迹、复核航线、前沿节点待脱离）+【继续复核】【准备脱离】
// 场景二：T7-1 目标处置状态逐目标卡 + 总体毁伤率环 + 四类计数图例；T7-2 结果卡 + 报告生成进度 +【返回场景选择】【导出任务报告】【结束任务体系】
// 【导出任务报告】→ store.generateReport() 成功后 window.open(report.path)。
import React, { useState } from 'react'
import { useStore } from '@/stores/useStore'
import { Bar, Btn, Dot, Icon, Ring, Tag } from '@/components/ui'
import { BottomBar, FloatCard, Sub, TopBanner } from '@/features/panels/common'
import type { Assessment, MissionMetrics, ReportRow } from '@/api/types'

type ResultKey = 'destroyed' | 'severe' | 'damaged' | 'intact'

const RESULT_META: Record<ResultKey, { text: string; color: string; tag: 'red' | 'amber' | 'gray' | 'cyan' }> = {
  destroyed: { text: '已摧毁', color: 'var(--red)', tag: 'red' },
  severe: { text: '重创', color: 'var(--amber)', tag: 'amber' },
  damaged: { text: '受损', color: '#eab308', tag: 'amber' },
  intact: { text: '完好', color: 'var(--text-2)', tag: 'gray' },
}

const RESULT_ORDER: ResultKey[] = ['destroyed', 'severe', 'damaged', 'intact']

/** 后端 target_result.result 取值映射（destroyed|severe|damaged|intact） */
function mapResult(result: string): ResultKey {
  return result === 'destroyed' || result === 'severe' || result === 'damaged' || result === 'intact'
    ? result
    : 'intact'
}

/** 解析后端 effect_metrics（JSON 字符串，可能缺失/非法） */
function parseEffect(raw?: string): Record<string, number> {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, number> = {}
    Object.keys(obj).forEach((k) => {
      const v = obj[k]
      if (typeof v === 'number') out[k] = v
      else if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) out[k] = Number(v)
    })
    return out
  } catch {
    return {}
  }
}

/** 解析后端 resource_used（JSON 字符串：四型无人机消耗架数） */
function parseResource(raw?: string): { type: string; label: string; count: number }[] {
  const FALLBACK = [
    { type: 'optical', label: '光电无人机', count: 0 },
    { type: 'radar', label: '雷达无人机', count: 0 },
    { type: 'electronic', label: '电子无人机', count: 0 },
    { type: 'comm', label: '通信无人机', count: 0 },
  ]
  if (!raw) return []
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    return FALLBACK
      .map((f) => ({ ...f, count: Number(obj[f.type] ?? 0) || 0 }))
      .filter((f) => f.count > 0)
  } catch {
    return []
  }
}

const Row: React.FC<{ label: string; value: React.ReactNode; tone?: 'green' | 'amber' | 'red' | 'cyan' | 'gray' }> = ({
  label, value, tone = 'green',
}) => (
  <div className="kv">
    <span className="k">{label}</span>
    <span className="v"><Dot tone={tone} /><span>{value}</span></span>
  </div>
)

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

/** 中央结果卡（T7-2：目标清除数量 / 覆盖区域 / 协同效率） */
const SummaryCard: React.FC<{
  cleared: number
  area: number
  coop: number
  banner: string
  tone: 'green' | 'cyan'
}> = ({ cleared, area, coop, banner, tone }) => (
  <FloatCard
    title="任务结果汇总"
    icon="check"
    style={{
      position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)',
      width: 420, borderColor: tone === 'green' ? 'var(--green)' : 'var(--cyan)',
    }}
  >
    <div className="row" style={{ gap: 8 }}>
      <Icon name="shield" className={tone === 'green' ? 'v-green' : 'v-cyan'} />
      <b style={{ fontSize: 14, letterSpacing: 0.5 }}>任务完成</b>
      <span className="spacer" />
      <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{banner}</span>
    </div>
    <div className="grid-3" style={{ marginTop: 12 }}>
      <ResultCell label="目标清除数量" value={`${cleared}`} unit="个" tone="var(--red)" />
      <ResultCell label="覆盖区域" value={area.toFixed(1)} unit="km²" tone="var(--cyan)" />
      <ResultCell label="协同效率" value={`${coop}`} unit="%" tone="var(--green)" />
    </div>
  </FloatCard>
)

const ResultCell: React.FC<{ label: string; value: string; unit: string; tone: string }> = ({ label, value, unit, tone }) => (
  <div style={{
    padding: '10px 6px', borderRadius: 'var(--radius-sm)', textAlign: 'center',
    border: '1px solid var(--panel-border)', background: 'rgba(8,16,30,.6)',
  }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: tone, lineHeight: 1.25 }}>
      {value}<span style={{ fontSize: 12, marginLeft: 2 }}>{unit}</span>
    </div>
    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
  </div>
)

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

export const T7Panel: React.FC = () => {
  const scenarioKey = useStore((s) => s.scenarioKey)
  const mission = useStore((s) => s.mission)
  const phaseProgress = useStore((s) => s.progress)
  const targets = useStore((s) => s.targets)
  const resources = useStore((s) => s.resources)
  const assessment = useStore((s) => s.assessment)
  const reports = useStore((s) => s.reports)
  const generateReport = useStore((s) => s.generateReport)
  const setPhase = useStore((s) => s.setPhase)
  const pushTimeline = useStore((s) => s.pushTimeline)
  // 默认停在动作页签 T7-2（任务总结，含【导出任务报告】等推进按钮），
  // 避免进入阶段只看到 T7-1 评估地图而找不到可执行动作。
  const [mode, setMode] = useState<'T7-1' | 'T7-2'>('T7-2')
  const [busy, setBusy] = useState(false)

  const s1 = scenarioKey === 'scenario-1'
  const a: Assessment | undefined = assessment
  const mm: MissionMetrics | undefined = a?.metrics
  const effect = parseEffect(a?.effect_metrics)

  const counts: Record<ResultKey, number> = {
    destroyed: a?.destroyed ?? 0,
    severe: a?.severe ?? 0,
    damaged: a?.damaged ?? 0,
    intact: a?.intact ?? 0,
  }
  const damageRate = a?.total_damage_rate ?? 83
  const areaControl = a?.area_control ?? 68
  const coop = mm?.coop_efficiency ?? 91
  const coverageRate = mm?.coverage_rate ?? 93
  const survival = mm?.survival_rate ?? 89
  const alertCount = mm?.alert_count ?? 0
  const resourceRows = parseResource(mm?.resource_used)
  const resourceTotal = resourceRows.reduce((n, r) => n + r.count, 0)

  const report: ReportRow | undefined = reports[0]
  const reportProgress = report ? 100 : Math.min(96, Math.max(0, phaseProgress || (s1 ? 88 : 92)))
  const reportStatus = report ? '已完成' : '生成中'

  const targetResults = a?.targetResults ?? []
  const residual = Math.min(targets.length, counts.intact + counts.damaged + alertCount)
  const threatColor = residual <= 1 ? 'var(--green)' : residual <= 3 ? 'var(--amber)' : 'var(--red)'

  const openReport = (r?: ReportRow) => {
    if (!r) return
    const path = r.path.startsWith('/') ? r.path : `/${r.path}`
    window.open(path, '_blank', 'noopener')
  }

  const onExport = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = report ?? (await generateReport())
      openReport(r)
    } finally {
      setBusy(false)
    }
  }

  const onBack = () => {
    void setPhase('T0')
  }

  const onDetach = () => pushTimeline({ kind: 'tip', text: s1 ? '前沿节点准备脱离，资源撤收与链路释放已排入序列。' : '任务体系结束，集群转入待命与回收流程。' })

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} className="fade-in">
      <TopBanner icon="check" tone="cyan">
        {s1
          ? '主要威胁节点已清除，建议保持区域持续监视；前沿节点可执行资源撤收、链路释放并转入下一部署地域。'
          : '集群协同攻击闭环已完成，毁伤评估与任务报告已同步生成。'}
      </TopBanner>

      <div className="row" style={{ position: 'absolute', left: 12, top: 58, gap: 6, pointerEvents: 'auto', zIndex: 9 }}>
        <TabBtn active={mode === 'T7-1'} onClick={() => setMode('T7-1')} icon="area"
          label={s1 ? 'T7-1 复核态势' : 'T7-1 效果评估'} sub={s1 ? '目标状态变化 · 回收轨迹' : '目标处置状态 · 毁伤率'} />
        <TabBtn active={mode === 'T7-2'} onClick={() => setMode('T7-2')} icon="file"
          label="T7-2 任务总结" sub="结果汇总 · 报告导出" />
      </div>

      {/* ---------------------------------------------------------------- T7-1 */}
      {mode === 'T7-1' && (s1
        ? (
          <>
            <MapBadge icon="target" text="目标003 已失效 / 已清除" tone="var(--text-2)" style={{ left: '45%', top: '30%' }} />
            <MapBadge icon="alert" text="残余威胁标记 2 处" tone="var(--amber)" style={{ left: '26%', top: '45%' }} />
            <MapBadge icon="plane" text="集群回收轨迹" tone="var(--green)" style={{ left: '30%', top: '59%' }} />
            <MapBadge icon="refresh" text="复核航线（虚线）" tone="var(--cyan)" style={{ left: '24%', top: '70%' }} />
            <MapBadge icon="antenna" text="前沿节点待脱离" tone="var(--amber)" style={{ left: '44%', top: '76%' }} />

            <FloatCard
              title="T7-1 复核态势"
              icon="area"
              style={{ position: 'absolute', left: 12, bottom: 88, width: 300, maxHeight: 'calc(100% - 214px)' }}
            >
              <Sub title="目标状态变化（红 → 黄 → 灰）">
                <div className="row" style={{ gap: 8, fontSize: 11.5 }}>
                  <span className="tag red" style={{ opacity: 0.55 }}>高威胁</span>
                  <Icon name="chevron" size={12} />
                  <span className="tag amber" style={{ opacity: 0.75 }}>已压制</span>
                  <Icon name="chevron" size={12} />
                  <span className="tag gray">已清除</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-1)', lineHeight: 1.7 }}>
                  目标003 指挥通信节点已失效并清除，残余威胁标记 2 处，复核航线覆盖主要网格。
                </div>
              </Sub>
              <Sub title="集群回收">
                <div className="row" style={{ gap: 12 }}>
                  <Ring value={78} size={64} tone="var(--green)" label="78%" sub="回收进度" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Row label="返航集群数" value="4 / 6" />
                    <Row label="回收航线" value="已生成并校验" tone="cyan" />
                  </div>
                </div>
              </Sub>
              <Sub title="节点状态">
                <Row label="前沿节点" value="待脱离" tone="amber" />
                <Row label="复核侦察" value="持续执行中" tone="cyan" />
                <Row label="链路释放" value="排队中" tone="amber" />
              </Sub>
            </FloatCard>

            <BottomBar>
              <div className="row wrap" style={{ gap: 14, fontSize: 12 }}>
                <Dot tone="green" label="目标已清除" />
                <Dot tone="amber" label={`残余威胁 ${residual} 处`} />
                <Dot tone="cyan" label="复核航线已规划" />
              </div>
              <span className="spacer" />
              <Btn icon="refresh" onClick={() => pushTimeline({ kind: 'tip', text: '继续复核，保持区域持续监视。' })}>继续复核</Btn>
              <Btn variant="primary" icon="plane" onClick={onDetach}>准备脱离</Btn>
            </BottomBar>
          </>
        )
        : (
          <>
            <MapBadge icon="target" text="目标分色：已摧毁 / 受损 / 未受损" tone="var(--red)" style={{ left: '42%', top: '30%' }} />
            <MapBadge icon="plane" text="集群轨迹 / 光电无人机" style={{ left: '26%', top: '46%' }} />
            <MapBadge icon="wave" text="毁伤评估着色" tone="var(--amber)" style={{ left: '30%', top: '60%' }} />
            <MapBadge icon="antenna" text="前沿指控节点辐射攻击轨迹" tone="var(--green)" style={{ left: '40%', top: '74%' }} />

            <FloatCard
              title="目标处置状态"
              icon="target"
              style={{ position: 'absolute', left: 12, bottom: 88, width: 420, maxHeight: 'calc(100% - 214px)' }}
            >
              <div className="row" style={{ gap: 14, alignItems: 'center' }}>
                <Ring value={damageRate} size={72} tone={damageRate >= 80 ? 'var(--red)' : 'var(--amber)'} label={`${damageRate}%`} sub="总体毁伤率" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="grid-2">
                    {RESULT_ORDER.map((k) => (
                      <div key={k} className="row" style={{ gap: 6, fontSize: 12 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: RESULT_META[k].color, display: 'inline-block' }} />
                        <span style={{ color: 'var(--text-1)' }}>{RESULT_META[k].text}</span>
                        <span className="spacer" />
                        <b style={{ color: RESULT_META[k].color }}>{counts[k]}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Sub title="逐目标处置结果">
                {targetResults.length === 0
                  ? <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>暂无逐目标处置结果</div>
                  : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {targetResults.map((tr) => {
                        const meta = RESULT_META[mapResult(tr.result)]
                        return (
                          <div key={tr.target_id} style={{
                            padding: '7px 9px', borderRadius: 'var(--radius-sm)',
                            border: `1px solid ${meta.color}`, background: 'rgba(8,16,30,.62)',
                          }}>
                            <div className="row" style={{ gap: 6 }}>
                              <b style={{ fontSize: 12 }}>目标{String(tr.target_no).padStart(3, '0')}</b>
                              <span className="spacer" />
                              <Tag tone={meta.tag}>{meta.text}</Tag>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-1)', marginTop: 3 }}>
                              {tr.name} · {tr.type}
                            </div>
                            <div style={{ marginTop: 5 }}>
                              <Bar value={meta.tag === 'red' ? 100 : meta.tag === 'amber' ? 62 : 18}
                                tone={meta.tag === 'red' ? 'red' : meta.tag === 'amber' ? 'amber' : 'blue'} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
              </Sub>
            </FloatCard>

            {/* 场景二 T7-1 界面无底部按钮（需求初稿 §8 T7-1） */}
            <div className="panel row" style={{
              position: 'absolute', left: 12, bottom: 12, right: 320, padding: '10px 14px',
              pointerEvents: 'auto', gap: 16, fontSize: 12, zIndex: 9,
            }}>
              <span style={{ color: 'var(--text-2)' }}>总体毁伤率</span>
              <b className="v-red">{damageRate}%</b>
              <span style={{ color: 'var(--text-2)' }}>区域控制</span>
              <b className="v-cyan">{areaControl}%</b>
              <span style={{ color: 'var(--text-2)' }}>链路稳定性</span>
              <b className="v-green">{mm?.link_stability ?? 96}%</b>
              <span className="spacer" />
              <span style={{ color: 'var(--text-2)' }}>本界面无底部按钮 · 处置结果已回传云端</span>
            </div>
          </>
        ))}

      {/* ---------------------------------------------------------------- T7-2 */}
      {mode === 'T7-2' && (
        <>
          <SummaryCard
            cleared={counts.destroyed}
            area={areaControl * 0.36}
            coop={coop}
            banner={s1 ? '敏捷拒止布控闭环已完成' : '集群协同攻击闭环已完成'}
            tone={counts.destroyed > 0 ? 'green' : 'cyan'}
          />

          <FloatCard
            title={s1 ? 'T7-2 任务总结' : '任务执行效能评估'}
            icon="file"
            style={{ position: 'absolute', left: 12, bottom: 88, width: 320, maxHeight: 'calc(100% - 214px)' }}
          >
            <Sub title="报告生成">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12 }}>报告生成进度</span>
                <span className={report ? 'v-green' : 'v-amber'} style={{ fontWeight: 700 }}>{reportStatus}</span>
              </div>
              <Bar value={reportProgress} tone={report ? 'green' : 'amber'} />
              <Row label="报告编号" value={report?.report_no ?? '待生成'} tone={report ? 'green' : 'amber'} />
              <Row label="生成时间" value={report?.created_at ?? '—'} tone={report ? 'green' : 'gray'} />
            </Sub>

            <Sub title="关键结果">
              <Row label="目标清除数量" value={`${counts.destroyed} 个`} tone="red" />
              <Row label="覆盖率" value={`${coverageRate}%`} tone="cyan" />
              <Row label="组网时长" value={`${Math.round((mm?.mesh_duration_sec ?? 2280) / 60)} 分钟`} tone="cyan" />
              <Row label="任务存活率" value={`${survival}%`} />
            </Sub>

            {!s1 && (
              <Sub title="任务执行效能评估">
                <Row label="边缘自主执行率" value={`${effect.edgeExecRate ?? 87}%`} tone="cyan" />
                <Row label="云端策略优化次数" value={`${Math.max(1, alertCount)} 次`} tone="cyan" />
                <Row label="平均决策响应时间" value="0.42 s" tone="cyan" />
                <Row label="光电无人机命中率" value={`${counts.destroyed > 0 ? Math.round((counts.destroyed / Math.max(1, targets.length)) * 100) : 90}%`} tone="red" />
                <Row label="链路稳定性" value={`${mm?.link_stability ?? 96}%`} />
              </Sub>
            )}

            {!s1 && (
              <Sub title="资源消耗统计">
                {resourceRows.length === 0
                  ? <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>暂无资源消耗数据</div>
                  : resourceRows.map((r) => (
                    <div key={r.type} className="kv">
                      <span className="k">{r.label}</span>
                      <span className="v">{r.count} 架</span>
                    </div>
                  ))}
                <Row label="合计消耗" value={`${resourceTotal} 架`} tone="cyan" />
                <Row label="任务存活率" value={`${survival}%`} />
              </Sub>
            )}

            <Sub title="信息与链路">
              <Row label="信息包已推送" value="已推送" tone="green" />
              <Row label="残余风险" value={residual <= 2 ? '低' : '中'} tone={residual <= 2 ? 'green' : 'amber'} />
              <Row label="链路待释放" value="待释放" tone="amber" />
            </Sub>

            {resources && (
              <Sub title="资源概况">
                <Row label="在线率" value={`${resources.onlineRate}%`} />
                <Row label="四型无人机" value={`${resources.totalAll} 架`} tone="cyan" />
              </Sub>
            )}
          </FloatCard>

          <BottomBar>
            <div className="row wrap" style={{ gap: 14, fontSize: 12 }}>
              <Dot tone="green" label="信息包已推送" />
              <Dot tone={residual <= 2 ? 'green' : 'amber'} label={`残余风险${residual <= 2 ? '低' : '中'}`} />
              <Dot tone="amber" label="链路待释放" />
            </div>
            <span className="spacer" />
            <Btn icon="refresh" onClick={onBack}>返回场景选择</Btn>
            <Btn variant="primary" icon="download" disabled={busy} onClick={() => void onExport()}>导出任务报告</Btn>
            <Btn variant={s1 ? 'danger' : 'default'} icon="plane" onClick={onDetach}>
              {s1 ? '快速脱离体系' : '结束任务体系'}
            </Btn>
          </BottomBar>
        </>
      )}
    </div>
  )
}
