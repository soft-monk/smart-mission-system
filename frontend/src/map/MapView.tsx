// MapView —— MapLibre 二维底图容器（契约 §0：仅二维渲染，无 2D/3D 切换）
// 设计要点（TRD UI-06）：地图走 WebGL canvas，React 只负责 DOM 面板，互不拖累。
// 动态图层用 MapLibre 原生 source/layer（见 mapLayers.ts），避免双引擎互操作风险。
import React, { useEffect, useRef } from 'react'
import maplibregl, { Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore } from '@/stores/useStore'
import { LayerManager } from '@/map/mapLayers'

/** 无瓦片时的兜底样式：深色纯底，保证任何环境都能演示 */
function fallbackStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#08111f' } }],
  }
}

function rasterStyle(tileUrl: string, attribution: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution,
        maxzoom: 14,
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#050d18' } },
      // 卫星影像 → 压暗 + 去饱和，做成指挥中心深色风格。
      // 参数经验：brightness-max 低于 0.55 会把影像压成纯黑（影像本身偏暗）；
      // 这里取「能看清地形纹理、整体明显偏暗」的平衡点。
      // 注意：MapLibre raster 只支持 raster-* 属性，不要写 'background-tint'。
      {
        id: 'base',
        type: 'raster',
        source: 'base',
        paint: {
          'raster-opacity': 1,
          'raster-saturation': -0.55,
          'raster-contrast': 0.16,
          'raster-brightness-min': 0.03,
          'raster-brightness-max': 0.62,
        },
      },
      // 冷色调叠加：把中性灰地形统一成青蓝军事风
      {
        id: 'base-tint',
        type: 'background',
        paint: { 'background-color': 'rgba(6, 26, 52, 0.30)' },
      },
    ],
  }
}

export const mapRef: { current: MlMap | null } = { current: null }

export const MapView: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = React.useState(false)

  useEffect(() => {
    if (!hostRef.current) return

    const cfg = useStore.getState().mapConfig
    const center: [number, number] = cfg?.center ?? [116.3974, 39.9093]
    const zoom = cfg?.zoom ?? 11

    const style = cfg?.basemap?.tileUrlTemplate
      ? rasterStyle(cfg.basemap.tileUrlTemplate, cfg.basemap.attribution)
      : fallbackStyle()

    const map = new maplibregl.Map({
      container: hostRef.current,
      style,
      center,
      zoom,
      minZoom: cfg?.minZoom ?? 3,
      maxZoom: cfg?.maxZoom ?? 16,
      attributionControl: { compact: true },
      dragRotate: false,     // 仅二维：禁旋转
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      LayerManager.init(map)
      setReady(true)
    })

    // 瓦片加载失败处理：只统计，不隐藏图层。
    // 曾经的写法是「任一错误就把 base 图层 visibility 设为 none」，结果一个缺失瓦片
    // （或其它无关错误）就会把整张底图永久关掉且不恢复 —— 表现为地图全黑但瓦片其实请求成功。
    let tileFailures = 0
    map.on('error', (e) => {
      const msg = String((e as { error?: { message?: string } })?.error?.message ?? '')
      if (/tile|raster|image|404/i.test(msg)) {
        tileFailures += 1
        if (tileFailures === 1 || tileFailures % 20 === 0) {
          console.warn(`[map] 瓦片加载失败累计 ${tileFailures} 次（底图保持显示，缺失处露出深色底）`, msg)
        }
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [])

  // 场景/任务切换时平滑移动视角
  const mapConfig = useStore((s) => s.mapConfig)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapConfig) return
    const [lng, lat] = mapConfig.center
    map.easeTo({ center: [lng, lat], zoom: mapConfig.zoom, duration: 600 })
  }, [mapConfig])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      {/* 指挥中心观感：暗角 + 极淡坐标网格（不拦截鼠标） */}
      <div className="map-vignette" />
      {ready && <LayerSync />}
      {children}
    </div>
  )
}

/** 把 store 中的数据同步到地图图层（遥测/目标/链路/区域/轨迹） */
const LayerSync: React.FC = () => {
  const phase = useStore((s) => s.phase)
  const scenarioKey = useStore((s) => s.scenarioKey)
  const targets = useStore((s) => s.targets)
  const edges = useStore((s) => s.linkEdges)
  const groups = useStore((s) => s.groups)
  const uavPositions = useStore((s) => s.uavPositions)
  const selectedTargetId = useStore((s) => s.selectedTargetId)
  const trackPoints = useStore((s) => s.trackPoints)
  const linkTopology = useStore((s) => s.linkTopology)

  useEffect(() => {
    LayerManager.setScenario(scenarioKey)
    LayerManager.setPhase(phase)
  }, [scenarioKey, phase])

  useEffect(() => {
    LayerManager.setLinks(edges, linkTopology?.nodes ?? [])
  }, [edges, linkTopology])

  useEffect(() => {
    LayerManager.setTargets(targets, selectedTargetId)
  }, [targets, selectedTargetId])

  useEffect(() => {
    LayerManager.setGroups(groups)
  }, [groups])

  useEffect(() => {
    LayerManager.setUavs(Object.values(uavPositions))
  }, [uavPositions])

  useEffect(() => {
    LayerManager.setTrack(trackPoints)
  }, [trackPoints])

  return null
}
