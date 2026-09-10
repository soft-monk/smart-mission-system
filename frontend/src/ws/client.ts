// WebSocket 客户端封装 —— 契约 §4
// 单通道；心跳 15s；指数退避自动重连（TRD WEB-06 / MSG-04）；事件分发到订阅者。
import type { WsEnvelope } from '@/api/types'

type Handler = (env: WsEnvelope) => void

export type WsStatus = 'connecting' | 'open' | 'closed'

export class WsClient {
  private ws: WebSocket | null = null
  private handlers = new Set<Handler>()
  private statusHandlers = new Set<(s: WsStatus) => void>()
  private heartbeat: number | null = null
  private retry = 0
  private retryTimer: number | null = null
  private manualClose = false
  private url: string

  constructor(url?: string) {
    if (url) {
      this.url = url
    } else {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      this.url = `${proto}//${location.host}/ws`
    }
  }

  connect() {
    this.manualClose = false
    this.open()
  }

  private open() {
    this.emitStatus('connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch {
      this.scheduleRetry()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.retry = 0
      this.emitStatus('open')
      this.startHeartbeat()
    }

    ws.onmessage = (ev) => {
      try {
        const env = JSON.parse(ev.data as string) as WsEnvelope
        if (env.type === 'pong') return
        this.handlers.forEach((h) => {
          try {
            h(env)
          } catch (e) {
            // 单个订阅者异常不影响其他订阅者
            console.error('[ws] handler error', e)
          }
        })
      } catch {
        // 忽略非法消息
      }
    }

    ws.onclose = () => {
      this.stopHeartbeat()
      this.emitStatus('closed')
      if (!this.manualClose) this.scheduleRetry()
    }

    ws.onerror = () => {
      // onclose 会紧随其后，统一在那里重连
    }
  }

  private scheduleRetry() {
    if (this.manualClose) return
    this.retry += 1
    const delay = Math.min(15000, 500 * Math.pow(2, Math.min(this.retry, 5)))
    if (this.retryTimer) window.clearTimeout(this.retryTimer)
    this.retryTimer = window.setTimeout(() => this.open(), delay)
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeat = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 15000)
  }

  private stopHeartbeat() {
    if (this.heartbeat) {
      window.clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private emitStatus(s: WsStatus) {
    this.statusHandlers.forEach((h) => h(s))
  }

  on(handler: Handler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  onStatus(handler: (s: WsStatus) => void) {
    this.statusHandlers.add(handler)
    handler(this.ws?.readyState === WebSocket.OPEN ? 'open' : 'closed')
    return () => this.statusHandlers.delete(handler)
  }

  close() {
    this.manualClose = true
    this.stopHeartbeat()
    if (this.retryTimer) window.clearTimeout(this.retryTimer)
    this.ws?.close()
    this.ws = null
  }
}

export const ws = new WsClient()
