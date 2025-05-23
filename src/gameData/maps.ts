// src/gameData/maps.ts
import type { MapData } from '@/types/map';

export const ALL_MAPS_DATA: Record<string, MapData> = {
  map1: {
    id: 'map1',
    name: 'Crossroads',
    description: "A small, open map favoring quick engagements and control of central strategic points.",
    rows: 10, // 論理的な行数
    cols: 15, // 論理的な列数 (少し狭めてみる)
    deploymentArea: { // プレイヤー初期配置エリア (左3列)
      startX: 0,
      startY: 0,
      endX: 2,   // 0, 1, 2 の列
      endY: 9,   // 全行
    },
    strategicPoints: [
      { id: 'sp1_1', name: 'North Relay', x: 7, y: 2, owner: 'neutral' }, // 中央やや上
      { id: 'sp1_2', name: 'South Hub', x: 7, y: 7, owner: 'neutral' },   // 中央やや下
    ],
    // tiles: [ ... ] // 将来的に各タイルの地形情報を定義
  },
  map2: {
    id: 'map2',
    name: 'Forest Outpost',
    description: "A medium map with a dense central forest providing cover and ambush opportunities. Control the outpost for a strategic advantage.",
    rows: 16,
    cols: 22,
    deploymentArea: {
      startX: 0,
      startY: 0,
      endX: 2,
      endY: 15,
    },
    strategicPoints: [
      { id: 'sp2_1', name: 'West Bridge', x: 4, y: 7, owner: 'neutral' },
      { id: 'sp2_2', name: 'Central Outpost', x: 10, y: 7, owner: 'neutral' },
      { id: 'sp2_3', name: 'East Ridge', x: 16, y: 7, owner: 'neutral' },
    ],
  },
  map3: {
    id: 'map3',
    name: 'Urban Chokepoint',
    description: "A large urban environment with tight chokepoints and numerous buildings offering cover for infantry. Secure key intersections to dominate.",
    rows: 20,
    cols: 28,
    deploymentArea: {
      startX: 0,
      startY: 0,
      endX: 2,
      endY: 19,
    },
    strategicPoints: [
      { id: 'sp3_1', name: 'Plaza North', x: 8, y: 4, owner: 'neutral' },
      { id: 'sp3_2', name: 'Market Square', x: 13, y: 9, owner: 'neutral' },
      { id: 'sp3_3', name: 'Plaza South', x: 18, y: 14, owner: 'neutral' },
      { id: 'sp3_4', name: 'Industrial Access', x: 6, y: 15, owner: 'neutral' },
      { id: 'sp3_5', name: 'Civic Center', x: 20, y: 5, owner: 'neutral' },
    ],
  },
};

// マップ選択画面などで使用するためのオプションリスト
export const MAP_OPTIONS = Object.values(ALL_MAPS_DATA).map(map => ({
    id: map.id,
    name: map.name,
    description: map.description || "No description available.",
    sizeLabel: `${map.cols}x${map.rows}` // 例として論理的な盤面の広さ
}));