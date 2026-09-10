// REST 客户端 —— 契约 §2（统一响应体）与 §3（端点清单）
import type {
  ApiEnvelope, Assessment, ChatRequest, ChatResponse, ExecutionStatus, Group, HealthData,
  LinkCurves, LinkMetrics, LinkTopology, MapConfigData, Mission, Plan, ReportRow, Scenario,
  Target, TargetTrackPoint, UavResources, VideoChannel,
} from './types'

const BASE = '/api/v1'

export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(BASE + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch (e) {
    throw new ApiError(-1, `网络不可达：${(e as Error).message}`)
  }

  const text = await resp.text()
  let env: ApiEnvelope<T> | null = null
  try {
    env = text ? (JSON.parse(text) as ApiEnvelope<T>) : null
  } catch {
    throw new ApiError(resp.status, `响应不是 JSON（HTTP ${resp.status}）`)
  }
  if (!env) throw new ApiError(resp.status, `空响应（HTTP ${resp.status}）`)
  if (env.code !== 0) throw new ApiError(env.code, env.message || `错误码 ${env.code}`)
  return env.data
}

const get = <T>(p: string) => request<T>(p)
const post = <T>(p: string, body?: unknown) =>
  request<T>(p, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
const put = <T>(p: string, body?: unknown) =>
  request<T>(p, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) })

const mid = (missionId?: string) => (missionId ? `?missionId=${encodeURIComponent(missionId)}` : '')

export const api = {
  // §3.1
  health: () => get<HealthData>('/health'),
  mapConfig: () => get<MapConfigData>('/map/config'),

  // §3.2
  scenarios: () => get<Scenario[]>('/scenarios'),
  recommendScenario: (body: ChatRequest) => post<ChatResponse>('/scenarios/recommend', body),
  createMission: (scenarioKey: string) => post<Mission>('/missions', { scenarioKey }),
  currentMission: () => get<Mission>('/missions/current'),
  mission: (id: string) => get<Mission>(`/missions/${id}`),
  setPhase: (id: string, phase: string) => put<{ missionId: string; phase: string; progress: number; phaseTitle: string }>(`/missions/${id}/phase`, { phase }),
  resetMission: (id: string) => post<Mission>(`/missions/${id}/reset`),

  // §3.3
  uavs: (missionId?: string) => get<UavResources>(`/resources/uavs${mid(missionId)}`),
  groups: (missionId?: string) => get<Group[]>(`/groups${mid(missionId)}`),
  generateGroups: (missionId: string) => post<Plan[]>('/groups/generate', { missionId }),
  plans: (missionId: string, side?: 'group' | 'strike') =>
    get<Plan[]>(`/plans?missionId=${encodeURIComponent(missionId)}${side ? `&side=${side}` : ''}`),
  adoptPlan: (id: string) => post<Plan>(`/plans/${id}/adopt`),
  optimizePlan: (id: string) => post<Plan>(`/plans/${id}/optimize`),
  confirmPlan: (id: string) => post<Plan>(`/plans/${id}/confirm`),

  // §3.4
  linkTopology: (missionId?: string) => get<LinkTopology>(`/links/topology${mid(missionId)}`),
  linkMetrics: (missionId?: string) => get<LinkMetrics>(`/links/metrics${mid(missionId)}`),
  optimizeLink: (missionId: string) => post<LinkMetrics>('/links/optimize', { missionId }),
  linkCurves: (missionId?: string) => get<LinkCurves>(`/links/curves${mid(missionId)}`),

  // §3.5
  targets: (missionId?: string) => get<Target[]>(`/targets${mid(missionId)}`),
  target: (id: string) => get<Target>(`/targets/${id}`),
  targetTrack: (id: string) => get<TargetTrackPoint[]>(`/targets/${id}/track`),
  trackTarget: (id: string) => post<Target>(`/targets/${id}/track`),
  strikeTarget: (id: string) => post<Target>(`/targets/${id}/strike`),
  upgradeTarget: (id: string) => post<Target>(`/targets/${id}/upgrade`),
  watchTarget: (id: string) => post<Target>(`/targets/${id}/watch`),

  // §3.6
  executionStatus: (missionId?: string) => get<ExecutionStatus>(`/execution/status${mid(missionId)}`),
  guide: (missionId: string) => post<{ text: string }>('/execution/guide', { missionId }),
  replan: (missionId: string) => post<{ text: string }>('/execution/replan', { missionId }),

  // §3.7
  assessment: (missionId?: string) => get<Assessment>(`/assessments${mid(missionId)}`),
  reports: (missionId?: string) => get<ReportRow[]>(`/reports${mid(missionId)}`),
  createReport: (missionId: string) => post<ReportRow>('/reports', { missionId }),

  // §3.8
  chat: (body: ChatRequest) => post<ChatResponse>('/ai/chat', body),
  aiHealth: () => get<Record<string, unknown>>('/ai/health'),

  // §3.9
  videos: () => get<VideoChannel[]>('/media/videos'),
}
