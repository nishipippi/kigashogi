// src/types/map.ts

// 地形の種類を定義
export type TerrainType = 'plains' | 'forest' | 'hills' | 'road' | 'city' | 'water' | 'mountain' | 'swamp';

// 各ヘックスの詳細データ
export interface HexData {
  q: number; // Axial q座標
  r: number; // Axial r座標
  terrain: TerrainType;
  // height?: number; // 将来的な高さの概念
}

export interface StrategicPoint {
  id: string;
  x: number;  // 論理X座標
  y: number;  // 論理Y座標
  name: string; // 拠点名
  owner: 'player' | 'enemy' | 'neutral';
  captureProgress?: number; // 0-100
  capturingPlayer?: 'player' | 'enemy' | null;
  timeToCapture?: number; // ms
}

export interface MapData {
  id: string;
  name: string;
  description?: string;
  rows: number; // マップの論理的な行数
  cols: number; // マップの論理的な列数
  deploymentAreas: { // 初期配置可能エリア定義 (論理座標のリスト)
    player: { x: number, y: number }[];
    enemy: { x: number, y: number }[];
  };
  strategicPoints?: StrategicPoint[];
  // マップ内の全ヘックスの地形情報 (Axial座標をキーとする "q,r")
  hexes: Record<string, HexData>;
}

// --- 地形効果に関する定数 ---

// 地形ごとの移動コスト (通行不可はInfinityを使用)
export const TERRAIN_MOVE_COSTS: Record<TerrainType, number> = {
  plains: 1,
  forest: 2,
  hills: 3,
  road: 0.5,
  city: 1.5,
  water: Infinity,
  mountain: Infinity,
  swamp: 4,
};

// 地形ごとの隠蔽ボーナス/ペナルティ係数 (相手の基礎被発見距離に乗算)
// 1.0が基準。1.0より大きいと発見されにくく、小さいと発見されやすい。
export const TERRAIN_CONCEALMENT_MODIFIERS: Partial<Record<TerrainType, number>> = {
  forest: 1.5,    // 発見されにくい
  hills: 0.8,     // 発見されやすい (丘の上にいるユニット)
  road: 0.5,      // 発見されやすい
  city: 2.0,      // 歩兵が市街地にいる場合、非常に発見されにくい (ユニットタイプによる分岐が必要)
  plains: 1.0,    // 平地は基準
  swamp: 1.2,     // 沼地は少し発見されにくい (仮)
  water: 1.0,     // 水上は基準 (もしユニットが水上移動可能なら)
  mountain: 0.7,  // 山岳は非常に発見されやすい (遮蔽物がない場合、仮)
};

// 地形ごとの視界ボーナス/ペナルティ係数 (自軍の視界倍率に乗算)
// 1.0が基準。1.0より大きいと遠くまで見え、小さいと視界が悪化。
export const TERRAIN_SIGHT_MODIFIERS: Partial<Record<TerrainType, number>> = {
  hills: 1.2,     // 視界が広がる (丘の上にいるユニット)
  plains: 1.0,    // 平地は基準
  forest: 0.7,    // 森の中からの視界は悪化
  city: 0.8,      // 市街地からの視界もやや悪化
  swamp: 0.9,     // 沼地からの視界は少し悪化 (仮)
  water: 1.0,
  mountain: 1.5,  // 山頂からの視界は非常に良い (仮)
};

// 攻撃による発見ペナルティ係数 (相手の基礎被発見距離に乗算される一時的な係数)
export const ATTACK_DISCOVERY_PENALTY_MULTIPLIER = 2.0;
// 攻撃による発見ペナルティの持続時間 (ms)
export const ATTACK_DISCOVERY_PENALTY_DURATION_MS = 5000;


// ユニットの移動タイプ (例 - 将来の拡張用)
// export type UnitMoveType = 'infantry' | 'vehicle_wheeled' | 'vehicle_tracked' | 'hover' | 'naval' | 'air';

// ユニット移動タイプごとの地形コスト修飾 (オプション - 将来の拡張用)
// export const UNIT_TERRAIN_MODIFIERS: Record<UnitMoveType, Partial<Record<TerrainType, number>>> = {
//   infantry: { forest: 1.5, hills: 1.2, city: 1.0 },
//   vehicle_wheeled: { road: 0.3, plains: 1.2, forest: Infinity, hills: 3.0, city: 2.0 },
//   vehicle_tracked: { plains: 0.8, forest: 3, hills: 2.5, swamp: 2.0, city: 2.5 },
//   hover: { water: 1, swamp: 1, plains: 1.1 },
//   naval: { water: 1, plains: Infinity, forest: Infinity, hills: Infinity, road: Infinity, city: Infinity, mountain: Infinity, swamp: Infinity },
//   air: {} // 通常、地形コストの影響を受けない
// };