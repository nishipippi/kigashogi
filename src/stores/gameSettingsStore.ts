// src/stores/gameSettingsStore.ts
import { create } from 'zustand';
import type { UnitData } from '@/types/unit'; // UnitData 型をインポート

// AI難易度の型 (必要に応じて拡張)
export type AiDifficulty = 'easy' | 'normal' | 'hard' | 'very_hard';
// 勢力の型 (仮)
export type Faction = 'alpha_force' | 'bravo_corp' | 'random';
// 初期コストの型
export type InitialCost = 300 | 500 | 700 | number;

// 初期配置画面から渡されるユニット設定データの型
export interface InitialDeployedUnitConfig {
  unitId: string; // ユニット種別ID
  name: string;   // ユニット名 (表示用、UnitDataからコピー)
  cost: number;   // コスト (UnitDataからコピー)
  position: { x: number; y: number }; // 論理座標
}

// ゲームプレイ中のユニットの状態を表す型
export type UnitStatus =
  | 'idle'
  | 'moving'
  | 'turning'
  | 'aiming' // ターゲットに照準中 (射程内だが攻撃間隔待ち or 初回照準)
  | 'attacking_he'
  | 'attacking_ap'
  | 'reloading_he' // HE武器のリロード中
  | 'reloading_ap'; // AP武器のリロード中

// ゲームプレイ中にマップ上に存在するユニットインスタンスの型
export interface PlacedUnit {
  instanceId: string; // ゲーム内でユニークなインスタンスID
  unitId: string;     // ユニット種別ID (UnitDataのidに対応)
  name: string;       // 表示名 (UnitDataのname)
  cost: number;       // コスト (UnitDataのcost)
  position: { x: number; y: number }; // 現在の論理座標
  currentHp: number;
  owner: 'player' | 'enemy'; // ユニットの所有者
  orientation: number; // 現在の向き (0-359 degrees)
  targetOrientation?: number; // 目標の向き (旋回用)
  isTurning?: boolean;        // 旋回中フラグ
  isMoving?: boolean;         // 移動中フラグ
  moveTargetPosition?: { x: number; y: number } | null; // 移動の最終目標地点
  currentPath?: { x: number; y: number }[] | null;     // 現在の移動経路 (次の経由ヘックスリスト)
  timeToNextHex?: number | null;                      // 次のヘックスへの移動残り時間 (ms)
  attackTargetInstanceId?: string | null; // 攻撃対象のユニットインスタンスID
  status?: UnitStatus;                    // ユニットの現在の状態
  lastAttackTimeHE?: number;              // HE武器の最終攻撃時刻 (タイムスタンプ)
  lastAttackTimeAP?: number;              // AP武器の最終攻撃時刻
}

// ストアの状態の型定義
interface GameSettingsState {
  // AI対戦設定など
  aiDifficulty: AiDifficulty;
  playerFaction: Faction;
  enemyFaction: Faction;
  initialCost: InitialCost;
  selectedMapId: string | null;

  // ユニット配置とゲームプレイ中のユニット状態
  initialDeployment: PlacedUnit[]; // 初期配置完了後のユニットリスト (ゲーム開始時のallUnitsOnMapの元)
  allUnitsOnMap: PlacedUnit[];     // ゲームプレイ中の全ユニットリスト

  // アクション (状態を更新する関数)
  setAiDifficulty: (difficulty: AiDifficulty) => void;
  setPlayerFaction: (faction: Faction) => void;
  setEnemyFaction: (faction: Faction) => void;
  setInitialCost: (cost: InitialCost) => void;
  setSelectedMapId: (mapId: string | null) => void;
  setInitialDeployment: (deploymentConfig: InitialDeployedUnitConfig[], unitsDataMap: Map<string, UnitData>) => void;
  setAllUnitsOnMap: (units: PlacedUnit[]) => void; // 主にゲーム開始時やロード時に使用
  updateUnitOnMap: (instanceId: string, updates: Partial<Omit<PlacedUnit, 'instanceId' | 'unitId'>>) => void;
  // addUnitToMap, removeUnitFromMap なども将来的に必要
}

// Zustandストアの作成
export const useGameSettingsStore = create<GameSettingsState>((set, get) => ({
  // 初期状態
  aiDifficulty: 'normal',
  playerFaction: 'alpha_force',
  enemyFaction: 'bravo_corp',
  initialCost: 500,
  selectedMapId: null,
  initialDeployment: [],
  allUnitsOnMap: [],

  // アクションの実装
  setAiDifficulty: (difficulty) => set({ aiDifficulty: difficulty }),
  setPlayerFaction: (faction) => set({ playerFaction: faction }),
  setEnemyFaction: (faction) => set({ enemyFaction: faction }),
  setInitialCost: (cost) => set({ initialCost: cost }),
  setSelectedMapId: (mapId) => set({ selectedMapId: mapId }),

  setInitialDeployment: (deploymentConfig, unitsDataMap) => {
    const placedUnits: PlacedUnit[] = deploymentConfig.map((depUnit, index) => {
      const unitDef = unitsDataMap.get(depUnit.unitId);
      return {
        instanceId: `${depUnit.unitId}_${Date.now()}_${index}`, // よりユニークなID生成
        unitId: depUnit.unitId,
        name: unitDef?.name || depUnit.name,
        cost: unitDef?.cost || depUnit.cost,
        position: depUnit.position,
        currentHp: unitDef?.stats.hp || 0,
        owner: 'player',
        orientation: 0,  // 初期向き (0度は真上を想定)
        isTurning: false,
        isMoving: false,
        moveTargetPosition: null,
        currentPath: null,
        timeToNextHex: null,
        attackTargetInstanceId: null,
        status: 'idle',
        lastAttackTimeHE: undefined,
        lastAttackTimeAP: undefined,
      };
    });
    set({ initialDeployment: placedUnits, allUnitsOnMap: [...placedUnits] });
  },

  setAllUnitsOnMap: (units) => set({ allUnitsOnMap: units }),

  updateUnitOnMap: (instanceIdToUpdate, updates) =>
    set(state => ({
      allUnitsOnMap: state.allUnitsOnMap.map(unit =>
        unit.instanceId === instanceIdToUpdate
          ? { ...unit, ...updates }
          : unit
      ),
    })),
}));

// 定数として選択肢をエクスポートしておくと便利
export const aiDifficultiesList: { value: AiDifficulty, label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
  { value: 'very_hard', label: 'Very Hard' },
];

export const factionsList: { value: Faction, label: string }[] = [
  { value: 'alpha_force', label: 'Alpha Force' },
  { value: 'bravo_corp', label: 'Bravo Corp' },
  { value: 'random', label: 'Random' },
];

export const initialCostsList: { value: InitialCost, label: string }[] = [
  { value: 300, label: '300 Cost' },
  { value: 500, label: '500 Cost (Recommended)' },
  { value: 700, label: '700 Cost' },
];