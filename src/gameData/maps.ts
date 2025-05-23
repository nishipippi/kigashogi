// src/gameData/maps.ts
import type { MapData } from '@/types/map';

export const ALL_MAPS_DATA: Record<string, MapData> = {
  map1: {
    id: 'map1',
    name: 'Crossroads',
    description: "A small map with open terrain, favoring quick engagements.",
    rows: 10, // 論理的な行数
    cols: 20, // 論理的な列数
    deploymentAreas: {
        player: [ // 左側3列 (論理座標)
            {x:0, y:0}, {x:0, y:1}, {x:0, y:2}, {x:0, y:3}, {x:0, y:4}, {x:0, y:5}, {x:0, y:6}, {x:0, y:7}, {x:0, y:8}, {x:0, y:9},
            {x:1, y:0}, {x:1, y:1}, {x:1, y:2}, {x:1, y:3}, {x:1, y:4}, {x:1, y:5}, {x:1, y:6}, {x:1, y:7}, {x:1, y:8}, {x:1, y:9},
            {x:2, y:0}, {x:2, y:1}, {x:2, y:2}, {x:2, y:3}, {x:2, y:4}, {x:2, y:5}, {x:2, y:6}, {x:2, y:7}, {x:2, y:8}, {x:2, y:9},
        ],
        enemy: [ // 右側3列 (論理座標) - マップサイズ(cols)を考慮して設定
            {x:17, y:0}, {x:17, y:1}, {x:17, y:2}, {x:17, y:3}, {x:17, y:4}, {x:17, y:5}, {x:17, y:6}, {x:17, y:7}, {x:17, y:8}, {x:17, y:9},
            {x:18, y:0}, {x:18, y:1}, {x:18, y:2}, {x:18, y:3}, {x:18, y:4}, {x:18, y:5}, {x:18, y:6}, {x:18, y:7}, {x:18, y:8}, {x:18, y:9},
            {x:19, y:0}, {x:19, y:1}, {x:19, y:2}, {x:19, y:3}, {x:19, y:4}, {x:19, y:5}, {x:19, y:6}, {x:19, y:7}, {x:19, y:8}, {x:19, y:9},
        ]
    },
    strategicPoints: [
      { id: 'map1_sp1', name: 'North Outpost', x: 7, y: 2, owner: 'neutral', timeToCapture: 10000 },
      { id: 'map1_sp2', name: 'South Checkpoint', x: 12, y: 7, owner: 'neutral', timeToCapture: 10000 },
    ],
    hexes: {} // 地形は動的に生成されるため空オブジェクト
  },
  map2: {
    id: 'map2',
    name: 'Forest Siege',
    description: "A medium map with dense forests offering cover and ambush opportunities.",
    rows: 15,
    cols: 25,
    deploymentAreas: { // 例: プレイヤーは左3列、敵は右3列
        player: Array.from({length: 15 * 3}, (_, i) => ({ x: Math.floor(i/15), y: i % 15 })),
        enemy: Array.from({length: 15 * 3}, (_, i) => ({ x: 22 + Math.floor(i/15), y: i % 15 }))
    },
    strategicPoints: [
      { id: 'map2_sp1', name: 'Forest Clearing', x: 5, y: 5, owner: 'neutral', timeToCapture: 12000 },
      { id: 'map2_sp2', name: 'River Crossing', x: 12, y: 7, owner: 'neutral', timeToCapture: 10000 },
      { id: 'map2_sp3', name: 'Hidden Base', x: 19, y: 9, owner: 'neutral', timeToCapture: 12000 },
    ],
    hexes: {} // 地形は動的に生成
  },
  map3: {
    id: 'map3',
    name: 'Urban Warfare',
    description: "A large urban map with many chokepoints and buildings for infantry combat.",
    rows: 20,
    cols: 30,
    deploymentAreas: { // 例: プレイヤーは左3列、敵は右3列
        player: Array.from({length: 20 * 3}, (_, i) => ({ x: Math.floor(i/20), y: i % 20 })),
        enemy: Array.from({length: 20 * 3}, (_, i) => ({ x: 27 + Math.floor(i/20), y: i % 20 }))
    },
    strategicPoints: [
      { id: 'map3_sp1', name: 'City Center', x: 6, y: 4, owner: 'neutral', timeToCapture: 15000 },
      { id: 'map3_sp2', name: 'Market Square', x: 15, y: 10, owner: 'neutral', timeToCapture: 10000 },
      { id: 'map3_sp3', name: 'Industrial Zone', x: 23, y: 15, owner: 'neutral', timeToCapture: 15000 },
      { id: 'map3_sp4', name: 'Residential District', x: 10, y: 18, owner: 'neutral', timeToCapture: 12000 },
      { id: 'map3_sp5', name: 'Park Entrance', x: 20, y: 2, owner: 'neutral', timeToCapture: 12000 },
    ],
    hexes: {} // 地形は動的に生成
  },
};

// マップ選択画面用のオプションリスト
export const MAP_OPTIONS = Object.values(ALL_MAPS_DATA).map(map => ({
    id: map.id,
    name: map.name,
    description: map.description || "No description available.",
    sizeLabel: `${map.cols}x${map.rows}`, // `cols` と `rows` を使用
    strategicPointsCount: map.strategicPoints?.length || 0,
}));