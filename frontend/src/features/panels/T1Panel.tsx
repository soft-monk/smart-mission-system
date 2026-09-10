// T1Panel —— 无人机分组与任务编组（契约 §7.3 T1 / §7.4 T1）
// 左：四型无人机资源列表；中：三套编组方案卡；底部动作条与编组概况。
import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { Bar, Btn, Dot, Empty, Icon, KV, Stat, Stars, Tag } from '@/components/ui'
import { BottomBar, FloatCard, Sub } from './common'
import type { Plan } from '@/api/types'

/** 集群名 → 该集群的四型配比（演示级：按方案给出的资源总数与集群序位分配） */
interface MiniChips { optical: number; radar: number; electronic: number; comm: number }

function allocFor(clusters: string[], totals: Record<string, number>): MiniChips[] {
  const n = Math.max(1, clusters.length)
  const T = {
    optical: totals.optical ?? 0,
    radar: totals.radar ?? 0,
    electronic: totals.electronic ?? 0,
    comm: totals.comm ?? 0,
  }
  const out: MiniChips[] = []
  let remO = T.optical, remR = T.radar, remE = T.electronic, remC = T.comm
  for (let i = 0; i < n; i++) {
    const left = n - i
    const take = (rem: number, prefer: number[]) => {
      const w = prefer[i % prefer.length]
      const v = i === n - 1 ? rem : Math.min(rem, w)
      return Math.max(0, v)
    }
    const o = take(remO, [6, 5, 0, 2, 1, 4])
    remO -= o
    const r = take(remR, [3, 2, 5, 1, 2, 2])
    remR -= r
    const e = take(remE, [2, 2, 1, 2, 7, 2])
    remE -= e
    const c = take(remC, [1, 1, 1, 6, 1, 2])
    remC -= c
    void left
    out.push({ optical: o, radar: r, electronic: e, comm: c })
  }
  return out
}

const TYPE_CHIPS: { key: keyof MiniChips; label: string; tone: string }[] = [
  { key: 'optical', label: '光电', tone: '#22d3ee' },
  { key: 'radar', label: '雷达', tone: '#f59e0b' },
  { key: 'electronic', label: '电子', tone: '#a855f7' },
  { key: 'comm', label: '通信', tone: '#22c55e' },
]

/** 单个集群配比行（原型图里成片的迷你参数格） */
const ClusterRow: React.FC<{ name: string; chips: MiniChips }> = ({ name, chips }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr repeat(4, minmax(30px, auto))',
      gap: 4,
      alignItems: 'center',
      padding: '4px 6px',
      borderRadius: 4,
      background: 'rgba(10, 22, 40, 0.55)',
      border: '1px solid rgba(80, 160, 255, 0.13)',
      marginBottom: 4,
    }}
  >
    <span style={{ fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {name}
    </span>
    {TYPE_CHIPS.map((c) => (
      <span
        key={c.key}
        title={`${c.label} ${chips[c.key]}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end',
          fontSize: 10.5, color: c.tone, fontVariantNumeric: 'tabular-nums',
        }}
      >
        <i style={{ width: 5, height: 5, borderRadius: 1, background: c.tone, display: 'inline-block' }} />
        {chips[c.key]}
      </span>
    ))}
  </div>
)

const TYPE_LABEL: Record<string, string> = {
  optical: '光电无人机', radar: '雷达无人机', electronic: '电子无人机', comm: '通信无人机',
}

function parseGroups(plan: Plan): string[] {
  if (!plan.groups) return []
  try {
    const v = JSON.parse(plan.groups) as unknown
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

export const T1Panel: React.FC = () => {
  const s2 = useStore((s) => s.scenarioKey) === 'scenario-2'
  const resources = useStore((s) => s.resources)
  const plans = useStore((s) => s.groupPlans)
  const groups = useStore((s) => s.groups)
  const refreshPlans = useStore((s) => s.refreshPlans)
  const refreshGroups = useStore((s) => s.refreshGroups)
  const adoptPlan = useStore((s) => s.adoptPlan)
  const optimizePlan = useStore((s) => s.optimizePlan)
  const confirmPlan = useStore((s) => s.confirmPlan)
  const nextPhase = useStore((s) => s.nextPhase)
  const pushTimeline = useStore((s) => s.pushTimeline)

  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>()
  const [detailOpen, setDetailOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void refreshPlans()
    void refreshGroups()
  }, [refreshPlans, refreshGroups])

  const recommended = plans.find((p) => p.recommended === 1)
  const activePlanId = selectedPlanId ?? recommended?.id
  const activePlan = plans.find((p) => p.id === activePlanId)

  const totals = resources?.totals ?? {}
  const allocatedTotal = resources?.allocatedTotal ?? 0
  const totalAll = resources?.totalAll ?? 0
  const utilization = totalAll > 0 ? Math.round((allocatedTotal / totalAll) * 100) : 0

  const groupClusters = useMemo(
    () => (activePlan ? parseGroups(activePlan) : groups.map((g) => g.name)),
    [activePlan, groups],
  )

  const onAdopt = async () => {
    if (!activePlanId) return
    setBusy(true)
    try {
      await adoptPlan(activePlanId)
      pushTimeline({ kind: 'tip', text: `已采用：${activePlan?.name ?? ''}` })
    } finally {
      setBusy(false)
    }
  }

  const onConfirm = async () => {
    if (!activePlanId) return
    setBusy(true)
    try {
      await confirmPlan(activePlanId)
      await nextPhase()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* 左：无人机类型列表（原型图：机型图标 + 总数/可用数 + 能力标签 + 彩色分配胶囊） */}
      <FloatCard
        title="无人机类型列表"
        icon="plane"
        style={{ position: 'absolute', left: 12, top: 64, width: 262 }}
        maxHeight="calc(100% - 190px)"
      >
        {resources ? (
          resources.items.map((r) => (
            <div
              key={r.type}
              style={{
                padding: '8px 0', borderBottom: '1px dashed rgba(80,160,255,.14)',
              }}
            >
              <div className="row" style={{ gap: 8 }}>
                <span style={{
                  width: 30, height: 30, flex: '0 0 auto', borderRadius: 6,
                  display: 'grid', placeItems: 'center',
                  background: 'rgba(34,211,238,.10)', border: '1px solid rgba(34,211,238,.28)',
                  color: TYPE_CHIPS.find((c) => c.key === r.type)?.tone ?? 'var(--cyan)',
                }}>
                  <Icon name={r.type === 'radar' ? 'radar' : r.type === 'comm' ? 'antenna' : r.type === 'electronic' ? 'wave' : 'eye'} size={17} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{TYPE_LABEL[r.type] ?? r.type}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                    总数量 <b className="v-cyan">{r.total}</b>
                    <span style={{ margin: '0 6px' }} />
                    可用数量 <b className="v-cyan">{r.available}</b>
                  </div>
                </div>
                <Dot tone="green" />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 5 }}>
                任务能力
                {String(r.ability_tags).split('/').map((t) => (
                  <span key={t} className="tag cyan" style={{ marginLeft: 4 }}>{t.trim()}</span>
                ))}
              </div>
              <div className="row" style={{ marginTop: 5, gap: 5, fontSize: 11 }}>
                <span style={{ color: 'var(--text-2)' }}>当前分配</span>
                <span className="tag blue">已分配 {r.allocated}</span>
                <span className="tag gray">待分配 {r.pending}</span>
              </div>
            </div>
          ))
        ) : (
          <Empty text="资源加载中" />
        )}
      </FloatCard>

      {/* 中：三套编组方案（2 列网格，原型图为并排方案卡 + 逐集群配比） */}
      <div style={{
        position: 'absolute', left: 288, top: 64, right: 332, bottom: 172,
        display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10, pointerEvents: 'none', alignContent: 'start',
      }}>
        {plans.length === 0 && (
          <div className="panel" style={{ pointerEvents: 'auto', padding: 16, gridColumn: '1 / -1' }}>
            <Empty text="编组方案生成中…" />
          </div>
        )}
        {plans.map((p) => {
          const active = p.id === activePlanId
          const rec = p.recommended === 1
          const clusters = parseGroups(p)
          const alloc = allocFor(clusters, totals)
          return (
            <button
              key={p.id}
              onClick={() => setSelectedPlanId(p.id)}
              className="panel"
              style={{
                pointerEvents: 'auto', minWidth: 0, textAlign: 'left', cursor: 'pointer',
                fontFamily: 'inherit', color: 'var(--text-0)', padding: 0, overflow: 'hidden',
                borderColor: rec ? 'var(--cyan)' : active ? 'var(--panel-border-strong)' : 'var(--panel-border)',
                background: rec ? 'linear-gradient(180deg,rgba(34,211,238,.14),rgba(34,211,238,.02))' : undefined,
                boxShadow: rec ? 'var(--shadow-glow)' : 'none',
                maxHeight: '100%', display: 'flex', flexDirection: 'column',
              }}
            >
              <div className="row" style={{ padding: '9px 11px', borderBottom: '1px solid var(--panel-border)' }}>
                <b style={{ fontSize: 12.5 }}>{p.name}</b>
                <span className="spacer" />
                {rec && <Tag tone="cyan">AI推荐</Tag>}
              </div>
              <div style={{ padding: '9px 11px', overflow: 'auto', flex: 1 }}>
                {p.subtitle && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 7 }}>{p.subtitle}</div>
                )}
                {/* 方案资源合计（原型图：光电/雷达/电子/通信 四个合计） */}
                <div className="row" style={{ gap: 8, marginBottom: 8, fontSize: 11, flexWrap: 'wrap' }}>
                  {TYPE_CHIPS.map((c) => (
                    <span key={c.key} style={{ color: c.tone }}>
                      <i style={{ width: 6, height: 6, borderRadius: 1, background: c.tone, display: 'inline-block', marginRight: 3 }} />
                      {c.label} {totals[c.key] ?? 0}
                    </span>
                  ))}
                </div>
                {/* 逐集群四型配比（原型图的核心信息密度来源） */}
                {clusters.length > 0 && (
                  <>
                    <div className="subhead" style={{ margin: '4px 0 5px' }}>任务集群（{clusters.length}）</div>
                    {clusters.map((c, i) => (
                      <ClusterRow key={c + i} name={c} chips={alloc[i]} />
                    ))}
                  </>
                )}
                <div className="row" style={{ marginTop: 9, gap: 8, fontSize: 11, color: 'var(--text-2)' }}>
                  <span>任务方向：{s2 ? '集群协同攻击' : '集群协同攻击'}</span>
                </div>
                <div className="row" style={{ gap: 8, fontSize: 11 }}>
                  <span style={{ color: 'var(--text-2)' }}>{s2 ? '云边协同' : '协同关系'}：</span>
                  <span className="v-green">{s2 ? '已联动' : '链路保障'}</span>
                </div>
                {p.success_rate !== undefined && (
                  <div style={{ marginTop: 8 }}>
                    <div className="row" style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      <span>{rec ? '推荐评分' : '评分'}</span><span className="spacer" />
                      <b className="v-green" style={{ fontSize: 13 }}>{p.success_rate}%</b>
                    </div>
                    <Bar value={p.success_rate} tone="green" />
                  </div>
                )}
                {s2 && p.stars !== undefined && (
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    <Stars value={p.stars} />
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* 方案详情弹层 */}
      {detailOpen && activePlan && (
        <FloatCard
          title={`方案详情 · ${activePlan.name}`}
          icon="layers"
          style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            width: 520, maxHeight: '70%', zIndex: 13,
          }}
          extra={<button className="btn ghost sm" onClick={() => setDetailOpen(false)}><Icon name="close" size={13} /></button>}
        >
          {activePlan.reason && <Sub title="推荐理由"><div style={{ fontSize: 12.2, lineHeight: 1.7, color: 'var(--text-1)' }}>{activePlan.reason}</div></Sub>}
          {activePlan.advantage && (
            <Sub title="方案优势">
              {activePlan.advantage.split('|').map((a) => (
                <div key={a} style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.7 }}>
                  <Icon name="check" size={12} className="v-green" /> {a}
                </div>
              ))}
            </Sub>
          )}
          {activePlan.note && <Sub title="方案备注"><div style={{ fontSize: 12, color: 'var(--text-2)' }}>{activePlan.note}</div></Sub>}
        </FloatCard>
      )}

      {/* 编组概况数据行（原型图底部的四格统计条）——放在底部动作条正上方、避开左侧资源卡 */}
      <div style={{
        position: 'absolute', left: 288, right: 332, bottom: 76, pointerEvents: 'auto',
        display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8,
      }}>
        <Stat k="当前编组资源" v={`${allocatedTotal}`} u={`/${totalAll}`} tone="var(--cyan)" />
        <Stat k="待分配资源" v={`${resources?.pendingTotal ?? 0}`} u="架" />
        <Stat k="资源利用率" v={`${utilization}`} u="%" tone="var(--green)" />
        <Stat k="AI 状态" v="运行中" tone="var(--green)" />
      </div>

      {/* 底部：编组概况 + 动作按钮 */}
      <BottomBar right={320}>
        <div className="row" style={{ gap: 16, fontSize: 12 }}>
          <span>
            <span style={{ color: 'var(--text-2)' }}>集群数量 </span>
            <b className="v-cyan">{groupClusters.length}</b>
          </span>
          <span>
            <span style={{ color: 'var(--text-2)' }}>链路就绪 </span>
            <b className="v-green">96%</b>
          </span>
          <span>
            <span style={{ color: 'var(--text-2)' }}>在线状态 </span>
            <b className="v-green">{resources?.onlineRate ?? 100}%</b>
          </span>
        </div>

        <span className="spacer" />

        <div className="row" style={{ gap: 8 }}>
          <Btn onClick={() => setDetailOpen(true)} disabled={!activePlan}>查看方案详情</Btn>
          <Btn icon="refresh" onClick={() => void optimizePlan(activePlanId ?? '')} disabled={!activePlanId || busy}>
            自动优化
          </Btn>
          <Btn variant="primary" onClick={() => void onConfirm()} disabled={!activePlanId || busy}>
            确认编组 »
          </Btn>
          <Btn onClick={() => void onAdopt()} disabled={!activePlanId || busy}>确认采用推荐方案</Btn>
        </div>
      </BottomBar>
    </>
  )
}
