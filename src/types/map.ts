// src/types/map.ts

// 地形の種類を定義
export type TerrainType = 'plains' | 'forest' | 'hills' | 'road' | 'city' | 'water' | 'mountain' | 'swamp'; // 例: swamp追加

// 各ヘックスの詳細データ
export interface HexData {
  q: number; // Axial q座標 (マップ定義のキーと重複するが、データとして持つと便利)
  r: number; // Axial r座標
  terrain: TerrainType;
  // isDeployable?: boolean; // 配置可能エリアはMapData.deploymentAreasで管理するため、ここでは不要かも
  // height?: number; // 将来的な高さの概念
}

export interface StrategicPoint {
  id: string;
  x: number;  // 論理X座標 (現在の定義のまま)
  y: number;  // 論理Y座標 (現在の定義のまま)
  name: string; // 拠点名 (追加を推奨)
  owner: 'player' | 'enemy' | 'neutral';
  captureProgress?: number;
  capturingPlayer?: 'player' | 'enemy' | null;
  timeToCapture?: number;
}

export interface MapData {
  id: string;
  name: string;
  description?: string;
  rows: number; // マップの論理的な行数 (描画範囲やバリデーション用)
  cols: number; // マップの論理的な列数 (同上)
  deploymentAreas: { // 初期配置可能エリア定義 (論理座標)
    player: { x: number, y: number }[];
    enemy: { x: number, y: number }[];
  };
  strategicPoints?: StrategicPoint[];
  // マップ内の全ヘックスの地形情報 (Axial座標をキーとする)
  // キーの形式例: "q,r" (例: "0,0", "1,-1")
  hexes: Record<string, HexData>;
}

// 地形ごとの移動コスト (通行不可はInfinityを使用)
// この定義は src/gameData/constants.ts や src/config/gameConfig.ts などに移動しても良い
export const TERRAIN_MOVE_COSTS: Record<TerrainType, number> = {
  plains: 1,
  forest: 2,    // 森は移動コスト高め
  hills: 3,     // 丘はさらに高め
  road: 0.5,    // 道路は移動しやすい
  city: 1.5,    // 市街地も少しコストがかかる
  water: Infinity, // 通行不可
  mountain: Infinity, // 通行不可
  swamp: 4,     // 沼地は非常に通りにくい
};

// ユニットの移動タイプ (例)
export type UnitMoveType = 'infantry' | 'vehicle_wheeled' | 'vehicle_tracked' | 'hover';

// ユニット移動タイプごとの地形コスト修飾 (オプション)
// export const UNIT_TERRAIN_MODIFIERS: Record<UnitMoveType, Partial<Record<TerrainType, number>>> = {
//   infantry: { forest: 1.5 }, // 歩兵は森を少し通りやすい (基本コスト2 * 0.75 = 1.5相当など)
//   vehicle_wheeled: { road: 0.3, plains: 1.2 }, // 車輪車両は道路が得意、平地は少し苦手
//   vehicle_tracked: { plains: 0.8, forest: 3, hills: 2.5 }, // 装軌車両は平地が得意、森や丘はコスト増
//   hover: { water: 1, swamp: 1 }, // ホバーは水や沼も移動可能
// };
// 上記の UNIT_TERRAIN_MODIFIERS を使う場合、実際の移動コストは
// TERRAIN_MOVE_COSTS[terrain] * (UNIT_TERRAIN_MODIFIERS[unitMoveType][terrain] || 1) のように計算する。
// MVPでは TERRAIN_MOVE_COSTS のみで良いでしょう。