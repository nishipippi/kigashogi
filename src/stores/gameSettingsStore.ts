// src/stores/gameSettingsStore.ts
import { create } from 'zustand';
import type { UnitData } from '@/types/unit';
import type { MapData, StrategicPoint } from '@/types/map'; // MapData と StrategicPoint をインポート

// AI難易度の型
export type AiDifficulty = 'easy' | 'normal' | 'hard' | 'very_hard';
// 勢力の型
export type Faction = 'alpha_force' | 'bravo_corp' | 'random';
// 初期コストの型
export type InitialCost = 300 | 500 | 700 | number;

// 初期配置画面から渡されるユニット設定データの型
export interface InitialDeployedUnitConfig {
  unitId: string;
  name: string;
  cost: number;
  position: { x: number; y: number };
}

// ユニットの取りうる状態
export type UnitStatus =
  | 'idle'
  | 'moving'
  | 'turning'
  | 'aiming'
  | 'attacking_he'
  | 'attacking_ap'
  | 'reloading_he'
  | 'reloading_ap'
  | 'destroyed';

// ゲームプレイ中にマップ上に存在するユニットインスタンスの型
export interface PlacedUnit {
  instanceId: string;
  unitId: string;
  name: string;
  cost: number;
  position: { x: number; y: number };
  currentHp: number;
  owner: 'player' | 'enemy';
  orientation: number; // 0-359 degrees
  targetOrientation?: number;
  isTurning?: boolean;
  isMoving?: boolean;
  moveTargetPosition?: { x: number; y: number } | null;
  currentPath?: { x: number; y: number }[] | null;
  timeToNextHex?: number | null;
  attackTargetInstanceId?: string | null;
  status?: UnitStatus;
  lastAttackTimeHE?: number;
  lastAttackTimeAP?: number;
  justHit?: boolean;
  hitTimestamp?: number;
}

// ストアの状態の型定義
interface GameSettingsState {
  aiDifficulty: AiDifficulty;
  playerFaction: Faction;
  enemyFaction: Faction;
  initialCost: InitialCost;
  selectedMapId: string | null;
  currentMapDataState: MapData | null; // ★ 現在のマップデータ (戦略拠点情報含む)

  initialDeployment: PlacedUnit[];
  allUnitsOnMap: PlacedUnit[];
  gameOverMessage?: string | null;

  setAiDifficulty: (difficulty: AiDifficulty) => void;
  setPlayerFaction: (faction: Faction) => void;
  setEnemyFaction: (faction: Faction) => void;
  setInitialCost: (cost: InitialCost) => void;
  setSelectedMapId: (mapId: string | null) => void;
  setCurrentMapData: (mapData: MapData | null) => void; // ★ マップデータ設定用
  setInitialDeployment: (deploymentConfig: InitialDeployedUnitConfig[], unitsDataMap: Map<string, UnitData>) => void;
  setAllUnitsOnMap: (units: PlacedUnit[]) => void;
  updateUnitOnMap: (instanceId: string, updates: Partial<Omit<PlacedUnit, 'instanceId' | 'unitId'>>) => void;
  updateStrategicPointOwner: (pointId: string, newOwner: StrategicPoint['owner']) => void; // ★ 戦略拠点所有者更新
  setGameOver: (message: string) => void;
}

export const useGameSettingsStore = create<GameSettingsState>((set, get) => ({
  aiDifficulty: 'normal',
  playerFaction: 'alpha_force',
  enemyFaction: 'bravo_corp',
  initialCost: 500,
  selectedMapId: null,
  currentMapDataState: null, // ★ 初期値

  initialDeployment: [],
  allUnitsOnMap: [],
  gameOverMessage: null,

  setAiDifficulty: (difficulty) => set({ aiDifficulty: difficulty }),
  setPlayerFaction: (faction) => set({ playerFaction: faction }),
  setEnemyFaction: (faction) => set({ enemyFaction: faction }),
  setInitialCost: (cost) => set({ initialCost: cost }),
  setSelectedMapId: (mapId) => set({ selectedMapId: mapId }),
  setCurrentMapData: (mapData) => set({ currentMapDataState: mapData }), // ★

  setInitialDeployment: (deploymentConfig, unitsDataMap) => {
    const placedUnits: PlacedUnit[] = deploymentConfig.map((depUnit, index) => {
      const unitDef = unitsDataMap.get(depUnit.unitId);
      return {
        instanceId: `${depUnit.unitId}_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`,
        unitId: depUnit.unitId,
        name: unitDef?.name || depUnit.name,
        cost: unitDef?.cost || depUnit.cost,
        position: depUnit.position,
        currentHp: unitDef?.stats.hp || 0,
        owner: 'player',
        orientation: 0,
        isTurning: false,
        isMoving: false,
        moveTargetPosition: null,
        currentPath: null,
        timeToNextHex: null,
        attackTargetInstanceId: null,
        status: 'idle',
        lastAttackTimeHE: undefined,
        lastAttackTimeAP: undefined,
        justHit: false,
        hitTimestamp: 0,
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

  updateStrategicPointOwner: (pointId, newOwner) => // ★
    set(state => {
      if (!state.currentMapDataState || !state.currentMapDataState.strategicPoints) {
        return {}; // currentMapDataState が null なら何もしない
      }
      const updatedStrategicPoints = state.currentMapDataState.strategicPoints.map(sp =>
        sp.id === pointId ? { ...sp, owner: newOwner, captureProgress: newOwner === 'neutral' ? 0 : (newOwner ? 100 : 0) } : sp
      );
      return {
        currentMapDataState: {
          ...state.currentMapDataState,
          strategicPoints: updatedStrategicPoints,
        },
      };
    }),

  setGameOver: (message) => set({ gameOverMessage: message }),
}));

// 定数として選択肢をエクスポート
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