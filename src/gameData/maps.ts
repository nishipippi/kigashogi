// src/gameData/maps.ts
import type { MapData } from '@/types/map';

export const ALL_MAPS_DATA: Record<string, MapData> = {
  map1: {
    id: 'map1',
    name: 'Crossroads',
    rows: 10,
    cols: 20,
    deploymentArea: { startX: 0, startY: 0, endX: 2, endY: 9 },
    // description: "A small map with open terrain, favoring quick engagements.",
    // strategicPointsCount: 2, // 将来的に追加
  },
  map2: {
    id: 'map2',
    name: 'Forest Siege',
    rows: 15,
    cols: 25,
    deploymentArea: { startX: 0, startY: 0, endX: 2, endY: 14 },
    // description: "A medium map with dense forests offering cover and ambush opportunities.",
    // strategicPointsCount: 3,
  },
  map3: {
    id: 'map3',
    name: 'Urban Warfare',
    rows: 20,
    cols: 30,
    deploymentArea: { startX: 0, startY: 0, endX: 2, endY: 19 },
    // description: "A large urban map with many chokepoints and buildings for infantry combat.",
    // strategicPointsCount: 5,
  },
};

// マップIDの配列や、選択肢用のリストもエクスポートすると便利
export const MAP_OPTIONS = Object.values(ALL_MAPS_DATA).map(map => ({
    id: map.id,
    name: map.name,
    sizeLabel: `${map.cols}x${map.rows}` // 例
}));