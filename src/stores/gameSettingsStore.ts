// src/stores/gameSettingsStore.ts
import { create } from 'zustand';
import type { UnitData } from '@/types/unit'; // UnitDataも使う可能性があるのでインポート

// 初期配置画面から渡されるデータの型 (ユニット種別IDと位置のみ)
export interface InitialDeployedUnitConfig {
  unitId: string; // ユニット種別ID
  name: string; // ユニット名 (ユニット定義から取得できるが、初期配置時に持っておくと便利)
  cost: number; // コスト (ユニット定義から取得できるが、初期配置時に持っておくと便利)
  position: { x: number; y: number }; // 論理座標
}

// ゲームプレイ中のユニットインスタンスの型
export interface PlacedUnit {
  instanceId: string; // ゲーム内でユニークなインスタンスID
  unitId: string; // ユニット種別ID (UnitDataのidに対応)
  name: string; // 表示名 (UnitDataのname)
  cost: number; // コスト (UnitDataのcost)
  position: { x: number; y: number }; // 現在の論理座標
  currentHp: number;
  owner: 'player' | 'enemy'; // ユニットの所有者
  orientation: number; // 0-5 (0:上, 1:右上, ...) または 0-359度
  // status?: 'idle' | 'moving' | 'attacking' | 'producing'; // 将来的な状態
  // targetPosition?: { x: number; y: number } | null; // 移動目標地点 (ストアで管理する場合)
}

// AI難易度の型
export type AiDifficulty = 'easy' | 'normal' | 'hard' | 'very_hard';
// 勢力の型
export type Faction = 'alpha_force' | 'bravo_corp' | 'random';
// 初期コストの型
export type InitialCost = 300 | 500 | 700 | number;


// ストアの状態の型定義
interface GameSettingsState {
  // AI対戦設定などゲーム全体の設定
  aiDifficulty: AiDifficulty;
  playerFaction: Faction;
  enemyFaction: Faction;
  initialCost: InitialCost;
  selectedMapId: string | null;

  // ゲームプレイ中の状態
  initialDeploymentConfig: InitialDeployedUnitConfig[]; // 初期配置画面で決定されたユニットの「設定」
  allUnitsOnMap: PlacedUnit[]; // ゲームプレイ中の全ユニットの「インスタンス」リスト

  // アクション (状態を更新する関数)
  setAiDifficulty: (difficulty: AiDifficulty) => void;
  setPlayerFaction: (faction: Faction) => void;
  setEnemyFaction: (faction: Faction) => void;
  setInitialCost: (cost: InitialCost) => void;
  setSelectedMapId: (mapId: string | null) => void;

  setInitialDeployment: (deploymentConfig: InitialDeployedUnitConfig[], unitsDataMap: Map<string, UnitData>) => void;
  // allUnitsOnMap は setInitialDeployment 内で初期化される
  updateUnitOnMap: (instanceId: string, updates: Partial<Omit<PlacedUnit, 'instanceId' | 'unitId'>>) => void;
  addUnitToMap: (unit: PlacedUnit) => void; // 新規ユニット追加用
  removeUnitFromMap: (instanceId: string) => void; // ユニット削除用
}

// Zustandストアの作成
export const useGameSettingsStore = create<GameSettingsState>((set, get) => ({
  // 初期状態
  aiDifficulty: 'normal',
  playerFaction: 'alpha_force',
  enemyFaction: 'bravo_corp',
  initialCost: 500,
  selectedMapId: null,

  initialDeploymentConfig: [],
  allUnitsOnMap: [],

  // アクションの実装
  setAiDifficulty: (difficulty) => set({ aiDifficulty: difficulty }),
  setPlayerFaction: (faction) => set({ playerFaction: faction }),
  setEnemyFaction: (faction) => set({ enemyFaction: faction }),
  setInitialCost: (cost) => set({ initialCost: cost }),
  setSelectedMapId: (mapId) => set({ selectedMapId: mapId }),

  setInitialDeployment: (deploymentConfig, unitsDataMap) => {
    const placedUnits: PlacedUnit[] = deploymentConfig.map((depUnitConfig, index) => {
      const unitDef = unitsDataMap.get(depUnitConfig.unitId);
      const uniqueInstanceId = `${depUnitConfig.unitId}_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`;

      return {
        instanceId: uniqueInstanceId,
        unitId: depUnitConfig.unitId,
        name: unitDef?.name || depUnitConfig.name, // 定義があればそちらを優先
        cost: unitDef?.cost || depUnitConfig.cost, // 定義があればそちらを優先
        position: depUnitConfig.position,
        currentHp: unitDef?.stats.hp || 10, // デフォルトHP (定義がなければ仮)
        owner: 'player', // 現状はプレイヤーのみ
        orientation: 0, // 初期向き (例: 0度 or 0-5の0)
      };
    });
    set({ initialDeploymentConfig: deploymentConfig, allUnitsOnMap: [...placedUnits] });
  },

  updateUnitOnMap: (instanceIdToUpdate, updates) =>
    set(state => ({
      allUnitsOnMap: state.allUnitsOnMap.map(unit =>
        unit.instanceId === instanceIdToUpdate
          ? { ...unit, ...updates }
          : unit
      ),
    })),

  addUnitToMap: (newUnit) =>
    set(state => ({
      allUnitsOnMap: [...state.allUnitsOnMap, newUnit],
    })),

  removeUnitFromMap: (instanceIdToRemove) =>
    set(state => ({
      allUnitsOnMap: state.allUnitsOnMap.filter(unit => unit.instanceId !== instanceIdToRemove),
    })),
}));

// 定数として選択肢をエクスポート (これは変更なし)
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