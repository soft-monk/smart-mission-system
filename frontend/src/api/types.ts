// 共享类型 —— 与《开发接口契约规格书》§3/§4/§5 一一对应
// 后端（C++）、AI 桥（Python）、前端（TS）三方以此为准。

export type Phase = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7'
export type ScenarioKey = 'scenario-1' | 'scenario-2'
export type Threat = 'high' | 'mid' | 'low'
export type LinkState = 'green' | 'yellow' | 'red'
export type UavType = 'optical' | 'radar' | 'electronic' | 'comm'
export type VoiceMode = 'ball' | 'inline'

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

export interface ModuleStatus {
  key: string
  name: string
  status: 'ok' | 'fail'
  detail: string
  metric: number
}

export interface SelfCheckItem {
  key: string
  name: string
  sub: string
  status: 'normal' | 'abnormal'
}

export interface SystemOverviewItem {
  key: string
  name: string
  status: string
  text: string
}

export interface HealthData {
  status: string
  checkedAt: string
  modules: ModuleStatus[]
  selfCheck: SelfCheckItem[]
  systemOverview: SystemOverviewItem[]
  wsClients?: number
}

export interface MapConfigData {
  center: [number, number]
  zoom: number
  minZoom: number
  maxZoom: number
  basemap: { tileUrlTemplate: string; attribution: string; fallback?: string }
  video?: VideoChannel[]
}

export interface Scenario {
  key: ScenarioKey
  name: string
  subtitle: string
  features: string
  region: string
  task_region: string
  task_type: string
  voice_mode: VoiceMode
  recommended: number
  sort: number
}

export interface Mission {
  id: string
  scenario_key: ScenarioKey
  task_no: string
  task_name: string
  task_type: string
  task_region: string
  source: string
  phase: Phase
  status: string
  progress: number
  received_at: string
  started_at?: string
  finished_at?: string
  duration_sec?: number
  scenario?: Scenario
  phaseTitle?: string
}

export interface UavResourceRow {
  mission_id: string
  type: UavType
  total: number
  available: number
  allocated: number
  pending: number
  ability_tags: string
  online_rate: number
}

export interface UavResources {
  items: UavResourceRow[]
  totals: Record<string, number>
  available: Record<string, number>
  allocated: Record<string, number>
  pending: Record<string, number>
  allocatedTotal: number
  totalAll: number
  pendingTotal: number
  onlineRate: number
}

export interface Group {
  id: string
  mission_id: string
  plan_id: string
  seq: number
  name: string
  optical: number
  radar: number
  electronic: number
  comm: number
  task_dir: string
  cover_area: string
  task_attr: string
  coop_rel: string
  readiness: number
  lng?: number
  lat?: number
}

export interface Plan {
  id: string
  mission_id: string
  side: 'group' | 'strike'
  seq: number
  name: string
  subtitle?: string
  method?: string
  groups?: string // JSON 字符串
  success_rate?: number
  effect?: string
  stars?: number
  recommended: number
  reason?: string
  advantage?: string
  note?: string
  adopted: number
  confirmed: number
}

export interface LinkEdge {
  id: string
  mission_id: string
  from_node: string
  to_node: string
  signal: string
  bandwidth_mbps: number
  latency_ms: number
  loss_rate: number
  coverage_km2: number
  mesh_progress: number
  state: LinkState
}

export interface LinkTopology {
  nodes: { id: string; name: string; kind: 'cloud' | 'edge' | 'forward' | 'group' }[]
  edges: LinkEdge[]
}

export interface LinkMetrics {
  missionId: string
  signal: string
  signalDbm: number
  bandwidthMbps: number
  latencyMs: number
  lossRate: number
  coverageKm2: number
  meshProgress: number
  edges: LinkEdge[]
}

export interface CurvePoint { ts: number; value: number }
export interface LinkCurves { bandwidth: CurvePoint[]; latency: CurvePoint[] }

export interface TargetAi {
  typeJudgement: string
  behavior: string
  threatLevel: Threat
  activity: string
  suggestion: string
  strikeWindow: string
  confidence: number
}

export interface Target {
  id: string
  mission_id: string
  target_no: number
  name: string
  type: string
  threat: Threat
  confidence: number
  lng: number
  lat: number
  alt: number
  source: string
  dynamic_state: string
  status: 'red' | 'yellow' | 'gray'
  strike_priority: number
  value_tag: string
  upgraded: number
  ai?: TargetAi
}

export interface TargetTrackPoint {
  id?: number
  target_id?: string
  ts: number
  lng: number
  lat: number
  speed: number
  heading: number
}

export interface ExecutionStatus {
  trackingStability: number
  hitProbability: number
  hitProbabilityTrend: string
  deviationM: number
  positionCorrecting: boolean
  coopLink: Record<string, string>
  sync: Record<string, string>
  attackTiming: { adjusting: boolean; label: string; slots: string[] }
  taskProgress: number
}

export interface Assessment {
  mission_id: string
  total_damage_rate: number
  destroyed: number
  severe: number
  damaged: number
  intact: number
  area_control: number
  effect_metrics?: string
  targetResults?: { target_id: string; result: string; target_no: number; name: string; type: string }[]
  metrics?: MissionMetrics
}

export interface MissionMetrics {
  mission_id: string
  coverage_rate: number
  targets_found: number
  coop_efficiency: number
  link_stability: number
  mesh_duration_sec: number
  alert_count: number
  resource_used?: string
  survival_rate: number
}

export interface ReportRow {
  id: string
  mission_id: string
  report_no: string
  path: string
  created_at: string
}

export interface VideoChannel { name: string; url: string }

// ---------------------------------------------------------------- WS 事件
export interface WsEnvelope<T = unknown> {
  type: string
  data: T
  ts: number
}

export interface UavPosEvent {
  kind?: string
  uavId: string
  type: UavType
  groupId: string
  lng: number
  lat: number
  alt: number
  heading: number
  speed: number
  battery: number
  ts: number
}

export interface LinkQualityEvent {
  missionId?: string
  linkId: string
  from: string
  to: string
  signal: string
  bandwidthMbps: number
  latencyMs: number
  lossRate: number
  coverageKm2: number
  meshProgress: number
  state: LinkState
  ts?: number
}

export interface MissionPhaseEvent {
  missionId: string
  phase: Phase
  scenarioKey: ScenarioKey
  prevPhase?: Phase
  progress: number
  phaseTitle?: string
}

export interface MissionProgressEvent {
  missionId: string
  progress: number
  phase: Phase
  label?: string
  done?: number
  total?: number
}

export interface PlanStateEvent {
  missionId: string
  side: 'group' | 'strike'
  planId?: string
  action: 'generated' | 'recommended' | 'adopted' | 'optimized' | 'confirmed'
  recommendedId?: string
}

export interface ResourceUavStateEvent {
  missionId: string
  totals: Record<string, number>
  available: Record<string, number>
  allocated: Record<string, number>
  pending: Record<string, number>
  onlineRate: number
}

export interface AiRecommendationEvent {
  scene: ScenarioKey
  planId?: string
  text: string
  provider: 'llm' | 'rule'
  recommendedId?: string
}

export interface AiEvent {
  level: 'info' | 'warn' | 'critical'
  title: string
  text: string
  speak?: boolean
  highlight?: { type: string; lng: number; lat: number }
}

export type VoiceStateName = 'idle' | 'speaking' | 'listening' | 'recognizing' | 'acting'
export interface VoiceStateEvent { state: VoiceStateName; text?: string }

export interface AlertEvent { level: string; code?: string; title: string; text: string }
export interface NodeStateEvent { nodeId: string; name: string; online: boolean; lastSeen?: string }

// ---------------------------------------------------------------- AI 桥
export interface ChatRequest {
  missionId?: string
  scene: ScenarioKey
  prompt: string
  context?: Record<string, unknown>
}
export interface ChatPlanDraft {
  name: string
  method?: string
  groups?: string[]
  successRate?: number
  effect?: string
  reason?: string
  recommended?: boolean
}
export interface ChatResponse {
  text: string
  plan?: ChatPlanDraft
  provider: 'llm' | 'rule'
}
