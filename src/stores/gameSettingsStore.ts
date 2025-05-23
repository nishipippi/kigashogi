// src/stores/gameSettingsStore.ts
import { create } from 'zustand';

// AI難易度の型 (必要に応じて拡張)
export type AiDifficulty = 'easy' | 'normal' | 'hard' | 'very_hard';
// 勢力の型 (仮)
export type Faction = 'alpha_force' | 'bravo_corp' | 'random';
// 初期コストの型
export type InitialCost = 300 | 500 | 700 | number; // numberでカスタムも許容するなら

// ストアの状態の型定義
interface GameSettingsState {
  // AI対戦設定
  aiDifficulty: AiDifficulty;
  playerFaction: Faction; // プレイヤーが選択する勢力
  enemyFaction: Faction;  // AIの勢力 (プレイヤーと異なる場合など)
  initialCost: InitialCost;

  // アクション (状態を更新する関数)
  setAiDifficulty: (difficulty: AiDifficulty) => void;
  setPlayerFaction: (faction: Faction) => void;
  setEnemyFaction: (faction: Faction) => void;
  setInitialCost: (cost: InitialCost) => void;

  // 他のゲーム設定もここに追加可能 (例: マップサイズ、勝利ポイント目標など)
  // selectedMapId: string | null;
  // setSelectedMapId: (mapId: string | null) => void;
}

// Zustandストアの作成
export const useGameSettingsStore = create<GameSettingsState>((set) => ({
  // 初期状態
  aiDifficulty: 'normal', // デフォルトのAI難易度
  playerFaction: 'alpha_force', // デフォルトのプレイヤー勢力
  enemyFaction: 'bravo_corp', // デフォルトのAI勢力
  initialCost: 500, // 要件定義補足資料からのデフォルト初期コスト

  // アクションの実装
  setAiDifficulty: (difficulty) => set({ aiDifficulty: difficulty }),
  setPlayerFaction: (faction) => set({ playerFaction: faction }),
  setEnemyFaction: (faction) => set({ enemyFaction: faction }),
  setInitialCost: (cost) => set({ initialCost: cost }),

  selectedMapId: null,
  setSelectedMapId: (mapId) => set({ selectedMapId: mapId }),
}));

// 定数として選択肢をエクスポートしておくと便利
export const aiDifficulties: { value: AiDifficulty, label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
  { value: 'very_hard', label: 'Very Hard' },
];

export const factions: { value: Faction, label: string }[] = [
  { value: 'alpha_force', label: 'Alpha Force' },
  { value: 'bravo_corp', label: 'Bravo Corp' },
  { value: 'random', label: 'Random' },
];

export const initialCosts: { value: InitialCost, label: string }[] = [
  { value: 300, label: '300 Cost' },
  { value: 500, label: '500 Cost (Recommended)' },
  { value: 700, label: '700 Cost' },
];

interface GameSettingsState {
  // ... (既存の状態)
  selectedMapId: string | null; // 選択されたマップID

  // アクション
  // ... (既存のアクション)
  setSelectedMapId: (mapId: string | null) => void;
}

