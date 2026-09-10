// T1Panel —— 无人机分组与任务编组（契约 §7.3 T1 / §7.4 T1）
// 左：四型无人机资源列表；中：三套编组方案卡；底部动作条与编组概况。
import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { Bar, Btn, Dot, Empty, Icon, KV, Stars, Tag } from '@/components/ui'
import { BottomBar, FloatCard, Sub } from './common'
import type { Plan } from '@/api/types'

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
      {/* 左：无人机类型列表 */}
      <FloatCard
        title="无人机类型"
        icon="plane"
        style={{ position: 'absolute', left: 12, top: 64, width: 262 }}
        maxHeight={340}
      >
        {resources ? (
          resources.items.map((r) => (
            <div key={r.type} style={{ padding: '7px 0', borderBottom: '1px solid rgba(80,160,255,.10)' }}>
              <div className="row">
                <Dot tone="green" />
                <b style={{ fontSize: 12.5 }}>{TYPE_LABEL[r.type] ?? r.type}</b>
                <span className="spacer" />
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>可用 {r.available}</span>
              </div>
              <div className="row" style={{ marginTop: 4, gap: 10, fontSize: 11, color: 'var(--text-2)' }}>
                <span>总数 {r.total}</span>
                <span>已分配 {r.allocated}</span>
                <span>待分配 {r.pending}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3 }}>
                任务能力：{r.ability_tags}
              </div>
            </div>
          ))
        ) : (
          <Empty text="资源加载中" />
        )}
      </FloatCard>

      {/* 中：三套编组方案 */}
      <div style={{
        position: 'absolute', left: 288, top: 64, right: 332, bottom: 92,
        display: 'flex', gap: 10, pointerEvents: 'none', alignItems: 'flex-start',
      }}>
        {plans.length === 0 && (
          <div className="panel" style={{ pointerEvents: 'auto', padding: 16, flex: 1 }}>
            <Empty text="编组方案生成中…" />
          </div>
        )}
        {plans.map((p) => {
          const active = p.id === activePlanId
          const rec = p.recommended === 1
          const clusters = parseGroups(p)
          return (
            <button
              key={p.id}
              onClick={() => setSelectedPlanId(p.id)}
              className="panel"
              style={{
                pointerEvents: 'auto', flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer',
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
                <div className="row" style={{ gap: 6, marginBottom: 8, fontSize: 11 }}>
                  <span className="v-cyan">光电 {totals.optical ?? 0}</span>
                  <span className="v-cyan">雷达 {totals.radar ?? 0}</span>
                  <span className="v-cyan">电子 {totals.electronic ?? 0}</span>
                  <span className="v-cyan">通信 {totals.comm ?? 0}</span>
                </div>
                {clusters.length > 0 && (
                  <>
                    <div className="subhead" style={{ margin: '4px 0 5px' }}>任务集群（{clusters.length}）</div>
                    <ol style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.75 }}>
                      {clusters.map((c) => <li key={c}>{c}</li>)}
                    </ol>
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
                      <span>推荐评分</span><span className="spacer" />
                      <b className="v-green">{p.success_rate}%</b>
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

      {/* 底部：编组概况 + 动作按钮 */}
      <BottomBar right={320}>
        <div className="row" style={{ gap: 16, fontSize: 12 }}>
          <span>
            <span style={{ color: 'var(--text-2)' }}>当前编组资源 </span>
            <b className="v-cyan">{allocatedTotal}/{totalAll}</b>
          </span>
          <span>
            <span style={{ color: 'var(--text-2)' }}>待分配资源 </span>
            <b>{resources?.pendingTotal ?? 0}</b>
          </span>
          <span>
            <span style={{ color: 'var(--text-2)' }}>资源利用率 </span>
            <b className="v-green">{utilization}%</b>
          </span>
          <span>
            <span style={{ color: 'var(--text-2)' }}>集群数量 </span>
            <b>{groupClusters.length}</b>
          </span>
          <span>
            <span style={{ color: 'var(--text-2)' }}>链路就绪 </span>
            <b className="v-green">96%</b>
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
