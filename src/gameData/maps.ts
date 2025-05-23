// src/gameData/maps.ts
import type { MapData } from '@/types/map';

export const ALL_MAPS_DATA: Record<string, MapData> = {
  map1: {
    id: 'map1',
    name: 'Crossroads',
    description: "A small map with open terrain, favoring quick engagements.",
    rows: 10,
    cols: 20,
    deploymentArea: { startX: 0, startY: 0, endX: 2, endY: 9 }, // 左側3列
    strategicPoints: [
      { id: 'map1_sp1', x: 7, y: 2, owner: 'neutral', timeToCapture: 10000 }, // 10秒で占領
      { id: 'map1_sp2', x: 12, y: 7, owner: 'neutral', timeToCapture: 10000 },
    ],
  },
  map2: {
    id: 'map2',
    name: 'Forest Siege',
    description: "A medium map with dense forests offering cover and ambush opportunities.",
    rows: 15,
    cols: 25,
    deploymentArea: { startX: 0, startY: 0, endX: 2, endY: 14 }, // 左側3列
    strategicPoints: [
      { id: 'map2_sp1', x: 5, y: 5, owner: 'neutral', timeToCapture: 12000 }, // 12秒
      { id: 'map2_sp2', x: 12, y: 7, owner: 'neutral', timeToCapture: 10000 },
      { id: 'map2_sp3', x: 19, y: 9, owner: 'neutral', timeToCapture: 12000 },
    ],
  },
  map3: {
    id: 'map3',
    name: 'Urban Warfare',
    description: "A large urban map with many chokepoints and buildings for infantry combat.",
    rows: 20,
    cols: 30,
    deploymentArea: { startX: 0, startY: 0, endX: 2, endY: 19 }, // 左側3列
    strategicPoints: [
      { id: 'map3_sp1', x: 6, y: 4, owner: 'neutral', timeToCapture: 15000 }, // 15秒
      { id: 'map3_sp2', x: 15, y: 10, owner: 'neutral', timeToCapture: 10000 },
      { id: 'map3_sp3', x: 23, y: 15, owner: 'neutral', timeToCapture: 15000 },
      { id: 'map3_sp4', x: 10, y: 18, owner: 'neutral', timeToCapture: 12000 },
      { id: 'map3_sp5', x: 20, y: 2, owner: 'neutral', timeToCapture: 12000 },
    ],
  },
};

// マップ選択画面用のオプションリスト
export const MAP_OPTIONS = Object.values(ALL_MAPS_DATA).map(map => ({
    id: map.id,
    name: map.name,
    description: map.description || "No description available.",
    sizeLabel: `${map.cols}x${map.rows}`,
    strategicPointsCount: map.strategicPoints?.length || 0,
}));