// src/stores/gameSettingsStore.ts
import { create } from 'zustand';
// 初期配置画面の DeployedUnit 型。これを InitialDeployedUnitConfig として扱う
import type { DeployedUnit as InitialDeployedUnitConfig } from '@/app/unit-deployment/page';
// UnitData 型をインポート (HPなどを参照するために必要になる可能性)
// import type { UnitData } from '@/types/unit';

// ゲームプレイ中のユニットの状態を表す型 (HPや向きも含む)
// この型定義は、ゲームプレイ画面や他のゲームロジックで共有されるため、
// src/types/game.ts のような共通の型定義ファイルに移動することも検討できます。
export interface PlacedUnit extends InitialDeployedUnitConfig {
  // instanceId: string; // ゲーム内でユニークなID (推奨: UnitDeploymentContentで生成して付与)
  currentHp: number;
  owner: 'player' | 'enemy'; // ユニットの所有者
  orientation?: number; // ユニットの向き (例: 0-5 or 0-359 degrees)
  // status?: 'idle' | 'moving' | 'attacking' | 'producing'; // 将来的な状態
}

// AI難易度の型
export type AiDifficulty = 'easy' | 'normal' | 'hard' | 'very_hard';
// 勢力の型
export type Faction = 'alpha_force' | 'bravo_corp' | 'random';
// 初期コストの型
export type InitialCost = 300 | 500 | 700 | number;

// ストアの状態の型定義
interface GameSettingsState {
  // AI対戦設定
  aiDifficulty: AiDifficulty;
  playerFaction: Faction;
  enemyFaction: Faction;
  initialCost: InitialCost;

  // マップ選択
  selectedMapId: string | null;

  // 初期配置ユニットリスト (ゲームプレイ画面用)
  initialDeployment: PlacedUnit[];

  // アクション (状態を更新する関数)
  setAiDifficulty: (difficulty: AiDifficulty) => void;
  setPlayerFaction: (faction: Faction) => void;
  setEnemyFaction: (faction: Faction) => void;
  setInitialCost: (cost: InitialCost) => void;
  setSelectedMapId: (mapId: string | null) => void;
  setInitialDeployment: (deployment: PlacedUnit[]) => void; // 引数を PlacedUnit[] に変更
  updatePlacedUnit: (instanceId: string, updates: Partial<PlacedUnit>) => void; // instanceIdでユニットを特定
  // addPlacedUnit, removePlacedUnitなども将来的に必要
}

// Zustandストアの作成
export const useGameSettingsStore = create<GameSettingsState>((set) => ({
  // 初期状態
  aiDifficulty: 'normal',
  playerFaction: 'alpha_force',
  enemyFaction: 'bravo_corp',
  initialCost: 500, // 要件定義補足資料からのデフォルト初期コスト
  selectedMapId: null,
  initialDeployment: [], // 初期状態は空

  // アクションの実装
  setAiDifficulty: (difficulty) => set({ aiDifficulty: difficulty }),
  setPlayerFaction: (faction) => set({ playerFaction: faction }),
  setEnemyFaction: (faction) => set({ enemyFaction: faction }),
  setInitialCost: (cost) => set({ initialCost: cost }),
  setSelectedMapId: (mapId) => set({ selectedMapId: mapId }),
  setInitialDeployment: (deployment) => set({ initialDeployment: deployment }), // シンプルにセット
  updatePlacedUnit: (instanceIdToUpdate, updates) => set(state => ({
    initialDeployment: state.initialDeployment.map(unit =>
      // unit.instanceId === instanceIdToUpdate // 将来的に instanceId を使う
      // 現状は unit.unitId と instanceIdToUpdate (これも unitId になっているはず) で比較するが、
      // 同じ種類のユニットが複数いると問題になる
      (unit as any).unitId === instanceIdToUpdate // PlacedUnitにinstanceIdがない場合の仮対応
        ? { ...unit, ...updates }
        : unit
    )
  })),
}));

// 定数として選択肢をエクスポートしておくと便利 (変更なし)
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