// T4Panel —— 阶段 T4（场景一「目标识别与筛选」/ 场景二「目标识别、评估与任务生成」）
// 文案逐字依据：契约 §7.3 / §7.4；界面元素依据：需求初稿 §6-T4 / §8-T4。
// 目标数据一律来自 store.targets（单一目标台账 TR-TGT-01），仅在台账为空时使用本地演示兜底。
import React from 'react'
import { useStore } from '@/stores/useStore'
import { Bar, Btn, Empty, Icon, KV, Tag, Timeline } from '@/components/ui'
import { BottomBar, FloatCard, NextBtn, Sub } from '@/features/panels/common'
import type { Target, Threat } from '@/api/types'

// ---------------------------------------------------------------- 常量
const THREAT_META: Record<Threat, { text: string; tone: 'red' | 'amber' | 'green' }> = {
  high: { text: '高', tone: 'red' },
  mid: { text: '中', tone: 'amber' },
  low: { text: '低', tone: 'green' },
}

/** 目标编号（契约 §2：任务内唯一 target_no） */
const targetNo = (t: Target) => `目标 ${String(t.target_no).padStart(3, '0')}`

/** 高价值目标：value_tag 为「高价值」或威胁等级为 high（契约 §7.5：高价值红标） */
const isHighValue = (t: Target) => t.value_tag === '高价值' || t.threat === 'high'

const fmt = (v: number, digits = 4) => (Number.isFinite(v) ? v.toFixed(digits) : '—')

// ---------------------------------------------------------------- 演示兜底台账
const AI_OF = (typeJudgement: string, behavior: string, threatLevel: Threat, activity: string, suggestion: string, strikeWindow: string, confidence: number) =>
  ({ typeJudgement, behavior, threatLevel, activity, suggestion, strikeWindow, confidence })

/** 场景一兜底：目标 001/002 高、003/004 中、005 低（契约 §7.5） */
const FALLBACK_S1: Target[] = [
  {
    id: 'demo-1-t1', mission_id: 'demo', target_no: 1, name: '机动指挥节点', type: '机动指挥节点',
    threat: 'high', confidence: 92, lng: 116.4021, lat: 39.9087, alt: 86, source: '光电',
    dynamic_state: '机动中', status: 'red', strike_priority: 1, value_tag: '高价值', upgraded: 0,
    ai: AI_OF('机动指挥节点', '短时停留后快速转移，伴随车辆活动', 'high', '机动中', '建议优先纳入打击序列', '16:10 - 16:18', 92),
  },
  {
    id: 'demo-1-t2', mission_id: 'demo', target_no: 2, name: '防空火力阵地', type: '防空火力阵地',
    threat: 'high', confidence: 88, lng: 116.4310, lat: 39.9162, alt: 112, source: '雷达',
    dynamic_state: '部署中', status: 'red', strike_priority: 2, value_tag: '高价值', upgraded: 0,
    ai: AI_OF('防空火力阵地', '阵位固定，雷达开机时段集中', 'high', '部署中', '建议多集群协同压制', '16:12 - 16:20', 88),
  },
  {
    id: 'demo-1-t3', mission_id: 'demo', target_no: 3, name: '通信保障节点', type: '通信保障节点',
    threat: 'mid', confidence: 84, lng: 116.3755, lat: 39.8894, alt: 64, source: '电子',
    dynamic_state: '活跃', status: 'yellow', strike_priority: 3, value_tag: '', upgraded: 0,
    ai: AI_OF('通信保障节点', '电磁信号持续活跃，具备指挥与通信双重功能', 'mid', '活跃', '建议交由集群重点监视', '16:20 - 16:30', 84),
  },
  {
    id: 'demo-1-t4', mission_id: 'demo', target_no: 4, name: '机动指挥节点', type: '机动指挥节点',
    threat: 'mid', confidence: 76, lng: 116.4188, lat: 39.8731, alt: 92, source: '光电',
    dynamic_state: '转移中', status: 'yellow', strike_priority: 4, value_tag: '', upgraded: 0,
    ai: AI_OF('机动指挥节点', '沿道路机动，速度中等', 'mid', '转移中', '持续跟踪确认意图', '16:24 - 16:36', 76),
  },
  {
    id: 'demo-1-t5', mission_id: 'demo', target_no: 5, name: '防空火力阵地', type: '防空火力阵地',
    threat: 'low', confidence: 68, lng: 116.4502, lat: 39.9308, alt: 128, source: '雷达',
    dynamic_state: '短暂停留', status: 'gray', strike_priority: 5, value_tag: '', upgraded: 0,
    ai: AI_OF('防空火力阵地', '活动特征弱，判定为预备阵位', 'low', '短暂停留', '保持监视即可', '—', 68),
  },
]

/** 场景二兜底：类型取自契约 §7.5（机动指挥节点 / 通信枢纽节点 / 防空火力单元） */
const FALLBACK_S2: Target[] = [
  {
    id: 'demo-2-t1', mission_id: 'demo', target_no: 1, name: '机动指挥节点', type: '机动指挥节点',
    threat: 'high', confidence: 93, lng: 121.4737, lat: 31.2304, alt: 42, source: '融合',
    dynamic_state: '机动中', status: 'red', strike_priority: 1, value_tag: '高价值', upgraded: 0,
    ai: AI_OF('机动指挥节点', '沿岸机动，指挥通信并发特征明显', 'high', '机动中', '建议纳入集群协同攻击序列', '16:10 - 16:18', 93),
  },
  {
    id: 'demo-2-t2', mission_id: 'demo', target_no: 2, name: '通信枢纽节点', type: '通信枢纽节点',
    threat: 'high', confidence: 90, lng: 121.5021, lat: 31.2418, alt: 36, source: '电子',
    dynamic_state: '活跃', status: 'red', strike_priority: 2, value_tag: '高价值', upgraded: 0,
    ai: AI_OF('通信枢纽节点', '多路信号汇聚，暴露窗口稳定', 'high', '活跃', '建议优先压制', '16:12 - 16:22', 90),
  },
  {
    id: 'demo-2-t3', mission_id: 'demo', target_no: 3, name: '防空火力单元', type: '防空火力单元',
    threat: 'mid', confidence: 85, lng: 121.4416, lat: 31.2011, alt: 58, source: '雷达',
    dynamic_state: '部署中', status: 'yellow', strike_priority: 3, value_tag: '', upgraded: 0,
    ai: AI_OF('防空火力单元', '阵位半固定，雷达扫描扇面可预测', 'mid', '部署中', '建议电子压制配合打击', '16:18 - 16:28', 85),
  },
  {
    id: 'demo-2-t4', mission_id: 'demo', target_no: 4, name: '机动指挥节点', type: '机动指挥节点',
    threat: 'mid', confidence: 79, lng: 121.5288, lat: 31.1902, alt: 44, source: '光电',
    dynamic_state: '转移中', status: 'yellow', strike_priority: 4, value_tag: '', upgraded: 0,
    ai: AI_OF('机动指挥节点', '沿滨海道路转移，速度较快', 'mid', '转移中', '持续跟踪并预测路径', '16:26 - 16:38', 79),
  },
  {
    id: 'demo-2-t5', mission_id: 'demo', target_no: 5, name: '通信枢纽节点', type: '通信枢纽节点',
    threat: 'low', confidence: 71, lng: 121.3902, lat: 31.2610, alt: 30, source: '融合',
    dynamic_state: '短暂停留', status: 'gray', strike_priority: 5, value_tag: '', upgraded: 0,
    ai: AI_OF('通信枢纽节点', '活动特征弱，疑为备用节点', 'low', '短暂停留', '保持监视即可', '—', 71),
  },
]

// ---------------------------------------------------------------- 组件
export const T4Panel: React.FC = () => {
  const s2 = useStore((s) => s.scenarioKey) === 'scenario-2'
  const targets = useStore((s) => s.targets)
  const selectedTargetId = useStore((s) => s.selectedTargetId)
  const trackPoints = useStore((s) => s.trackPoints)
  const selectTarget = useStore((s) => s.selectTarget)
  const targetAction = useStore((s) => s.targetAction)

  // 台账为空（后端未就绪 / 未进入 T4）时的演示兜底
  const list = targets.length > 0 ? targets : (s2 ? FALLBACK_S2 : FALLBACK_S1)

  // 未选中时默认落在当前列表首条，保证详情区与列表一致
  const current = list.find((t) => t.id === selectedTargetId) ?? list[0]

  return (
    <>
      {/* 左侧：目标列表 */}
      <FloatCard
        title="目标列表"
        icon="target"
        style={{ position: 'absolute', left: 12, top: 64, width: 380 }}
        maxHeight="calc(100% - 128px)"
        extra={<span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>共 {list.length} 个</span>}
      >
        {list.length === 0 ? (
          <Empty />
        ) : (
          list.map((t) => (
            <TargetRow
              key={t.id}
              t={t}
              selected={t.id === current?.id}
              onSelect={() => void selectTarget(t.id)}
            />
          ))
        )}
      </FloatCard>

      {/* 右侧：选中目标详情 + AI 分析（让出 300px 右侧栏） */}
      <FloatCard
        title="目标详情"
        icon="crosshair"
        style={{ position: 'absolute', right: 312, top: 64, width: 352 }}
        maxHeight="calc(100% - 128px)"
        extra={current && <Tag tone={THREAT_META[current.threat].tone}>威胁 {THREAT_META[current.threat].text}</Tag>}
      >
        {!current ? (
          <Empty />
        ) : (
          <>
            <div className="row" style={{ gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{targetNo(current)}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-1)' }}>{current.name}</span>
              {isHighValue(current) && <Tag tone="red">高价值</Tag>}
            </div>

            <Sub title="目标要素">
              <KV k="目标类型" v={current.type} />
              <KV k="来源标识" v={current.source} />
              <KV k="动态状态" v={current.dynamic_state} />
              <KV k="海拔" v={`${current.alt} m`} />
              <KV k="位置（经纬度）" v={`${fmt(current.lng)}, ${fmt(current.lat)}`} />
            </Sub>

            <Sub title="置信度">
              <div className="row">
                <span style={{ flex: 1 }}>
                  <Bar
                    value={current.confidence}
                    tone={current.confidence >= 85 ? 'green' : current.confidence >= 70 ? 'blue' : 'amber'}
                  />
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{current.confidence}%</span>
              </div>
            </Sub>

            <Sub title="AI 分析">
              {current.ai ? (
                <>
                  <KV k="类型判断" v={current.ai.typeJudgement} />
                  <KV k="行为特征" v={current.ai.behavior} />
                  <KV
                    k="威胁等级"
                    v={THREAT_META[current.ai.threatLevel].text}
                    vClass={THREAT_META[current.ai.threatLevel].tone === 'red' ? 'v-red' : THREAT_META[current.ai.threatLevel].tone === 'amber' ? 'v-amber' : 'v-green'}
                  />
                  <KV k="活动状态" v={current.ai.activity} />
                  <KV k="建议处置" v={current.ai.suggestion} />
                  <KV k="可打击窗口" v={current.ai.strikeWindow} />
                </>
              ) : (
                <Empty text="暂无 AI 分析结果" />
              )}
            </Sub>

            <Sub title="动作">
              <div className="row wrap" style={{ gap: 8 }}>
                {s2 ? (
                  <>
                    <Btn variant="danger" className="sm" onClick={() => void targetAction(current.id, 'strike')}>加入攻击序列</Btn>
                    <Btn className="sm" onClick={() => void targetAction(current.id, 'track')}>持续跟踪</Btn>
                  </>
                ) : (
                  <>
                    <Btn className="sm" onClick={() => void targetAction(current.id, 'upgrade')}>升级为打击目标</Btn>
                    <Btn className="sm" onClick={() => void targetAction(current.id, 'watch')}>交由集群重点监视</Btn>
                    <Btn className="sm" onClick={() => void targetAction(current.id, 'track')}>持续跟踪</Btn>
                  </>
                )}
              </div>
            </Sub>

            <TrackBlock s2={s2} count={trackPoints.length} />
          </>
        )}
      </FloatCard>

      {/* 底部动作条（让出 300px 右侧栏） */}
      <BottomBar>
        {s2 ? (
          <>
            <NextBtn variant="default">查看目标详情</NextBtn>
            <NextBtn>进入任务生成</NextBtn>
          </>
        ) : (
          <NextBtn>进入任务生成</NextBtn>
        )}
      </BottomBar>
    </>
  )
}

/** 单条目标行：点击调用 selectTarget(id)；高价值目标红色标记 */
const TargetRow: React.FC<{ t: Target; selected: boolean; onSelect: () => void }> = ({ t, selected, onSelect }) => {
  const high = isHighValue(t)
  const meta = THREAT_META[t.threat]
  return (
    <div
      onClick={onSelect}
      style={{
        cursor: 'pointer',
        padding: '7px 8px',
        marginBottom: 6,
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${selected ? 'var(--cyan)' : high ? 'rgba(239,68,68,.45)' : 'var(--panel-border)'}`,
        borderLeft: `3px solid ${high ? 'var(--red)' : 'transparent'}`,
        background: selected ? 'rgba(34,211,238,.1)' : 'rgba(12,22,40,.5)',
      }}
    >
      <div className="row" style={{ gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{targetNo(t)}</span>
        <span style={{ fontSize: 12.5, color: 'var(--text-1)' }}>{t.name}</span>
        {high && <Tag tone="red">高价值</Tag>}
        <span className="spacer" />
        <Tag tone={meta.tone}>威胁 {meta.text}</Tag>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 4, fontSize: 11.5, color: 'var(--text-2)' }}>
        <span>{t.type}</span>
        <span>·</span>
        <span>来源 {t.source}</span>
        <span>·</span>
        <span>{t.dynamic_state}</span>
      </div>
    </div>
  )
}

/** 场景二：轨迹回溯时间轴 + ◀◀ / ▶ / ▶▶ 播放控制（-02:00…+02:00，00:00 为「现在」） */
const TrackBlock: React.FC<{ s2: boolean; count: number }> = ({ s2, count }) => {
  // 本地游标（仅界面演示，不做真实播放）
  const [cursor, setCursor] = React.useState(2)
  const [playing, setPlaying] = React.useState(false)

  const nodes = React.useMemo(
    () => ['-02:00', '-01:00', '00:00', '+01:00', '+02:00'].map((label) => (label === '00:00' ? { label, sub: '现在' } : { label })),
    [],
  )

  if (!s2) return null

  return (
    <Sub title="轨迹回溯">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>游标 {nodes[cursor].label}</span>
        <span className="row" style={{ gap: 6 }}>
          <Btn className="sm" title="后退" onClick={() => setCursor((c) => Math.max(0, c - 1))}>◀◀</Btn>
          <Btn className="sm" title="播放" onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚' : '▶'}</Btn>
          <Btn className="sm" title="前进" onClick={() => setCursor((c) => Math.min(nodes.length - 1, c + 1))}>▶▶</Btn>
        </span>
      </div>
      <Timeline nodes={nodes} cursor={cursor} onCursor={setCursor} />
      <div className="row" style={{ gap: 6, fontSize: 11.5, color: 'var(--text-2)' }}>
        <Icon name="clock" size={13} />
        <span>轨迹点位 {count} 个</span>
        {playing && <Tag tone="cyan">回放中</Tag>}
      </div>
    </Sub>
  )
}
