// Voice —— 语音交互两种形态（契约 §7.2/§7.6）
//  ball  : 右下角麦克风悬浮球（场景一）
//  inline: 页面内语音卡 / 对话行（场景二）
// 交互逻辑与呈现解耦：同一 store + voice.state，形态由场景配置决定（ODD 2.3 决策）。
import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '@/stores/useStore'
import type { Phase, ScenarioKey } from '@/api/types'
import { Icon } from '@/components/ui'

/** 各阶段推荐话术（逐字取自契约 §7.6）；T0 为「系统提示 — 用户指令 — 系统回复」三段式 */
export const PHASE_SCRIPTS: Record<ScenarioKey, Partial<Record<Phase, { system: string; user: string; reply: string }>>> = {
  'scenario-1': {
    T0: {
      system: '已完成战场态势建模，当前区域存在三类任务模式匹配结果。检测到固定通信受限、敌方纵深防御明显，建议构建前沿局部任务体系。',
      user: '推荐一个任务模式',
      reply: '当前态势下，敌方呈分散防御结构，通信节点暴露度较高，且前沿区域通信链路不稳定，建议优先选择【敏捷拒止布控】模式。',
    },
    T2: {
      system: '通信链路已完成自组网，当前链路质量达到任务标准。前沿节点已具备独立通信与感知支撑能力。',
      user: '链路是否支持多集群协同？',
      reply: '当前链路支持三集群并行数据回传与协同控制，通信延迟满足实时控制要求。在固定通信受限条件下，可支撑前沿节点自主运行。',
    },
    T3: {
      system: '检测到异常电磁信号聚集区域，已标记为潜在目标区。疑似敌方通信保障节点或机动指挥活动区域。',
      user: '目标区是否已标记？',
      reply: '已标记潜在目标区并同步显示光电图像、雷达回波和电子信号来源标识。',
    },
    T4: {
      system: '已识别三处高置信目标，其中一处为指挥通信节点。系统已完成多源目标关联与威胁初评。',
      user: '哪个目标优先级最高？',
      reply: '目标003为高价值节点，具备指挥与通信双重功能，建议优先纳入打击序列。该目标对敌方区域协同和防御组织具有关键支撑作用。',
    },
    T5: {
      system: '基于目标价值、暴露时间窗口与链路稳定性，已生成三种打击方案。系统可同步生成目标信息包并推送至后方远程火力与空中支援力量。',
      user: '选择最优方案',
      reply: '已为你选择方案二：多集群协同压制，该方案在当前环境下综合成功率最高。建议由无人集群持续跟踪目标，并为远程火力提供实时修正信息。',
    },
    T6: {
      system: '目标区域出现移动迹象，建议调整光电集群观察角度。雷达与电子侦察数据正在持续校正目标位置。',
      user: '保持跟踪',
      reply: '已保持跟踪并持续修正轨迹，命中概率持续上升。',
    },
    T7: {
      system: '任务完成，目标打击成功率92%，主要威胁节点已清除，建议保持区域持续监视。前沿节点可执行资源撤收、链路释放并转入下一部署地域。',
      user: '导出任务报告',
      reply: '任务报告已生成，可随时导出。',
    },
  },
  'scenario-2': {
    T0: {
      system: '已完成战场态势建模，当前区域具备多节点协同执行条件，云边端链路已建立，具备自主任务执行基础。',
      user: '推荐任务模式',
      reply: '当前任务环境下，多源信息已在边缘节点完成融合处理，后方算力可实时参与决策优化，建议采用【集群协同攻击】模式，实现云边端一体化自主执行。',
    },
    T2: {
      system: '当前系统支持云端全局优化 + 边缘实时决策 + 前端自主执行协同模式。',
      user: '是否具备断链自主运行能力？',
      reply: '边缘节点已具备局部闭环运行能力，在通信波动条件下可维持任务连续执行。',
    },
    T3: {
      system: '边缘节点已完成第一轮态势融合，目标活动区域已完成初筛标记。',
      user: '融合结果如何？',
      reply: '多源信息已在边缘侧完成初步关联处理，并回传云端进行全局一致性校核。',
    },
    T4: {
      system: '云端模型完成二次融合校核，生成高置信目标集合。',
      user: '优先处理哪个目标？',
      reply: '目标003为关键协同节点，具备通信与指挥双重功能，建议优先纳入集群协同攻击序列。',
    },
    T5: {
      system: '基于云边端协同分析结果，系统已生成多种任务执行方案，可由边缘节点自主执行并实时回传云端优化结果。',
      user: '选择最优方案',
      reply: '已选择方案二：集群协同攻击。该方案支持边缘自主决策与动态优化，适配高动态目标环境。',
    },
    T6: {
      system: '边缘节点已完成目标重识别，局部自主决策已生成，云端正在进行全局一致性校核。',
      user: '确认执行同步',
      reply: '已确认执行同步，云端策略与边缘决策保持一致。',
    },
    T7: {
      system: '集群协同攻击闭环已完成，系统已生成任务报告。',
      user: '导出报告',
      reply: '报告已生成，可随时导出。',
    },
  },
}

/** 浏览器语音识别（可用时）；不可用则退化为文本输入 */
function useSpeechInput() {
  const recognition = useRef<{ start: () => void; stop: () => void } | null>(null)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const W = window as unknown as {
      SpeechRecognition?: new () => unknown
      webkitSpeechRecognition?: new () => unknown
    }
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition
    if (!Ctor) {
      setAvailable(false)
      return
    }
    setAvailable(true)
    try {
      const rec = new Ctor() as {
        lang: string; interimResults: boolean; continuous: boolean
        onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null
        onend: (() => void) | null
        start: () => void; stop: () => void
      }
      rec.lang = 'zh-CN'
      rec.interimResults = false
      rec.continuous = false
      recognition.current = rec
    } catch {
      setAvailable(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const listen = (onText: (t: string) => void, onEnd?: () => void) => {
    const rec = recognition.current as unknown as {
      onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null
      onend: (() => void) | null
      start: () => void
    } | null
    if (!rec) return false
    rec.onresult = (e) => {
      const t = e.results?.[0]?.[0]?.transcript
      if (t) onText(t)
    }
    rec.onend = () => onEnd?.()
    try {
      rec.start()
      return true
    } catch {
      return false
    }
  }

  return { available, listen }
}

/** 场景一：右下角语音悬浮球 */
export const VoiceBall: React.FC = () => {
  const phase = useStore((s) => s.phase)
  const scenarioKey = useStore((s) => s.scenarioKey)
  const voiceState = useStore((s) => s.voiceState)
  const speakingText = useStore((s) => s.speakingText)
  const ask = useStore((s) => s.ask)
  const speak = useStore((s) => s.speak)
  const pushTimeline = useStore((s) => s.pushTimeline)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const { available, listen } = useSpeechInput()

  const script = PHASE_SCRIPTS[scenarioKey][phase]
  const busy = voiceState !== 'idle'

  const doSpeak = () => {
    if (!script) return
    pushTimeline({ kind: 'system', text: script.system })
    speak(script.system)
    setOpen(true)
  }

  const doAsk = async (text: string) => {
    if (!text.trim()) return
    await ask(text.trim())
    setInput('')
  }

  const doListen = () => {
    if (!available) {
      // 无语音识别能力（HTTP 非 secure context）：退化为快捷指令
      if (script) void doAsk(script.user)
      return
    }
    const ok = listen(
      (t) => void doAsk(t),
      () => useStore.getState().setVoiceState('idle'),
    )
    if (ok) useStore.getState().setVoiceState('listening')
    else if (script) void doAsk(script.user)
  }

  return (
    <>
      {open && (
        <div className="panel fade-in" style={{
          position: 'fixed', right: 22, bottom: 148, width: 330, zIndex: 70, padding: 12,
        }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <Icon name="mic" className="v-cyan" />
            <b style={{ fontSize: 13 }}>语音交互</b>
            <span className="spacer" />
            <button className="btn ghost sm" onClick={() => setOpen(false)}><Icon name="close" size={13} /></button>
          </div>

          {script && (
            <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.65, marginBottom: 8 }}>
              <div className="subhead" style={{ margin: '4px 0' }}>系统说</div>
              {script.system}
              <div className="subhead" style={{ margin: '8px 0 4px' }}>用户说</div>
              <span className="v-cyan">“{script.user}”</span>
            </div>
          )}

          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void doAsk(input) }}
              placeholder="输入指令或点麦克风"
              style={{
                flex: 1, background: 'rgba(8,16,30,.9)', border: '1px solid var(--panel-border)',
                borderRadius: 6, color: 'var(--text-0)', padding: '7px 9px', fontSize: 12.5, fontFamily: 'inherit',
              }}
            />
            <button className="btn sm" onClick={() => void doAsk(input)}>发送</button>
          </div>

          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button className="btn sm" onClick={doSpeak} disabled={!script}>播报</button>
            {script && <button className="btn sm" onClick={doListen} disabled={busy}>{available ? '按住说话' : '快捷提问'}</button>}
            <span className="spacer" />
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{voiceState}</span>
          </div>
        </div>
      )}

      {speakingText && (
        <div className="panel" style={{
          position: 'fixed', right: 96, bottom: 40, maxWidth: 360, zIndex: 65, padding: '8px 12px',
          fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5,
        }}>
          <Icon name="wave" className="v-cyan" /> {speakingText}
        </div>
      )}

      <button
        onClick={() => { setOpen((v) => !v); if (!open) doSpeak() }}
        title="语音交互"
        style={{
          position: 'fixed', right: 24, bottom: 52, width: 58, height: 58, borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 35%, rgba(34,211,238,.4), rgba(12,30,56,.95))',
          border: `2px solid ${busy ? 'var(--cyan)' : 'var(--panel-border-strong)'}`,
          color: '#d9fbff', cursor: 'pointer', zIndex: 68,
          boxShadow: busy ? '0 0 22px rgba(34,211,238,.55)' : '0 0 14px rgba(34,211,238,.25)',
        }}
        className={busy ? 'pulse' : ''}
      >
        <Icon name="mic" size={24} />
      </button>
    </>
  )
}

/** 场景二：页面内语音卡（浮在地图左下，与地图浮层共存） */
export const VoiceInlinePanel: React.FC = () => {
  const phase = useStore((s) => s.phase)
  const scenarioKey = useStore((s) => s.scenarioKey)
  const timeline = useStore((s) => s.timeline)
  const ask = useStore((s) => s.ask)
  const speak = useStore((s) => s.speak)
  const pushTimeline = useStore((s) => s.pushTimeline)
  const voiceState = useStore((s) => s.voiceState)
  const [input, setInput] = useState('')
  const { available, listen } = useSpeechInput()

  const script = PHASE_SCRIPTS[scenarioKey][phase]
  const recent = timeline.slice(-3)

  const doAsk = async (text: string) => {
    if (!text.trim()) return
    await ask(text.trim())
    setInput('')
  }

  const doListen = () => {
    if (!available) {
      if (script) void doAsk(script.user)
      return
    }
    const ok = listen((t) => void doAsk(t), () => useStore.getState().setVoiceState('idle'))
    if (ok) useStore.getState().setVoiceState('listening')
    else if (script) void doAsk(script.user)
  }

  return (
    <section className="panel" style={{
      position: 'absolute', left: 12, bottom: 12, width: 340, zIndex: 9, maxHeight: '46%', display: 'flex', flexDirection: 'column',
    }}>
      <header className="panel-title">
        <Icon name="mic" /><span>AI 语音交互</span>
        <span className="spacer" />
        <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{voiceState}</span>
      </header>
      <div className="panel-body" style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recent.length === 0 && script && (
          <>
            <Line kind="system" text={script.system} />
            <Line kind="user" text={script.user} />
          </>
        )}
        {recent.map((t) => (
          <Line
            key={t.id}
            kind={t.kind === 'user' ? 'user' : t.kind === 'reply' ? 'reply' : 'system'}
            text={t.text}
          />
        ))}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="row" style={{ gap: 6 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void doAsk(input) }}
            placeholder="输入指令"
            style={{
              flex: 1, background: 'rgba(8,16,30,.9)', border: '1px solid var(--panel-border)',
              borderRadius: 6, color: 'var(--text-0)', padding: '7px 9px', fontSize: 12.5, fontFamily: 'inherit',
            }}
          />
          <button className="btn sm" onClick={() => void doAsk(input)}>发送</button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {script && (
            <>
              <button className="btn sm" onClick={() => { pushTimeline({ kind: 'system', text: script.system }); speak(script.system) }}>
                播报
              </button>
              <button className="btn sm" onClick={doListen}>{available ? '语音提问' : '快捷提问'}</button>
            </>
          )}
          <span className="spacer" />
          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
            <Icon name="wave" /> 三段式
          </span>
        </div>
      </div>
    </section>
  )
}

const Line: React.FC<{ kind: 'system' | 'user' | 'reply'; text: string }> = ({ kind, text }) => {
  const meta = {
    system: { label: '系统说', color: 'var(--cyan)', icon: 'wave' },
    user: { label: '用户说', color: 'var(--blue)', icon: 'mic' },
    reply: { label: '系统回复', color: 'var(--green)', icon: 'check' },
  }[kind]
  return (
    <div style={{ fontSize: 12.2, lineHeight: 1.6 }}>
      <div style={{ color: meta.color, fontSize: 11, marginBottom: 2 }}>
        <Icon name={meta.icon} size={12} /> {meta.label}
      </div>
      <div style={{ color: kind === 'user' ? 'var(--text-0)' : 'var(--text-1)' }}>
        {kind === 'user' ? `“${text}”` : text}
      </div>
    </div>
  )
}
