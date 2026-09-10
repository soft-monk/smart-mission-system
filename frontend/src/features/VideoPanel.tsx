// VideoPanel —— 本地视频播放浮层（契约 §3.9 / TRD VID-01..03）
// 无视频素材时自动隐藏入口，不影响主流程。
import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { api } from '@/api/client'
import { Empty, Icon, Tag } from '@/components/ui'

export const VideoPanel: React.FC = () => {
  const phase = useStore((s) => s.phase)
  const [open, setOpen] = useState(false)
  const [channels, setChannels] = useState<{ name: string; url: string }[]>([])
  const [current, setCurrent] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // T3 起（侦察/识别/执行/评估）才需要看图像流
  const available = phase === 'T3' || phase === 'T4' || phase === 'T5' || phase === 'T6'

  useEffect(() => {
    if (!available) return
    let cancelled = false
    void api.videos().then((list) => {
      if (!cancelled) setChannels(list)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [available])

  if (!available || channels.length === 0) return null

  const ch = channels[Math.min(current, channels.length - 1)]

  return (
    <>
      <button
        className="panel"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'fixed', left: 92, bottom: 52, padding: '8px 12px', zIndex: 60,
          display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12,
          color: open ? 'var(--cyan)' : 'var(--text-1)', fontFamily: 'inherit',
          borderColor: open ? 'var(--cyan)' : 'var(--panel-border)',
        }}
        title="视频通道"
      >
        <Icon name="video" size={15} /> 图像流
        <Tag tone="green">{channels.length}</Tag>
      </button>

      {open && (
        <section className="panel fade-in" style={{
          position: 'fixed', left: 92, bottom: 96, width: 380, zIndex: 62, padding: 10,
        }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <Icon name="video" className="v-cyan" />
            <b style={{ fontSize: 12.5 }}>{ch?.name ?? '视频通道'}</b>
            <span className="spacer" />
            <button className="btn ghost sm" onClick={() => setOpen(false)}><Icon name="close" size={13} /></button>
          </div>

          {ch ? (
            <video
              ref={videoRef}
              src={ch.url}
              controls
              playsInline
              style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: 240 }}
            />
          ) : (
            <Empty text="无视频素材" />
          )}

          {channels.length > 1 && (
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              {channels.map((c, i) => (
                <button
                  key={c.url}
                  className={`btn sm ${i === current ? 'primary' : ''}`}
                  onClick={() => setCurrent(i)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}
