// 地图模块 · 地图容器（唯一对外渲染入口）
//
// 职责边界：只负责"把数据画成地图"——初始化 MapLibre、管理图层、叠加地图级控件
// （指北针/工具条/显示模式徽标由调用方以 children 传入或直接从本模块引入）。
// 数据经 props 注入（MapData），模块自身不读应用 store。
import React, { useEffect, useRef, useState } from 'react'
import maplibregl, { Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { LayerManager } from './layers/LayerManager'
import { mapInstance } from './instance'
import { useMapUiStore } from './store'
import type { MapData } from './types'

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
      base: { type: 'raster', tiles: [tileUrl], tileSize: 256, attribution, maxzoom: 14 },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#050d18' } },
      // 卫星影像 → 压暗 + 去饱和，做成指挥中心深色风格。
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
      { id: 'base-tint', type: 'background', paint: { 'background-color': 'rgba(6, 26, 52, 0.30)' } },
    ],
  }
}

const DEFAULT_CENTER: [number, number] = [116.3974, 39.9093]
const DEFAULT_ZOOM = 11

export const MapView: React.FC<{ data: MapData; children?: React.ReactNode }> = ({ data, children }) => {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const setViewport = useMapUiStore((s) => s.setViewport)
  // 初始化只做一次：用挂载时的配置快照
  const bootRef = useRef<MapData>(data)

  useEffect(() => {
    if (!hostRef.current) return
    const cfg = bootRef.current.config
    const center: [number, number] = cfg?.center ?? DEFAULT_CENTER
    const zoom = cfg?.zoom ?? DEFAULT_ZOOM

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
      dragRotate: false,      // 仅二维：禁旋转（指北针因此恒指正北）
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    })
    mapInstance.current = map

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')

    map.on('load', () => {
      LayerManager.init(map)
      LayerManager.applyVisibility()   // 恢复用户此前的图层开关
      setReady(true)
    })

    const syncViewport = () => {
      const c = map.getCenter()
      setViewport({ lng: c.lng, lat: c.lat, zoom: map.getZoom(), bearing: map.getBearing() })
    }
    map.on('move', syncViewport)
    map.on('rotate', syncViewport)

    // 瓦片加载失败只统计，不隐藏图层（避免一个缺失瓦片把整张底图关掉）
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
      mapInstance.current = null
      setReady(false)
    }
  }, [setViewport])

  // 场景/任务切换 → 平滑移动视角
  const config = data.config
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !config) return
    const [lng, lat] = config.center
    map.easeTo({ center: [lng, lat], zoom: config.zoom, duration: 600 })
  }, [config])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      <div className="map-vignette" />
      {ready && <LayerSync data={data} />}
      {children}
    </div>
  )
}

/** 把业务数据同步到地图图层（模块内部实现，数据全部来自 props） */
const LayerSync: React.FC<{ data: MapData }> = ({ data }) => {
  const { scenarioKey, phase, targets, selectedTargetId, groups, uavs, edges, topology, track } = data

  useEffect(() => {
    LayerManager.setScenario(scenarioKey)
    LayerManager.setPhase(phase)
  }, [scenarioKey, phase])

  useEffect(() => { LayerManager.setLinks(edges, topology?.nodes ?? []) }, [edges, topology])
  useEffect(() => { LayerManager.setTargets(targets, selectedTargetId ?? undefined) }, [targets, selectedTargetId])
  useEffect(() => { LayerManager.setGroups(groups) }, [groups])
  useEffect(() => { LayerManager.setUavs(uavs) }, [uavs])
  useEffect(() => { LayerManager.setTrack(track) }, [track])

  return null
}
