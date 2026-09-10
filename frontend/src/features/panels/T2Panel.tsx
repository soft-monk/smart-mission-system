// T2Panel —— 通信链路建立 / 云边通信与协同链路建立（契约 §7.3 T2 / §7.4 T2）
import React, { useEffect, useState } from 'react'
import { useStore } from '@/stores/useStore'
import { Bar, Btn, Dot, Empty, Icon, KV, LineChart, Ring, Tag } from '@/components/ui'
import { BottomBar, FloatCard, Sub, TopBanner } from './common'

export const T2Panel: React.FC = () => {
  const s2 = useStore((s) => s.scenarioKey) === 'scenario-2'
  const metrics = useStore((s) => s.linkMetrics)
  const edges = useStore((s) => s.linkEdges)
  const topology = useStore((s) => s.linkTopology)
  const curves = useStore((s) => s.linkCurves)
  const refreshLinks = useStore((s) => s.refreshLinks)
  const optimizeLink = useStore((s) => s.optimizeLink)
  const nextPhase = useStore((s) => s.nextPhase)
  const pushTimeline = useStore((s) => s.pushTimeline)
  const speak = useStore((s) => s.speak)

  const [optimized, setOptimized] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void refreshLinks()
  }, [refreshLinks])

  const greenCount = edges.filter((e) => e.state === 'green').length
  const yellowCount = edges.filter((e) => e.state === 'yellow').length
  const redCount = edges.filter((e) => e.state === 'red').length

  const onOptimize = async () => {
    setBusy(true)
    try {
      await optimizeLink()
      setOptimized(true)
      pushTimeline({ kind: 'tip', text: '链路已自动优化：带宽提升、时延降低、组网进度提升' })
    } finally {
      setBusy(false)
    }
  }

  const onSpeakDone = () => {
    const text = s2
      ? '当前系统支持云端全局优化 + 边缘实时决策 + 前端自主执行协同模式。'
      : '通信链路已完成自组网，当前链路质量达到任务标准。前沿节点已具备独立通信与感知支撑能力。'
    pushTimeline({ kind: 'system', text })
    speak(text)
  }

  const onNext = () => {
    if (s2 && !optimized) {
      // 场景二：先优化再进入下一步
      pushTimeline({ kind: 'tip', text: '建议先执行链路优化' })
    }
    void nextPhase()
  }

  return (
    <>
      {/* 右上方提示：当前网络稳定 */}
      <TopBanner tone={optimized ? 'cyan' : 'amber'}>
        {optimized ? '当前网络稳定 · 前沿局部网络已建立' : '链路优化中 · 局部组网进度 ' + (metrics?.meshProgress ?? 78) + '%'}
      </TopBanner>

      {/* 左：链路质量指标 */}
      <FloatCard
        title={s2 ? '链路质量指标' : '链路质量指标'}
        icon="antenna"
        style={{ position: 'absolute', left: 12, top: 64, width: 262 }}
        maxHeight={370}
      >
        {metrics ? (
          <>
            <KV k="信号强度" v={`${metrics.signalDbm} dBm`} />
            <KV k="带宽" v={`${metrics.bandwidthMbps} Mbps`} vClass="v-cyan" />
            <KV k="时延" v={`${metrics.latencyMs} ms`} vClass="v-cyan" />
            <KV k="丢包率" v={`${metrics.lossRate}%`} />
            <KV k="覆盖范围" v={`${metrics.coverageKm2} km²`} />
            <div style={{ marginTop: 8 }}>
              <div className="row" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                <span>{s2 ? '局部组网进度' : '局部组网进度'}</span>
                <span className="spacer" />
                <b className="v-green">{metrics.meshProgress}%</b>
              </div>
              <Bar value={metrics.meshProgress} tone="green" />
            </div>

            <Sub title="链路状态分布">
              <div className="row" style={{ gap: 12, fontSize: 11.5 }}>
                <Dot tone="green" label={`已连接 ${greenCount}`} />
                <Dot tone="amber" label={`弱链路 ${yellowCount}`} />
                <Dot tone="red" label={`受限 ${redCount}`} />
              </div>
            </Sub>

            {s2 && (
              <Sub title="边缘节点负载">
                <KV k="边缘节点负载" v="68%" vClass="v-cyan" />
                <KV k="数据回传延迟" v="48 ms" />
                <KV k="本地缓存状态" v="76%" />
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>可用 3.2 TB / 4.0 TB</div>
              </Sub>
            )}
          </>
        ) : (
          <Empty text="链路指标加载中" />
        )}
      </FloatCard>

      {/* 中下：拓扑图例 + 曲线 */}
      <FloatCard
        title="链路稳定评估"
        icon="wave"
        style={{ position: 'absolute', left: 288, bottom: 92, width: 360, pointerEvents: 'auto' }}
      >
        {curves ? (
          <>
            <Sub title="带宽提升曲线">
              <LineChart
                series={[{ name: 'Mbps', color: '#22d3ee', points: curves.bandwidth.map((p) => p.value) }]}
                height={72}
              />
            </Sub>
            <Sub title="时延降低曲线">
              <LineChart
                series={[{ name: 'ms', color: '#3b82f6', points: curves.latency.map((p) => p.value) }]}
                height={72}
              />
            </Sub>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
              点击【{s2 ? '链路优化' : '自动优化链路'}】查看带宽提升与时延降低曲线
            </div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div className="panel" style={{ padding: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>链路稳定度</div>
                <b className="v-green" style={{ fontSize: 16 }}>{optimized ? 98 : 93}%</b>
              </div>
              <div className="panel" style={{ padding: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>覆盖率</div>
                <b className="v-green" style={{ fontSize: 16 }}>{optimized ? 96 : 92}%</b>
              </div>
              <div className="panel" style={{ padding: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>协同效率</div>
                <b className="v-cyan" style={{ fontSize: 16 }}>{optimized ? 95 : 91}%</b>
              </div>
              <div className="panel" style={{ padding: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>抗干扰能力</div>
                <b className="v-cyan" style={{ fontSize: 16 }}>{optimized ? 94 : 88}%</b>
              </div>
            </div>
          </>
        )}
      </FloatCard>

      {/* 场景二：边缘自治能力（T2-2） */}
      {s2 && (
        <FloatCard
          title="能力状态"
          icon="cloud"
          style={{ position: 'absolute', left: 288, top: 64, width: 300 }}
        >
          <Sub title="三段式能力">
            <div className="row" style={{ gap: 8, justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <Icon name="cloud" size={20} className="v-cyan" />
                <div style={{ fontSize: 11, color: 'var(--text-1)' }}>云端</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-2)' }}>全局策略优化</div>
              </div>
              <Icon name="chevron" size={14} className="v-dim" />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <Icon name="server" size={20} className="v-cyan" />
                <div style={{ fontSize: 11, color: 'var(--text-1)' }}>边缘节点</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-2)' }}>实时推理与自主决策</div>
                <Tag tone="cyan">具备局部自治能力</Tag>
              </div>
              <Icon name="chevron" size={14} className="v-dim" />
              <div style={{ textAlign: 'center', flex: 1 }}>
                <Icon name="plane" size={20} className="v-cyan" />
                <div style={{ fontSize: 11, color: 'var(--text-1)' }}>执行单元</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-2)' }}>自主执行与反馈</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', textAlign: 'center' }}>
              策略下发 · 状态回传 · 任务指令 · 执行反馈
            </div>
          </Sub>

          <Sub title="自主运行条件">
            <div className="row">
              <b className="v-green" style={{ fontSize: 15 }}>已满足</b>
              <span className="spacer" />
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>可在断链条件下自主运行</span>
            </div>
          </Sub>

          <Sub title="云端协同状态">
            <KV k="云边端拓扑" v="已构建" vClass="v-green" />
            <KV k="云端连接" v="已连接" vClass="v-green" />
            <KV k="边缘节点" v="在线" vClass="v-green" />
            <KV k="执行集群" v={`${topology?.nodes.filter((n) => n.kind === 'group').length ?? 6}`} vClass="v-cyan" />
          </Sub>
        </FloatCard>
      )}

      {/* 场景一：链路组织方式说明 */}
      {!s2 && (
        <FloatCard
          title="AI 链路分析"
          icon="wave"
          style={{ position: 'absolute', left: 288, top: 64, width: 290 }}
        >
          <Sub title="推荐链路组织方式">
            <div style={{ fontSize: 12.2, lineHeight: 1.7 }}>
              <div className="v-green"><Icon name="check" size={12} /> 当前网络稳定</div>
              <div className="v-green"><Icon name="check" size={12} /> 支持多链路协同</div>
              <div className="v-green"><Icon name="check" size={12} /> 链路延迟满足实时控制要求</div>
            </div>
          </Sub>
          <Sub title="网络评估">
            <div className="row" style={{ gap: 12, justifyContent: 'space-around' }}>
              <Ring value={optimized ? 98 : 93} size={58} label={`${optimized ? 98 : 93}%`} sub="链路稳定度" />
              <Ring value={optimized ? 96 : 92} size={58} label={`${optimized ? 96 : 92}%`} sub="覆盖率" />
              <Ring value={optimized ? 95 : 91} size={58} label={`${optimized ? 95 : 91}%`} sub="协同效率" />
            </div>
          </Sub>
        </FloatCard>
      )}

      {/* 底部动作条 */}
      <BottomBar right={320}>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          拓扑节点 {topology?.nodes.length ?? 0} · 链路 {edges.length} 条
          {optimized && <span className="v-green"> · 已优化</span>}
        </span>
        <span className="spacer" />
        <div className="row" style={{ gap: 8 }}>
          <Btn icon="wave" onClick={onSpeakDone}>语音播报</Btn>
          <Btn icon="refresh" onClick={() => void onOptimize()} disabled={busy}>
            {s2 ? '链路优化' : '自动优化链路'}
          </Btn>
          {s2 && <Btn onClick={() => void nextPhase()}>返回拓扑视图</Btn>}
          <Btn variant="primary" onClick={onNext}>
            {s2 ? '进入下一步 »' : '进入侦察阶段 »'}
          </Btn>
        </div>
      </BottomBar>
    </>
  )
}
