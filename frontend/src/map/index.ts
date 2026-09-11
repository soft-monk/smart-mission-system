// 地图模块 · 唯一公开入口
//
// 应用只允许从 '@/map' 导入；模块内部文件（layers/、store.ts 等）属于实现细节。
export { MapView } from './MapView'
export { MapToolbar, MapModeBadge } from './MapToolbar'
export { Compass } from './Compass'
export { useMapUiStore, LAYER_GROUPS } from './store'
export { LayerManager, LAYER_GROUP_LABELS, ALL_LAYER_GROUPS } from './layers/LayerManager'
export type { LayerGroup } from './layers/LayerManager'
export { DISPLAY_MODE, displayModeOf } from './displayMode'
export { mapInstance } from './instance'
export type { MapData, MapToolKey, MapViewport } from './types'
