// src/types/map.ts

export interface MapTile {
  x: number;
  y: number;
  isDeployable: boolean; // このタイルに配置可能か
  terrainType?: string;   // 将来的に地形の種類 (例: 'plain', 'forest', 'hill', 'road', 'urban')
  // terrainEffect?: { moveCostMultiplier?: number; coverBonus?: number; sightModifier?: number }; // 地形効果
}

export interface StrategicPoint {
  id: string; // 拠点の一意なID (例: "sp1", "alpha_base")
  x: number;  // 論理X座標
  y: number;  // 論理Y座標
  owner: 'player' | 'enemy' | 'neutral'; // 現在の所有者
  captureProgress?: number; // 0-100 (占領進捗)
  capturingPlayer?: 'player' | 'enemy' | null; // 現在占領しようとしているプレイヤー
  timeToCapture?: number; // 占領に必要な総時間 (ms) - マップデータで定義
}

export interface MapData {
  id: string;
  name: string;
  description?: string; // マップの説明
  rows: number; // マップの論理的な行数
  cols: number; // マップの論理的な列数
  deploymentArea: { // 初期配置可能エリア定義
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  };
  // tiles?: MapTile[][]; // より詳細なタイルごとの情報 (将来的にはこちらで地形などを管理)
  strategicPoints?: StrategicPoint[]; // 戦略拠点のリスト
  // defaultGameTimeLimit?: number; // このマップのデフォルトゲーム時間制限 (秒) - ストアで管理するので必須ではない
  // defaultTargetVictoryPoints?: number; // このマップのデフォルト目標VP - ストアで管理するので必須ではない
}