// T5Panel —— 阶段 T5「任务决策与打击准备」（场景一 / 场景二共用，差异按契约 §7.3 / §7.4 取文案）
// 方案数据来自 store.strikePlans（side==='strike'）；仅在方案未就绪时使用本地演示兜底。
import React from 'react'
import { useStore } from '@/stores/useStore'
import { Btn, Empty, Icon, KV, Stars, Tag, Timeline } from '@/components/ui'
import { BottomBar, FloatCard, Sub } from '@/features/panels/common'
import type { Plan } from '@/api/types'

// ---------------------------------------------------------------- 工具
/** groups 为 JSON 字符串（契约 §5 plan.groups），解析失败时不抛异常 */
function parseGroups(raw?: string): string[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

const successText = (rate?: number) => (typeof rate === 'number' ? `${Math.round(rate)}%` : '—')

/** 演示兜底：场景一打击方案（契约 §7.3 / §7.5：68% / 82% / 61%，方案二为推荐） */
const FALLBACK_S1: Plan[] = [
  {
    id: 'demo-1-p1', mission_id: 'demo', side: 'strike', seq: 1, name: '方案一 光电精确打击',
    method: '精确打击', groups: '["集群2（光电）"]', success_rate: 68, effect: '精准摧毁',
    recommended: 0, adopted: 0, confirmed: 0,
  },
  {
    id: 'demo-1-p2', mission_id: 'demo', side: 'strike', seq: 2, name: '方案二 多集群协同压制',
    method: '协同压制', groups: '["集群1","集群2","集群3","集群4","集群5","集群6"]', success_rate: 82,
    effect: '压制摧毁', recommended: 1, adopted: 0, confirmed: 0,
  },
  {
    id: 'demo-1-p3', mission_id: 'demo', side: 'strike', seq: 3, name: '方案三 电子干扰配合',
    method: '电子干扰+打击', groups: '["集群4（电子）","集群5（通信）"]', success_rate: 61,
    effect: '干扰瘫痪后打击', recommended: 0, adopted: 0, confirmed: 0,
  },
]

/** 演示兜底：场景二打击方案（契约 §7.4 逐字方案名；星级按需求初稿 §8-T5-1） */
const FALLBACK_S2: Plan[] = [
  {
    id: 'demo-2-p1', mission_id: 'demo', side: 'strike', seq: 1, name: '方案一｜光电精确打击', subtitle: '局部执行',
    method: '光电精确打击', groups: '["前出侦察集群","机动执行集群"]', success_rate: 76, stars: 4,
    effect: '精准锁定单一高价值目标，以光电侦察引导精确打击', recommended: 0, adopted: 0, confirmed: 0,
  },
  {
    id: 'demo-2-p2', mission_id: 'demo', side: 'strike', seq: 2, name: '方案二｜集群协同攻击', subtitle: '集群协同',
    method: '集群协同攻击',
    groups: '["前出侦察集群","侧向感知集群","雷达探测集群","边缘协同处理集群","电子对抗集群","机动执行集群"]',
    success_rate: 88, stars: 5, effect: '多集群协同、分布式自主执行，边缘自主决策、云端优化支撑',
    recommended: 1, adopted: 0, confirmed: 0,
  },
  {
    id: 'demo-2-p3', mission_id: 'demo', side: 'strike', seq: 3, name: '方案三｜电子压制协同', subtitle: '电子压制',
    method: '电子压制协同', groups: '["电子对抗集群","机动执行集群"]', success_rate: 74, stars: 3,
    effect: '电子压制与打击协同配合，干扰敌方通信与防空系统', recommended: 0, adopted: 0, confirmed: 0,
  },
]

// ---------------------------------------------------------------- 场景一附加内容
/** 打击窗口时间轴（需求初稿 §6-T5-2 逐字） */
const STRIKE_WINDOW = ['T+00 信息包生成', 'T+03 火力协同确认', 'T+06 空中支援接入', 'T+09 等待任务生成']

/** 资源调度情况（需求初稿 §6-T5-2） */
const DISPATCH = [
  ['光电集群', '持续跟踪'],
  ['雷达集群', '位置校正'],
  ['电子集群', '压制待命'],
  ['通信集群', '链路中继'],
] as const

// ---------------------------------------------------------------- 场景二附加内容
const CLOUD_EDGE = ['云端算力中心', '边缘指控单元', '前端无人集群']
const EDGE_NODE = [
  ['前沿指控节点', '在线'],
  ['本地决策能力', '已激活'],
  ['缓存任务数量', '12 条'],
] as const
const EO_UAV = [
  ['待命数量', '12 架'],
  ['任务载荷状态', '就绪'],
  ['续航时间', '32 分钟'],
] as const

const PICK_TIME = '16:10 - 16:18'

// ---------------------------------------------------------------- 组件
export const T5Panel: React.FC = () => {
  const s2 = useStore((s) => s.scenarioKey) === 'scenario-2'
  const strikePlans = useStore((s) => s.strikePlans)
  const confirmPlan = useStore((s) => s.confirmPlan)
  const optimizePlan = useStore((s) => s.optimizePlan)
  const nextPhase = useStore((s) => s.nextPhase)

  // 只取打击侧方案；为空时用演示兜底（不抛异常）
  const list = React.useMemo(() => {
    const strikes = strikePlans.filter((p) => p.side === 'strike')
    return strikes.length > 0 ? strikes : (s2 ? FALLBACK_S2 : FALLBACK_S1)
  }, [strikePlans, s2])

  const target = list.find((p) => p.recommended === 1) ?? list[0]

  const onGenerate = () => {
    if (target) void confirmPlan(target.id)
    void nextPhase()
  }

  return (
    <>
      {/* 左侧：打击方案卡 3 张 */}
      <FloatCard
        title={s2 ? '任务执行方案' : '打击方案'}
        icon="mission"
        style={{ position: 'absolute', left: 12, top: 64, width: 400 }}
        maxHeight="calc(100% - 128px)"
        extra={<span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>共 {list.length} 套</span>}
      >
        {list.length === 0 ? (
          <Empty />
        ) : (
          list.map((p) => <PlanCard key={p.id} p={p} s2={s2} />)
        )}
      </FloatCard>

      {/* 右侧：场景附加信息（让出 300px 右侧栏） */}
      <FloatCard
        title={s2 ? '云边端与执行节点' : '打击窗口与资源调度'}
        icon={s2 ? 'cloud' : 'clock'}
        style={{ position: 'absolute', right: 312, top: 64, width: 352 }}
        maxHeight="calc(100% - 128px)"
      >
        {s2 ? (
          <>
            <Sub title="时间窗口">
              <div
                className="row"
                style={{
                  padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--panel-border-strong)', background: 'rgba(34,211,238,.08)',
                }}
              >
                <Icon name="clock" size={14} />
                <span style={{ fontSize: 12.5, color: 'var(--text-1)' }}>最优打击时间</span>
                <span className="spacer" />
                <span style={{ fontSize: 14, fontWeight: 700 }} className="v-cyan">{PICK_TIME}</span>
              </div>
            </Sub>

            <Sub title="云边端协同状态">
              {CLOUD_EDGE.map((n) => (
                <KV key={n} k={n} v="在线" vClass="v-green" />
              ))}
            </Sub>

            <Sub title="边缘自主执行节点">
              {EDGE_NODE.map(([k, v]) => (
                <KV key={k} k={k} v={v} vClass="v-green" />
              ))}
            </Sub>

            <Sub title="光电无人机">
              {EO_UAV.map(([k, v]) => (
                <KV key={k} k={k} v={v} />
              ))}
            </Sub>
          </>
        ) : (
          <>
            <Sub title="打击窗口时间轴">
              <Timeline
                nodes={STRIKE_WINDOW.map((label, i) => ({ label, state: i === 0 ? 'active' : 'todo' }))}
              />
            </Sub>

            <Sub title="资源调度情况">
              {DISPATCH.map(([k, v]) => (
                <KV key={k} k={k} v={v} vClass="v-green" />
              ))}
            </Sub>

            <Sub title="信息包与协同状态">
              <KV k="目标信息包生成" v="已生成" vClass="v-green" />
              <KV k="远程火力协同" v="已确认" vClass="v-green" />
              <KV k="空中支援接入" v="已接入" vClass="v-green" />
              <KV k="链路稳定性" v="稳定" vClass="v-green" />
            </Sub>
          </>
        )}
      </FloatCard>

      {/* 底部动作条：按场景取逐字按钮 */}
      <BottomBar>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          推荐方案：{target ? target.name : '—'}
        </span>
        <span className="spacer" />
        {s2 ? (
          <>
            <Btn onClick={() => target && void optimizePlan(target.id)}>调整方案</Btn>
            <Btn variant="primary" onClick={onGenerate}>生成执行任务</Btn>
          </>
        ) : (
          <>
            <Btn variant="primary" onClick={onGenerate}>生成打击任务</Btn>
            <Btn onClick={() => target && void optimizePlan(target.id)}>调整方案</Btn>
          </>
        )}
      </BottomBar>
    </>
  )
}

/** 单张打击方案卡（推荐方案加边框与「推荐方案」角标） */
const PlanCard: React.FC<{ p: Plan; s2: boolean }> = ({ p, s2 }) => {
  const groups = parseGroups(p.groups)
  const rec = Boolean(p.recommended)
  return (
    <div
      style={{
        marginBottom: 8, padding: '9px 11px', borderRadius: 'var(--radius)',
        border: `1px solid ${rec ? 'var(--cyan)' : 'var(--panel-border)'}`,
        background: rec ? 'rgba(34,211,238,.08)' : 'rgba(12,22,40,.5)',
        boxShadow: rec ? 'var(--shadow-glow)' : 'none',
      }}
    >
      <div className="row" style={{ gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
        {p.subtitle && <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>（{p.subtitle}）</span>}
        <span className="spacer" />
        {rec && <Tag tone="cyan">推荐方案</Tag>}
      </div>

      {p.method && (
        <div style={{ marginTop: 5 }}>
          <KV k="打击方式" v={p.method} />
        </div>
      )}
      {groups.length > 0 && <KV k="参与集群" v={groups.join(' · ')} />}
      <KV
        k="成功率预估"
        v={
          s2 && typeof p.stars === 'number'
            ? <Stars value={p.stars} />
            : <span className={rec ? 'v-cyan' : ''}>{successText(p.success_rate)}</span>
        }
      />
      {p.effect && <KV k="打击效果" v={p.effect} />}
    </div>
  )
}
