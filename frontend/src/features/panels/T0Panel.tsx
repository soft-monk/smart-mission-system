// T0Panel —— 任务加载与场景选择（契约 §7.3 T0 / §7.4 T0）
// 场景一 voiceMode=ball，语音由悬浮球承载；场景二 voiceMode=inline，语音卡由 AppShell 渲染。
import React, { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { Btn, Empty, Icon, KV, Tag } from '@/components/ui'
import { BottomBar, FloatCard, Sub, TopBanner } from './common'
import type { ScenarioKey } from '@/api/types'

export const T0Panel: React.FC = () => {
  const scenarios = useStore((s) => s.scenarios)
  const scenarioKey = useStore((s) => s.scenarioKey)
  const selectScenario = useStore((s) => s.selectScenario)
  const createMission = useStore((s) => s.createMission)
  const enterTask = useStore((s) => s.enterTask)
  const resources = useStore((s) => s.resources)
  const mission = useStore((s) => s.mission)
  const ask = useStore((s) => s.ask)
  const speak = useStore((s) => s.speak)
  const pushTimeline = useStore((s) => s.pushTimeline)
  const refreshResources = useStore((s) => s.refreshResources)
  const health = useStore((s) => s.health)

  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const current = scenarios.find((s) => s.key === scenarioKey)
  const s2 = scenarioKey === 'scenario-2'

  useEffect(() => {
    void refreshResources()
  }, [refreshResources])

  const onSelect = (key: ScenarioKey) => {
    selectScenario(key)
    setConfirming(false)
  }

  const onAskRecommend = async () => {
    const r = await ask(s2 ? '推荐任务模式' : '推荐一个任务模式')
    if (r) setConfirming(true)
  }

  const onEnter = async () => {
    setBusy(true)
    try {
      // 已有当前任务且场景一致时直接进入，否则创建
      if (!mission || mission.scenario_key !== scenarioKey) {
        await createMission(scenarioKey)
      }
      await enterTask()
    } finally {
      setBusy(false)
    }
  }

  const onReselect = () => {
    setConfirming(false)
    pushTimeline({ kind: 'tip', text: '已返回场景选择' })
  }

  return (
    <>
      {/* 顶部：态势来源信息 */}
      <FloatCard
        title={s2 ? '任务态势' : '任务态势'}
        icon="situation"
        style={{ position: 'absolute', left: 12, top: 64, width: 268 }}
      >
        <KV k="任务来源" v="上级指派" />
        <KV k="区域范围" v={current?.region ?? '—'} />
        {s2 ? (
          <>
            <KV k="云边端链路" v="已建立" vClass="v-green" />
            <KV k="自主执行基础" v="已就绪" vClass="v-green" />
          </>
        ) : (
          <>
            <KV k="前沿节点状态" v="已接入 / 正常" vClass="v-green" />
            <KV k="通信条件" v="固定通信受限" vClass="v-amber" />
          </>
        )}

        <Sub title="资源概况">
          {resources ? (
            <>
              <div className="grid-2" style={{ gap: 6 }}>
                {([
                  ['optical', '光电'], ['radar', '雷达'], ['electronic', '电子'], ['comm', '通信'],
                ] as const).map(([k, label]) => (
                  <div key={k} className="panel" style={{ padding: '6px 8px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cyan)' }}>
                      {resources.totals[k] ?? 0}
                    </div>
                  </div>
                ))}
              </div>
              <KV k="集群可用" v={`${resources.onlineRate}%`} vClass="v-green" />
              <KV k="在线率" v={`${resources.onlineRate}%`} vClass="v-green" />
            </>
          ) : (
            <Empty text="资源台账加载中" />
          )}
        </Sub>

        <Sub title="系统运行状态">
          {(health?.systemOverview ?? []).slice(0, 3).map((o) => (
            <KV key={o.key} k={o.name} v={o.text} vClass="v-green" />
          ))}
          {!health && <Empty text="健康状态未获取" />}
        </Sub>
      </FloatCard>

      {/* 顶部提示横幅（AI 主动播报摘要） */}
      {!confirming && (
        <TopBanner>
          {s2
            ? '已完成战场态势建模，当前区域具备多节点协同执行条件，云边端链路已建立，具备自主任务执行基础。'
            : '已完成战场态势建模，当前区域存在三类任务模式匹配结果。检测到固定通信受限、敌方纵深防御明显，建议构建前沿局部任务体系。'}
        </TopBanner>
      )}

      {/* 场景确认卡（点「推荐任务模式」后出现） */}
      {confirming && current && (
        <FloatCard
          title="任务目标说明卡"
          icon="target"
          style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            width: 460, zIndex: 12,
          }}
        >
          <div className="row" style={{ marginBottom: 8 }}>
            <b style={{ fontSize: 15 }}>{current.name}</b>
            <Tag tone="cyan">推荐模式</Tag>
            <span className="spacer" />
            <button className="btn ghost sm" onClick={() => setConfirming(false)}>
              <Icon name="close" size={13} />
            </button>
          </div>

          <Sub title="AI 分析">
            <KV k="敌情态势摘要" v={s2 ? '多节点协同条件具备，边缘融合已完成' : '敌方呈分散防御结构，通信节点暴露度较高'} />
            <KV k="推荐作战方式" v={current.name} vClass="v-cyan" />
            <KV
              k="前沿部署建议"
              v={s2 ? '优先采用侦察与打击联动编组，提高响应效率' : '先建立通信链路，随后展开光电侦察'}
            />
          </Sub>

          <Sub title="态势融合结果">
            <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.65 }}>
              {s2
                ? '多源侦察信息已完成边缘融合，区域态势清晰。前沿节点、无人集群与后方算力形成协同闭环。'
                : '多源侦察信息已完成边缘融合，区域态势清晰。建议构建前沿局部任务体系。'}
            </div>
          </Sub>
        </FloatCard>
      )}

      {/* 底部：场景入口卡 + 确认按钮 */}
      <BottomBar right={12}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', flex: 1 }}>
          {scenarios.map((sc) => {
            const active = sc.key === scenarioKey
            return (
              <button
                key={sc.key}
                onClick={() => onSelect(sc.key as ScenarioKey)}
                className="panel"
                style={{
                  flex: '1 1 180px', minWidth: 170, textAlign: 'left', cursor: 'pointer',
                  padding: '10px 12px', fontFamily: 'inherit',
                  borderColor: active ? 'var(--cyan)' : 'var(--panel-border)',
                  background: active ? 'linear-gradient(180deg,rgba(34,211,238,.16),rgba(34,211,238,.04))' : undefined,
                  color: 'var(--text-0)',
                }}
              >
                <div className="row">
                  <b style={{ fontSize: 13 }}>{sc.name}</b>
                  <span className="spacer" />
                  {sc.recommended === 1 && <Tag tone="cyan">推荐任务方向</Tag>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>{sc.subtitle}</div>
              </button>
            )
          })}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <Btn icon="mic" onClick={() => void onAskRecommend()}>推荐一个任务模式</Btn>
          {confirming ? (
            <>
              <Btn variant="primary" onClick={() => void onEnter()} disabled={busy}>
                {busy ? '进入中…' : '确认进入任务'}
              </Btn>
              <Btn onClick={onReselect}>重新选择</Btn>
            </>
          ) : (
            <Btn variant="primary" onClick={() => void onEnter()} disabled={busy}>
              {busy ? '进入中…' : '确认进入任务'}
            </Btn>
          )}
          <Btn
            icon="wave"
            onClick={() => {
              const text = s2
                ? '已完成战场态势建模，当前区域具备多节点协同执行条件，云边端链路已建立，具备自主任务执行基础。'
                : '已完成战场态势建模，当前区域存在三类任务模式匹配结果。检测到固定通信受限、敌方纵深防御明显，建议构建前沿局部任务体系。'
              pushTimeline({ kind: 'system', text })
              speak(text)
            }}
          >
            语音播报
          </Btn>
        </div>
      </BottomBar>
    </>
  )
}
