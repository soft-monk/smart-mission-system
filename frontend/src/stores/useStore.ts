// 全局状态（Zustand）—— 业务状态与流程逻辑前置到前端（TRD D13）
// 单一目标台账（TR-TGT-01）：所有界面从 targetStore 渲染，不各自维护副本。
import { create } from 'zustand'
import { api } from '@/api/client'
import { MAP_OPTIONS, preloadWorldTiles } from '@map2d'
import type {
  AiEvent, AlertEvent, Assessment, ChatResponse, ExecutionStatus, Group, HealthData, LinkCurves,
  LinkEdge, LinkMetrics, LinkQualityEvent, LinkTopology, MapConfigData, Mission, Phase, Plan,
  ReportRow, Scenario, ScenarioKey, Target, TargetTrackPoint, UavPosEvent, UavResources,
  VideoChannel, VoiceStateName, WsEnvelope,
} from '@/api/types'

export type ViewMode = 'boot' | 'selfcheck' | 'flow'
export type LeftNavKey = 'situation' | 'mission' | 'target' | 'area' | 'resource' | 'alert' | 'setting'

export interface TimelineEntry {
  id: string
  kind: 'system' | 'user' | 'reply' | 'tip'
  text: string
  at: string
  provider?: string
}

interface State {
  // 视图与框架
  view: ViewMode
  leftNav: LeftNavKey
  wsStatus: 'connecting' | 'open' | 'closed'
  bootProgress: number
  bootModules: { key: string; name: string; percent: number }[]
  bootOverview: { key: string; name: string; text: string }[]
  bootFooter: string
  /** 启动页"全球低精度底图预热"进度（驱动进度条） */
  tileProgress: { done: number; total: number }
  selfCheckRunning: boolean
  selfCheckDone: boolean
  selfCheckItems: { key: string; name: string; sub: string; status: string }[]
  health?: HealthData

  // 任务域
  scenarioKey: ScenarioKey
  mission?: Mission
  phase: Phase
  phaseTitle: string
  progress: number
  scenarios: Scenario[]
  groupPlans: Plan[]
  strikePlans: Plan[]
  groups: Group[]
  resources?: UavResources
  linkTopology?: LinkTopology
  linkMetrics?: LinkMetrics
  linkEdges: LinkEdge[]
  linkCurves?: LinkCurves
  /** 单一目标台账 */
  targets: Target[]
  targetsByNo: Record<number, Target>
  selectedTargetId?: string
  trackPoints: TargetTrackPoint[]
  execution?: ExecutionStatus
  assessment?: Assessment
  reports: ReportRow[]
  videos: VideoChannel[]
  mapConfig?: MapConfigData

  // 遥测
  uavPositions: Record<string, UavPosEvent>

  // 语音与 AI 对话
  voiceState: VoiceStateName
  timeline: TimelineEntry[]
  speakingText?: string
  aiTips: AiEvent[]
  alerts: AlertEvent[]

  // ---- actions ----
  setView: (v: ViewMode) => void
  setLeftNav: (k: LeftNavKey) => void
  setWsStatus: (s: 'connecting' | 'open' | 'closed') => void

  loadBoot: () => Promise<void>
  runSelfCheck: () => Promise<void>

  bootstrap: () => Promise<void>
  selectScenario: (key: ScenarioKey) => void
  createMission: (key: ScenarioKey) => Promise<void>
  enterTask: () => Promise<void>
  gotoTargets: () => Promise<void>
  setPhase: (p: Phase) => Promise<void>
  nextPhase: () => Promise<void>
  prevPhase: () => Promise<void>

  refreshPlans: () => Promise<void>
  refreshGroups: () => Promise<void>
  refreshResources: () => Promise<void>
  refreshLinks: () => Promise<void>
  refreshTargets: () => Promise<void>
  refreshExecution: () => Promise<void>
  refreshAssessment: () => Promise<void>
  refreshReports: () => Promise<void>
  refreshVideos: () => Promise<void>

  selectTarget: (id: string) => Promise<void>
  adoptPlan: (id: string) => Promise<void>
  optimizePlan: (id: string) => Promise<void>
  confirmPlan: (id: string) => Promise<void>
  optimizeLink: () => Promise<void>
  targetAction: (id: string, action: 'track' | 'strike' | 'upgrade' | 'watch') => Promise<void>
  guide: () => Promise<void>
  replan: () => Promise<void>
  generateReport: () => Promise<ReportRow | undefined>

  ask: (prompt: string) => Promise<ChatResponse | undefined>
  pushTimeline: (e: Omit<TimelineEntry, 'id' | 'at'>) => void
  speak: (text: string) => void
  setVoiceState: (s: VoiceStateName) => void

  applyWs: (env: WsEnvelope) => void
}

const PHASE_ORDER: Phase[] = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

// 阶段语义按场景不同（TRD 1.2.1）——仅作离线兜底，权威值来自后端
const PHASE_TITLES: Record<ScenarioKey, Record<Phase, string>> = {
  'scenario-1': {
    T0: '任务加载与场景选择', T1: '无人机分组与任务编组', T2: '通信链路建立',
    T3: '光电侦察展开', T4: '目标识别与筛选', T5: '任务决策与打击准备',
    T6: '协同执行与引导', T7: '毁伤评估与任务结束',
  },
  'scenario-2': {
    T0: '任务加载与场景选择', T1: '无人机分组与任务编组', T2: '云边通信与协同链路建立',
    T3: '多源侦察与态势构建', T4: '目标识别、评估与任务生成', T5: '任务决策与打击准备',
    T6: '协同执行与引导', T7: '评估与任务结束',
  },
}

const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
let seq = 0
const uid = () => `tl-${Date.now()}-${seq++}`

export const useStore = create<State>((set, get) => ({
  view: 'boot',
  leftNav: 'situation',
  wsStatus: 'connecting',
  bootProgress: 0,
  bootModules: [
    { key: 'map', name: '地图引擎', percent: 0 },
    { key: 'link', name: '通信链路', percent: 0 },
    { key: 'ai', name: 'AI引擎', percent: 0 },
    { key: 'cluster', name: '集群管理', percent: 0 },
    { key: 'data', name: '数据服务', percent: 0 },
  ],
  bootOverview: [
    { key: 'network', name: '网络连接', text: '在线' },
    { key: 'datalink', name: '数据链路', text: '稳定' },
    { key: 'gps', name: 'GPS 定位', text: '正常' },
    { key: 'security', name: '系统安全', text: '安全' },
  ],
  bootFooter: '系统启动中，正在初始化核心模块…',
  tileProgress: { done: 0, total: 0 },
  selfCheckRunning: false,
  selfCheckDone: false,
  selfCheckItems: [],

  scenarioKey: 'scenario-1',
  phase: 'T0',
  phaseTitle: PHASE_TITLES['scenario-1'].T0,
  progress: 0,
  scenarios: [],
  groupPlans: [],
  strikePlans: [],
  groups: [],
  linkEdges: [],
  targets: [],
  targetsByNo: {},
  trackPoints: [],
  reports: [],
  videos: [],
  uavPositions: {},
  voiceState: 'idle',
  timeline: [],
  aiTips: [],
  alerts: [],

  // ---------------------------------------------------------------- 框架
  setView: (v) => set({ view: v }),
  setLeftNav: (k) => set({ leftNav: k }),
  setWsStatus: (s) => set({ wsStatus: s }),

  // ---------------------------------------------------------------- 启动
  async loadBoot() {
    // 启动进度条＝真实任务进度，不再是固定时长的假循环：
    //   0–5%    探测后端健康
    //   5–95%   预热全球低精度底图（z0–5，1365 张；逐张完成推进）
    //   95–100% 装载场景与地图配置，随后交接给"系统状态自检"
    //
    // 注意：局域网里 1365 张只需不到 1 s，若直接照实跳，进度条会"5% → 95%"一帧到位。
    // 因此进度按 ≤1%/25ms 的速度**平滑逼近**真实完成量（不会超前于真实进度，
    // 也就不会出现"条走完了还在等"）。预热很慢时，它自动退化为实时跟随。
    const preloadMax = MAP_OPTIONS.preloadMaxZoom
    let barTimer = 0
    const stopBar = () => { if (barTimer) { window.clearInterval(barTimer); barTimer = 0 } }
    const startBar = (getTarget: () => number) => {
      stopBar()
      barTimer = window.setInterval(() => {
        const cur = get().bootProgress
        const target = getTarget()
        if (cur >= target) return
        // 整数百分比，步长上限 1 → 5%→95% 最快约 2.2 s；实际进度慢时自动跟随
        set({ bootProgress: Math.min(Math.round(target), cur + 1) })
      }, 25)
    }

    // 1) 后端健康：同时把 5 个模块卡片的初始百分比对齐真实指标
    set({ bootFooter: '正在连接服务端，检查核心模块…' })
    try {
      const h = await api.health()
      set({
        health: h,
        bootOverview: h.systemOverview.map((o) => ({ key: o.key, name: o.name, text: o.text })),
        bootModules: get().bootModules.map((m, i) => {
          const found = h.modules.find((x) => x.key === m.key)
          const fallback = Math.round((100 * (i + 1)) / get().bootModules.length)
          return { ...m, percent: found ? found.metric : fallback }
        }),
      })
    } catch (e) {
      // 后端不可达也要能进（与自检界面的降级策略一致）：此时预热必然失败，跳过即可
      set({ bootFooter: `服务端未就绪：${(e as Error).message}` })
    }
    set({ bootProgress: 5 })

    // 2) 全球低精度"地板层"预热：把整层 z0–4 装进浏览器缓存，
    //    这样缩小后任意拖拽都有内容垫底，不再出现未加载方块。
    //    它只影响"有没有低清内容"，不影响高清瓦片的按需加载与图层显隐。
    if (preloadMax > 0) {
      try {
        const cfg = await api.mapConfig()
        const template = cfg?.basemap?.tileUrlTemplate ?? ''
        if (template) {
          set({ bootFooter: '正在预热全球低精度底图…' })
          let target = 5
          startBar(() => target)
          const r = await preloadWorldTiles({
            template,
            maxZoom: preloadMax,
            concurrency: MAP_OPTIONS.preloadConcurrency,
            onProgress: (p) => {
              set({ tileProgress: { done: p.done, total: p.total } })
              target = 5 + 90 * p.ratio
            },
          })
          stopBar()
          // 把预热结果挂到 <html> 上：既方便现场排查，也让外部脚本/用户一眼看到实际耗时
          document.documentElement.dataset.tilePreload =
            `ok=${r.ok}/${r.total} failed=${r.failed} ms=${r.ms} aborted=${r.aborted}`
          set({
            tileProgress: { done: r.ok, total: r.total },
            bootProgress: 95,
            bootFooter: r.failed > 0
              ? `底图预热完成（${r.ok}/${r.total}，${r.failed} 张未取到，${r.ms} ms），继续启动…`
              : `底图预热完成（${r.ok} 张 / ${r.ms} ms），继续启动…`,
          })
        }
      } catch {
        // 预热失败不阻断启动：地图本身会按需加载，只是少了"地板层"兜底
        stopBar()
        set({ bootProgress: 95, bootFooter: '底图预热跳过，继续启动…' })
      }
    }

    // 3) 交给自检界面（其内部会做 bootstrap 装载场景与地图配置）
    stopBar()
    set({ bootProgress: 100, bootFooter: '核心模块已就绪，正在进入系统状态确认…' })
    await get().runSelfCheck()
  },

  async runSelfCheck() {
    set({ view: 'selfcheck', selfCheckRunning: true, selfCheckDone: false })
    try {
      const h = await api.health()
      set({
        health: h,
        selfCheckItems: h.selfCheck,
        bootModules: get().bootModules.map((m) => {
          const found = h.modules.find((x) => x.key === m.key)
          return found ? { ...m, percent: found.metric } : m
        }),
        bootOverview: h.systemOverview.map((o) => ({ key: o.key, name: o.name, text: o.text })),
      })
    } catch (e) {
      // 后端不可达时仍允许进入（演示友好），但明确提示
      set({
        selfCheckItems: [
          { key: 'comm', name: '通信链路检测', sub: '后端不可达', status: 'abnormal' },
        ],
        bootFooter: `服务端未就绪：${(e as Error).message}`,
      })
    } finally {
      set({ selfCheckRunning: false, selfCheckDone: true })
    }
  },

  async bootstrap() {
    try {
      const [scenarios, mapConfig, mission] = await Promise.all([
        api.scenarios(),
        api.mapConfig(),
        api.currentMission().catch(() => undefined),
      ])
      set({ scenarios, mapConfig, videos: mapConfig.video ?? [] })
      if (mission && mission.id) {
        set({
          mission,
          scenarioKey: (mission.scenario_key as ScenarioKey) ?? 'scenario-1',
          phase: mission.phase,
          phaseTitle: mission.phaseTitle ?? PHASE_TITLES[(mission.scenario_key as ScenarioKey) ?? 'scenario-1'][mission.phase],
          progress: mission.progress,
        })
        await Promise.all([
          get().refreshResources(),
          get().refreshLinks(),
          get().refreshPlans(),
          get().refreshGroups(),
          get().refreshTargets(),
        ])
      }
    } catch (e) {
      console.error('[store] bootstrap failed', e)
    }
  },

  selectScenario: (key) => {
    set({ scenarioKey: key, phaseTitle: PHASE_TITLES[key][get().phase] })
  },

  async createMission(key) {
    const m = await api.createMission(key)
    set({
      mission: m,
      scenarioKey: key,
      phase: m.phase,
      phaseTitle: m.phaseTitle ?? PHASE_TITLES[key][m.phase],
      progress: 0,
      targets: [],
      targetsByNo: {},
      selectedTargetId: undefined,
      trackPoints: [],
      timeline: [],
      aiTips: [],
    })
    await Promise.all([
      get().refreshResources(),
      get().refreshPlans(),
      get().refreshGroups(),
      get().refreshTargets(),
      get().refreshLinks(),
    ])
  },

  // T0「确认进入任务」→ 进入 T1
  async enterTask() {
    const m = get().mission
    if (!m) return
    await get().setPhase('T1')
    await get().refreshPlans()
    await get().refreshGroups()
  },

  // T3 之后才有目标
  async gotoTargets() {
    await get().refreshTargets()
  },

  async setPhase(p) {
    const m = get().mission
    if (!m) return
    try {
      const r = await api.setPhase(m.id, p)
      set({
        phase: p,
        phaseTitle: r.phaseTitle ?? PHASE_TITLES[get().scenarioKey][p],
        progress: r.progress,
        mission: { ...m, phase: p, progress: r.progress },
      })
    } catch (e) {
      console.error('[store] setPhase failed', e)
    }
  },

  async nextPhase() {
    const i = PHASE_ORDER.indexOf(get().phase)
    if (i < 0 || i >= PHASE_ORDER.length - 1) return
    const p = PHASE_ORDER[i + 1]
    await get().setPhase(p)
    // 各阶段预取所需数据
    if (p === 'T1') { await get().refreshPlans(); await get().refreshGroups() }
    if (p === 'T2') await get().refreshLinks()
    if (p === 'T3') await get().refreshLinks()
    if (p === 'T4') await get().refreshTargets()
    if (p === 'T5') { await get().refreshPlans(); await get().refreshTargets() }
    if (p === 'T6') { await get().refreshExecution(); await get().refreshTargets() }
    if (p === 'T7') { await get().refreshAssessment(); await get().refreshReports() }
  },

  async prevPhase() {
    const i = PHASE_ORDER.indexOf(get().phase)
    if (i <= 0) return
    await get().setPhase(PHASE_ORDER[i - 1])
  },

  // ---------------------------------------------------------------- 数据刷新
  async refreshPlans() {
    const m = get().mission
    if (!m) return
    const [g, s] = await Promise.all([api.plans(m.id, 'group'), api.plans(m.id, 'strike')])
    set({ groupPlans: g, strikePlans: s })
  },

  async refreshGroups() {
    const m = get().mission
    if (!m) return
    set({ groups: await api.groups(m.id) })
  },

  async refreshResources() {
    const m = get().mission
    set({ resources: await api.uavs(m?.id) })
  },

  async refreshLinks() {
    const m = get().mission
    const [topo, metrics] = await Promise.all([api.linkTopology(m?.id), api.linkMetrics(m?.id)])
    set({ linkTopology: topo, linkMetrics: metrics, linkEdges: topo.edges })
  },

  async refreshTargets() {
    const m = get().mission
    if (!m) return
    const list = await api.targets(m.id)
    const byNo: Record<number, Target> = {}
    list.forEach((t) => { byNo[t.target_no] = t })
    set({ targets: list, targetsByNo: byNo })
  },

  async refreshExecution() {
    const m = get().mission
    set({ execution: await api.executionStatus(m?.id) })
  },

  async refreshAssessment() {
    const m = get().mission
    set({ assessment: await api.assessment(m?.id) })
  },

  async refreshReports() {
    const m = get().mission
    set({ reports: await api.reports(m?.id) })
  },

  async refreshVideos() {
    try {
      set({ videos: await api.videos() })
    } catch {
      /* 视频不可用不影响主流程 */
    }
  },

  // ---------------------------------------------------------------- 动作
  async selectTarget(id) {
    set({ selectedTargetId: id })
    try {
      const [detail, track] = await Promise.all([api.target(id), api.targetTrack(id)])
      const list = get().targets.map((t) => (t.id === id ? { ...t, ...detail } : t))
      const byNo = { ...get().targetsByNo }
      byNo[detail.target_no] = detail
      set({ targets: list, targetsByNo: byNo, trackPoints: track })
    } catch (e) {
      console.error('[store] selectTarget failed', e)
    }
  },

  // 以下动作均「不抛异常」：失败只记时间线提示。
  // 原因：面板的推进按钮是「确认 → 下一阶段」串联，若确认抛异常会连带中断 nextPhase，
  // 表现为「按钮点了没反应、流程卡死」。流程推进的可靠性优先于错误抛出的严格性。
  async adoptPlan(id) {
    try {
      await api.adoptPlan(id)
    } catch (e) {
      get().pushTimeline({ kind: 'tip', text: `采用方案未生效：${(e as Error).message}` })
    }
    await get().refreshPlans()
    await get().refreshGroups()
  },

  async optimizePlan(id) {
    try {
      await api.optimizePlan(id)
    } catch (e) {
      get().pushTimeline({ kind: 'tip', text: `自动优化失败：${(e as Error).message}` })
    }
    await get().refreshPlans()
  },

  async confirmPlan(id) {
    try {
      await api.confirmPlan(id)
    } catch (e) {
      get().pushTimeline({ kind: 'tip', text: `确认方案失败：${(e as Error).message}` })
    }
    await get().refreshPlans()
  },

  async optimizeLink() {
    const m = get().mission
    if (!m) return
    await api.optimizeLink(m.id)
    const [metrics, curves, topo] = await Promise.all([
      api.linkMetrics(m.id), api.linkCurves(m.id), api.linkTopology(m.id),
    ])
    set({ linkMetrics: metrics, linkCurves: curves, linkTopology: topo, linkEdges: topo.edges })
  },

  async targetAction(id, action) {
    const fn = { track: api.trackTarget, strike: api.strikeTarget, upgrade: api.upgradeTarget, watch: api.watchTarget }[action]
    try {
      await fn(id)
      if (action !== 'track') await get().refreshTargets()
    } catch (e) {
      get().pushTimeline({ kind: 'tip', text: (e as Error).message })
    }
  },

  async guide() {
    const m = get().mission
    if (!m) return
    const r = await api.guide(m.id)
    get().pushTimeline({ kind: 'tip', text: r.text })
    await get().refreshExecution()
  },

  async replan() {
    const m = get().mission
    if (!m) return
    const r = await api.replan(m.id)
    get().pushTimeline({ kind: 'tip', text: r.text })
    await get().refreshExecution()
  },

  async generateReport() {
    const m = get().mission
    if (!m) return undefined
    try {
      const r = await api.createReport(m.id)
      await get().refreshReports()
      await get().refreshAssessment()
      get().pushTimeline({ kind: 'tip', text: `任务报告已生成：${r.report_no}` })
      return r
    } catch (e) {
      get().pushTimeline({ kind: 'tip', text: (e as Error).message })
      return undefined
    }
  },

  // ---------------------------------------------------------------- 语音/AI
  async ask(prompt) {
    const m = get().mission
    get().pushTimeline({ kind: 'user', text: prompt })
    try {
      const r = await api.chat({ missionId: m?.id, scene: get().scenarioKey, prompt })
      get().pushTimeline({ kind: 'reply', text: r.text, provider: r.provider })
      get().speak(r.text)
      return r
    } catch (e) {
      get().pushTimeline({ kind: 'tip', text: `AI 不可用：${(e as Error).message}` })
      return undefined
    }
  },

  pushTimeline(e) {
    const entry: TimelineEntry = { ...e, id: uid(), at: now() }
    set({ timeline: [...get().timeline, entry].slice(-60) })
  },

  speak(text) {
    set({ speakingText: text, voiceState: 'speaking' })
    // 优先使用 /api/v1/ai/tts 合成；失败或无音频能力时退化为静默展示（不影响界面）
    fetch('/api/v1/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`tts ${resp.status}`)
        const buf = await resp.arrayBuffer()
        if (buf.byteLength < 64) throw new Error('empty audio')
        const blob = new Blob([buf], { type: resp.headers.get('Content-Type') ?? 'audio/wav' })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.onended = () => {
          URL.revokeObjectURL(url)
          set({ voiceState: 'idle' })
        }
        await audio.play()
      })
      .catch(() => {
        // 无 TTS 能力：仅显示文本 2.4 秒
        window.setTimeout(() => set({ voiceState: 'idle' }), 2400)
      })
  },

  setVoiceState: (s) => set({ voiceState: s }),

  // ---------------------------------------------------------------- WS
  applyWs(env) {
    const s = get()
    switch (env.type) {
      case 'telemetry.uav.pos': {
        const p = env.data as UavPosEvent
        set({ uavPositions: { ...s.uavPositions, [p.uavId || (p as unknown as { groupId: string }).groupId]: p } })
        break
      }
      case 'telemetry.link.quality': {
        // 事件负载用驼峰字段（契约 §4），台账用下划线列名（契约 §5），此处做一次性归一
        const q = env.data as Partial<LinkQualityEvent> & { linkId?: string }
        const targetId = q.linkId
        const edges = s.linkEdges.map((e) =>
          e.id === targetId
            ? {
                ...e,
                state: q.state ?? e.state,
                signal: q.signal ?? e.signal,
                bandwidth_mbps: q.bandwidthMbps ?? e.bandwidth_mbps,
                latency_ms: q.latencyMs ?? e.latency_ms,
                loss_rate: q.lossRate ?? e.loss_rate,
                coverage_km2: q.coverageKm2 ?? e.coverage_km2,
                mesh_progress: q.meshProgress ?? e.mesh_progress,
              }
            : e,
        )
        set({ linkEdges: edges })
        break
      }
      case 'mission.phase': {
        const d = env.data as { phase: Phase; progress: number; phaseTitle?: string; scenarioKey?: ScenarioKey }
        set({
          phase: d.phase,
          progress: d.progress ?? s.progress,
          phaseTitle: d.phaseTitle ?? PHASE_TITLES[(d.scenarioKey ?? s.scenarioKey) as ScenarioKey]?.[d.phase] ?? s.phaseTitle,
        })
        break
      }
      case 'mission.progress': {
        const d = env.data as { progress: number }
        set({ progress: d.progress })
        break
      }
      case 'target.state': {
        void get().refreshTargets()
        break
      }
      case 'resource.uav.state': {
        void get().refreshResources()
        break
      }
      case 'ai.recommendation': {
        const d = env.data as { text: string }
        get().pushTimeline({ kind: 'reply', text: d.text })
        break
      }
      case 'ai.event': {
        const e = env.data as AiEvent
        set({ aiTips: [{ ...e }, ...s.aiTips].slice(0, 8) })
        get().pushTimeline({ kind: 'tip', text: `${e.title}：${e.text}` })
        if (e.speak) get().speak(e.text)
        break
      }
      case 'voice.state': {
        const v = env.data as { state: VoiceStateName; text?: string }
        set({ voiceState: v.state })
        break
      }
      case 'alert': {
        const a = env.data as AlertEvent
        set({ alerts: [{ ...a }, ...s.alerts].slice(0, 20) })
        break
      }
      default:
        break
    }
  },
}))

export { PHASE_ORDER, PHASE_TITLES }

// 调试/自动化钩子：便于用浏览器控制台或 CDP 驱动流程，也便于现场排障
declare global {
  interface Window {
    __MAPAPP__?: {
      get: () => ReturnType<typeof useStore.getState>
      setPhase: (p: Phase) => Promise<void>
      nextPhase: () => Promise<void>
      prevPhase: () => Promise<void>
      state: () => Record<string, unknown>
    }
  }
}

if (typeof window !== 'undefined') {
  window.__MAPAPP__ = {
    get: () => useStore.getState(),
    setPhase: (p) => useStore.getState().setPhase(p),
    nextPhase: () => useStore.getState().nextPhase(),
    prevPhase: () => useStore.getState().prevPhase(),
    state: () => {
      const s = useStore.getState()
      return {
        phase: s.phase,
        phaseTitle: s.phaseTitle,
        progress: s.progress,
        scenarioKey: s.scenarioKey,
        wsStatus: s.wsStatus,
        missionId: s.mission?.id ?? null,
        targets: s.targets.length,
        groupPlans: s.groupPlans.length,
        strikePlans: s.strikePlans.length,
        timeline: s.timeline.length,
      }
    },
  }
}
