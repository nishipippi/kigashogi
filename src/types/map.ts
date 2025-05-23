// src/types/map.ts
export interface MapTile {
  x: number;
  y: number;
  isDeployable: boolean; // このタイルに配置可能か
  terrainType?: string; // 将来的に地形の種類も追加
}

export interface MapData {
  id: string;
  name: string;
  rows: number; // マップの行数
  cols: number; // マップの列数
  deploymentArea: { // 仮の配置可能エリア定義 (例: 左半分)
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  };
  tiles?: MapTile[][]; // より詳細なタイル情報 (将来的にはこちらを使う)
}

export const MOCK_MAPS: Record<string, MapData> = {
  map1: {
    id: 'map1',
    name: 'Crossroads',
    rows: 10,
    cols: 20, // 全体の盤面の論理的な列数
    deploymentArea: {
      startX: 0, // 論理X座標の開始 (0列目)
      startY: 0, // 論理Y座標の開始 (0行目)
      endX: 2,   // 論理X座標の終了 (2列目まで、つまり0,1,2の3列)
      endY: 9,   // 論理Y座標の終了 (最後まで)
    },
  },
  map2: {
    id: 'map2',
    name: 'Forest Siege',
    rows: 15,
    cols: 25,
    deploymentArea: { startX: 0, startY: 0, endX: 2, endY: 14 },
  },
  map3: {
    id: 'map3',
    name: 'Urban Warfare',
    rows: 20,
    cols: 30,
    deploymentArea: { startX: 0, startY: 0, endX: 2, endY: 19 },
  },
};