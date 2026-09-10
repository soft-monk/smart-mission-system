// T3Panel —— 阶段 T3（场景一「光电侦察展开」/ 场景二「多源侦察与态势构建」）
// 文案逐字依据：契约 §7.3 / §7.4 / §7.6；界面元素依据：需求初稿 §6-T3 / §8-T3。
// 说明：本面板渲染在地图浮层之上，所有绝对定位卡片均使用 common.tsx 的 FloatCard（自带 pointerEvents:auto）。
import React from 'react'
import { useStore } from '@/stores/useStore'
import { Bar, Btn, Dot, Icon, Tag } from '@/components/ui'
import { BottomBar, FloatCard, NextBtn, Sub, TopBanner } from '@/features/panels/common'
import type { LinkEdge } from '@/api/types'

// ---------------------------------------------------------------- 集群总体状态（场景一）
type SignalLevel = '强' | '中' | '弱'

interface ClusterRow {
  no: number
  name: string
  online: boolean
  signal: SignalLevel
  battery: number
}

/** 场景一 6 集群兜底台账（后端未就绪/未产生 groups 时的演示数据；颜色按需求初稿 §6-T3 的集群类型映射） */
const DEMO_CLUSTERS: ClusterRow[] = [
  { no: 1, name: '前出侦察集群', online: true, signal: '强', battery: 92 },
  { no: 2, name: '侧翼侦察集群', online: true, signal: '中', battery: 88 },
  { no: 3, name: '雷达探测集群', online: true, signal: '强', battery: 95 },
  { no: 4, name: '通信中继集群', online: true, signal: '强', battery: 90 },
  { no: 5, name: '电子压制集群', online: true, signal: '弱', battery: 76 },
  { no: 6, name: '机动预备集群', online: true, signal: '中', battery: 84 },
]

/** 集群类型 → 颜色（界面图口径：蓝=光电、黄=雷达、紫=电子、青=通信；集群 1/2 与 6 的差异用明度区分） */
const CLUSTER_COLORS: Record<number, string> = {
  1: '#3B82F6',
  2: '#22C55E',
  3: '#F59E0B',
  4: '#A855F7',
  5: '#22D3EE',
  6: '#FB923C',
}

const signalFromDbm = (dbm: number): SignalLevel => (dbm >= -70 ? '强' : dbm >= -85 ? '中' : '弱')
const signalTone = (s: SignalLevel) => (s === '强' ? 'v-green' : s === '中' ? 'v-amber' : 'v-red')

const fallbackSignal = (no: number): SignalLevel =>
  no === 5 ? '弱' : no === 2 || no === 6 ? '中' : '强'

/** 从链路质量边（契约 §4 telemetry.link.quality：signal 形如 "-67 dBm"）解析某集群的信号强度 */
function signalOfClusters(edges: LinkEdge[], name: string, no: number): SignalLevel {
  const hit = edges.find((e) => e.to_node === name || e.from_node === name)
  if (!hit) return fallbackSignal(no)
  const dbm = Number.parseInt(String(hit.signal ?? ''), 10)
  return Number.isFinite(dbm) ? signalFromDbm(dbm) : fallbackSignal(no)
}

/** 电量：优先取遥测（UavPosEvent.groupId 为集群名）；无遥测时用兜底台账 */
function batteryOfClusters(batteries: Record<string, number>, name: string, demo: number): number {
  const v = batteries[name]
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : demo
}

// ---------------------------------------------------------------- 场景二 T3 静态结构
/** 契约 §7.4 场景二 6 集群（与 store.groups 名称一致） */
const S2_CLUSTER_NAMES = [
  '前出侦察集群', '侧向感知集群', '雷达探测集群', '边缘协同处理集群', '电子对抗集群', '机动执行集群',
]

/** 实时图像流 3 路（需求初稿 §8-T3-2） */
const IMAGE_STREAMS = ['前出侦察集群', '侧向感知集群', '雷达探测集群']

/** 边缘融合结果 5 项（契约 §6：含「目标候选 n 处」） */
const FUSION_RESULTS = [
  '初步融合完成',
  '局部态势已形成',
  '疑似目标区已锁定',
  '数据进入边云同步阶段',
]

/** 链路状态四通道（需求初稿 §8-T3-2：均在线） */
const LINK_CHANNELS = ['光电', '雷达', '电子', '通信']

/** 场景一底部数据源栏 */
const DATA_SOURCES = ['光电', '雷达', '电子', '通用']

/** 契约 §7.6 场景二 T3 的 AI 提示（逐字） */
const S2_TIP = '边缘节点已完成第一轮态势融合，目标活动区域已完成初筛标记。'
const S2_TIP_TITLE = '多源信息已在边缘侧完成初步关联处理，并回传云端进行全局一致性校核。'

/** 契约 §7.6 场景一 T3 的系统语音（后端未推送 aiTips 时的演示兜底文案） */
const S1_TIP = '检测到异常电磁信号聚集区域，已标记为潜在目标区。疑似敌方通信保障节点或机动指挥活动区域。'

// ---------------------------------------------------------------- 组件
export const T3Panel: React.FC = () => {
  const s2 = useStore((s) => s.scenarioKey) === 'scenario-2'
  const groups = useStore((s) => s.groups)
  const linkEdges = useStore((s) => s.linkEdges)
  const uavPositions = useStore((s) => s.uavPositions)
  const aiTips = useStore((s) => s.aiTips)
  const gotoTargets = useStore((s) => s.gotoTargets)

  // 集群台账：后端有 groups 用后端，否则用兜底 6 集群
  const clusters: ClusterRow[] = React.useMemo(() => {
    const name = (g: { name: string }, i: number) => g.name || S2_CLUSTER_NAMES[i] || `集群 ${i + 1}`
    const batteryPerCluster: Record<string, number[]> = {}
    Object.values(uavPositions).forEach((p) => {
      if (typeof p?.battery !== 'number') return
      const key = p.groupId
      if (!key) return
      ;(batteryPerCluster[key] ??= []).push(p.battery)
    })
    const batteries: Record<string, number> = {}
    Object.entries(batteryPerCluster).forEach(([k, list]) => {
      batteries[k] = list.reduce((a, b) => a + b, 0) / list.length
    })

    if (groups.length > 0) {
      return groups.map((g, i) => {
        const n = name(g, i)
        return {
          no: i + 1,
          name: n,
          online: true,
          signal: signalOfClusters(linkEdges, n, i + 1),
          battery: batteryOfClusters(batteries, n, DEMO_CLUSTERS[i % DEMO_CLUSTERS.length].battery),
        }
      })
    }
    return DEMO_CLUSTERS.map((c) => ({
      ...c,
      signal: signalOfClusters(linkEdges, c.name, c.no),
      battery: batteryOfClusters(batteries, c.name, c.battery),
    }))
  }, [groups, linkEdges, uavPositions])

  const tip = aiTips.length > 0 ? aiTips[0] : undefined

  return (
    <>
      {s2
        ? <TopBanner icon="wave">{S2_TIP}</TopBanner>
        : (
          <TopBanner icon={tip && tip.level === 'critical' ? 'alert' : 'wave'}>
            {tip ? tip.text : S1_TIP}
          </TopBanner>
        )}

      {s2 ? (
        <>
          {/* 左侧：实时图像流 + 链路状态 */}
          <FloatCard title="实时图像流" icon="video" style={{ position: 'absolute', left: 12, top: 64, width: 336 }} maxHeight="calc(100% - 128px)">
            <div className="grid-3">
              {IMAGE_STREAMS.map((n) => (
                <StreamTile key={n} name={n} />
              ))}
            </div>
            <Sub title="链路状态">
              {LINK_CHANNELS.map((c) => (
                <div key={c} className="kv">
                  <span className="k">{c}</span>
                  <span className="v"><Dot tone="green" label="在线" /></span>
                </div>
              ))}
            </Sub>
          </FloatCard>

          {/* 右侧：边缘融合结果（让出 300px 右侧栏） */}
          <FloatCard title="边缘融合结果" icon="layers" style={{ position: 'absolute', right: 312, top: 64, width: 336 }} maxHeight="calc(100% - 128px)">
            {FUSION_RESULTS.map((t) => (
              <div key={t} className="row" style={{ padding: '5px 0', fontSize: 12.5 }}>
                <span className="v-green"><Icon name="check" size={14} /></span>
                <span>{t}</span>
                <span className="spacer" />
                <Tag tone="cyan">完成</Tag>
              </div>
            ))}
            <div
              className="row"
              style={{
                marginTop: 8, padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--panel-border-strong)', background: 'rgba(34,211,238,.08)',
              }}
            >
              <span style={{ color: 'var(--text-1)', fontSize: 12.5 }}>目标候选</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--cyan)' }}>3</span>
              <span style={{ color: 'var(--text-1)', fontSize: 12.5 }}>处</span>
              <span className="spacer" />
              <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>待进一步分析确认</span>
            </div>
            <S2TipCard />
          </FloatCard>

          <BottomBar>
            <NextBtn>进入态势融合</NextBtn>
            <Btn variant="ghost">查看侦查详情</Btn>
          </BottomBar>
        </>
      ) : (
        <>
          {/* 左侧：集群总体状态（类型仅以颜色区分，不写类型文字） */}
          <FloatCard title="集群总体状态" icon="radar" style={{ position: 'absolute', left: 12, top: 64, width: 320 }} maxHeight="calc(100% - 128px)">
            {clusters.map((c) => (
              <div key={`${c.no}-${c.name}`} style={{ padding: '6px 0', borderBottom: '1px dashed rgba(80,160,255,.14)' }}>
                <div className="row">
                  <span
                    style={{
                      width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
                      background: CLUSTER_COLORS[c.no] ?? 'var(--text-2)',
                      boxShadow: `0 0 7px ${CLUSTER_COLORS[c.no] ?? 'transparent'}`,
                    }}
                  />
                  <span style={{ fontSize: 12.5 }}>{c.no}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-0)' }}>{c.name}</span>
                  <span className="spacer" />
                  <Dot tone={c.online ? 'green' : 'gray'} label={c.online ? '在线' : '离线'} />
                </div>
                <div className="row" style={{ marginTop: 5, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-2)' }}>信号</span>
                  <span className={signalTone(c.signal)}>{c.signal}</span>
                  <span className="spacer" />
                  <span style={{ color: 'var(--text-2)' }}>电量</span>
                  <span style={{ width: 96 }}><Bar value={c.battery} tone={c.battery < 30 ? 'red' : c.battery < 60 ? 'amber' : 'green'} /></span>
                  <span style={{ width: 34, textAlign: 'right' }}>{c.battery}%</span>
                </div>
              </div>
            ))}

            <Sub title="数据源">
              <div className="row wrap" style={{ gap: 6 }}>
                {DATA_SOURCES.map((d, i) => (
                  <span key={d} className={`tag ${i === 0 ? 'cyan' : 'gray'}`}>{d}</span>
                ))}
              </div>
            </Sub>

            <div className="row" style={{ marginTop: 12 }}>
              <Btn className="sm" icon="eye">更多详情</Btn>
            </div>
          </FloatCard>

          {/* 场景一：底部推进按钮（需求初稿 T3-1 仅有【更多详情】，但流程需可前进） */}
          <BottomBar>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              侦察展开中 · 多源数据实时回传前沿指挥节点
            </span>
            <span className="spacer" />
            <Btn variant="ghost" onClick={() => void gotoTargets()}>刷新目标</Btn>
            <NextBtn>进入目标识别 »</NextBtn>
          </BottomBar>
        </>
      )}
    </>
  )
}

/** 单路实时图像流缩略图占位（右上角绿点「在线」） */
const StreamTile: React.FC<{ name: string }> = ({ name }) => (
  <div>
    <div
      style={{
        position: 'relative', aspectRatio: '4 / 3', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--panel-border)', background: 'rgba(8,18,34,.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)',
        overflow: 'hidden',
      }}
    >
      <Icon name="video" size={20} />
      <span
        style={{
          position: 'absolute', top: 3, right: 3, display: 'inline-flex', alignItems: 'center',
          gap: 3, fontSize: 9.5, color: 'var(--green)', background: 'rgba(5,12,24,.72)',
          padding: '0 4px', borderRadius: 4,
        }}
      >
        <span className="dot green" style={{ width: 5, height: 5, marginRight: 0 }} />在线
      </span>
    </div>
    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-1)', textAlign: 'center', lineHeight: 1.3 }}>{name}</div>
  </div>
)

/** 场景二 T3 的系统语音横条（契约 §7.6 逐字） */
const S2TipCard: React.FC = () => (
  <div
    style={{
      marginTop: 10, padding: '8px 10px', borderRadius: 'var(--radius-sm)',
      border: '1px dashed var(--panel-border)', background: 'rgba(34,211,238,.06)',
      fontSize: 11.5, color: '#cdf3ff', lineHeight: 1.5,
    }}
  >
    <Icon name="mic" size={13} />
    <span style={{ marginLeft: 6 }}>{S2_TIP_TITLE}</span>
  </div>
)
