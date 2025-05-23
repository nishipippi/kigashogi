// src/types/map.ts

// 各タイルの詳細情報 (将来的拡張用)
export interface MapTile {
  x: number; // 論理X座標
  y: number; // 論理Y座標
  isDeployable: boolean; // このタイルに配置可能か
  terrainType?: 'plains' | 'forest' | 'hill' | 'road' | 'urban' | 'water'; // 地形の種類
  // movementCost?: number; // 地形ごとの移動コスト (将来的に)
  // coverBonus?: number;   // 地形からの防御ボーナス (将来的に)
  // sightModifier?: number; // 地形による視界修正 (将来的に)
}

// 戦略拠点の情報
export interface StrategicPoint {
  id: string; // 拠点の一意なID (例: "sp1", "alpha_base")
  x: number;  // 論理X座標
  y: number;  // 論理Y座標
  name?: string; // 拠点の表示名 (例: "Central Hill", "Supply Depot")
  owner?: 'player' | 'enemy' | 'neutral'; // 現在の所有者
  captureProgress?: number; // 占領進捗 (0-100)
  victoryPointsPerTick?: number; // この拠点を確保している場合に得られるVP/tick (将来的に)
}

// マップ全体のデータ構造
export interface MapData {
  id: string; // マップの一意なID
  name: string; // マップの表示名
  description?: string; // マップの説明文
  rows: number; // マップの論理的な行数 (ヘックスグリッドのY方向の最大インデックス + 1)
  cols: number; // マップの論理的な列数 (ヘックスグリッドのX方向の最大インデックス + 1)
  deploymentArea: { // プレイヤーの初期配置可能エリア (論理座標)
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  };
  // deploymentAreaEnemy?: { ... }; // 将来的に敵AIやPVPでの相手の配置エリア
  strategicPoints?: StrategicPoint[]; // マップ上の戦略拠点のリスト
  tiles?: MapTile[][]; // 各タイルの詳細情報 (将来的にはこれを行x列の2次元配列で持つ)
                       // 例: tiles[y][x] でアクセス
  // defaultTile?: MapTile; // 全タイルに適用されるデフォルトのタイル情報
}