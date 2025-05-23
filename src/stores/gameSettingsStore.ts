// src/stores/gameSettingsStore.ts
import { create } from 'zustand';
import type { UnitData } from '@/types/unit';
import type { MapData, StrategicPoint } from '@/types/map';

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
  | 'producing' // 生産中 (司令官ユニット用)
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
  orientation: number; // 0-359 degrees, 0 is typically right or up based on game convention
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
  // Production related (for commander units)
  productionQueue?: { unitIdToProduce: string; timeLeftMs: number; originalProductionTimeMs: number } | null;
}

// ストアの状態の型定義
interface GameSettingsState {
  aiDifficulty: AiDifficulty;
  playerFaction: Faction;
  enemyFaction: Faction;
  initialCost: InitialCost;
  selectedMapId: string | null;
  currentMapDataState: MapData | null; // 戦略拠点情報も含む現在のマップデータ

  initialDeployment: PlacedUnit[];
  allUnitsOnMap: PlacedUnit[];
  gameOverMessage: string | null;

  victoryPoints: { player: number; enemy: number };
  gameTimeElapsed: number; // seconds
  gameTimeLimit: number;   // seconds
  targetVictoryPoints: number;

  // アクション
  setAiDifficulty: (difficulty: AiDifficulty) => void;
  setPlayerFaction: (faction: Faction) => void;
  setEnemyFaction: (faction: Faction) => void;
  setInitialCost: (cost: InitialCost) => void;
  setSelectedMapId: (mapId: string | null) => void;
  setCurrentMapData: (mapData: MapData | null) => void;
  setInitialDeployment: (deploymentConfig: InitialDeployedUnitConfig[], unitsDataMap: Map<string, UnitData>) => void;
  setAllUnitsOnMap: (units: PlacedUnit[]) => void;
  updateUnitOnMap: (instanceId: string, updates: Partial<Omit<PlacedUnit, 'instanceId' | 'unitId'>>) => void;
  addUnitToMap: (unit: PlacedUnit) => void; // ユニット生産完了時などに追加
  removeUnitFromMap: (instanceId: string) => void; // ユニット破壊時（直接操作する代わりにアクションを用意）
  setGameOver: (message: string) => void;
  updateStrategicPointState: (pointId: string, updates: Partial<StrategicPoint>) => void;
  addVictoryPointsToPlayer: (player: 'player' | 'enemy', points: number) => void;
  incrementGameTime: () => void;
  resetGameSessionState: () => void;
}

export const useGameSettingsStore = create<GameSettingsState>((set, get) => ({
  // 初期状態
  aiDifficulty: 'normal',
  playerFaction: 'alpha_force',
  enemyFaction: 'bravo_corp',
  initialCost: 500,
  selectedMapId: null,
  currentMapDataState: null,
  initialDeployment: [],
  allUnitsOnMap: [],
  gameOverMessage: null,
  victoryPoints: { player: 0, enemy: 0 },
  gameTimeElapsed: 0,
  gameTimeLimit: 30 * 60,  // Default 30 minutes
  targetVictoryPoints: 100, // Default 100 VP

  // アクションの実装
  setAiDifficulty: (difficulty) => set({ aiDifficulty: difficulty }),
  setPlayerFaction: (faction) => set({ playerFaction: faction }),
  setEnemyFaction: (faction) => set({ enemyFaction: faction }),
  setInitialCost: (cost) => set({ initialCost: cost }),
  setSelectedMapId: (mapId) => set({ selectedMapId: mapId }),

  setCurrentMapData: (mapData) => {
    let gameTimeLimit = 30 * 60;
    let targetVP = 100;
    if (mapData) {
        if (mapData.cols <= 20) { gameTimeLimit = 20 * 60; targetVP = 75; }
        else if (mapData.cols <= 25) { gameTimeLimit = 30 * 60; targetVP = 100; }
        else { gameTimeLimit = 40 * 60; targetVP = 150; }
    }
    set({
      currentMapDataState: mapData,
      gameTimeLimit: gameTimeLimit,
      targetVictoryPoints: targetVP,
      // Reset session-specific states when map changes
      victoryPoints: { player: 0, enemy: 0 },
      gameTimeElapsed: 0,
      gameOverMessage: null,
      allUnitsOnMap: get().initialDeployment, // Reset units to initial deployment
    });
  },

  setInitialDeployment: (deploymentConfig, unitsDataMap) => {
    const placedUnits: PlacedUnit[] = deploymentConfig.map((depUnit, index) => {
      const unitDef = unitsDataMap.get(depUnit.unitId);
      const ownerType = index % 2 === 0 ? 'player' : 'enemy'; // Test: alternate owner
      return {
        instanceId: `${depUnit.unitId}_${ownerType}_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`,
        unitId: depUnit.unitId,
        name: unitDef?.name || depUnit.name,
        cost: unitDef?.cost || depUnit.cost,
        position: depUnit.position,
        currentHp: unitDef?.stats.hp || 0,
        owner: ownerType,
        orientation: ownerType === 'player' ? 0 : 180, // Example: 0 for right, 180 for left
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
        productionQueue: null,
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

  addUnitToMap: (unit) => set(state => ({ allUnitsOnMap: [...state.allUnitsOnMap, unit] })),

  removeUnitFromMap: (instanceId) =>
    set(state => ({
      allUnitsOnMap: state.allUnitsOnMap.filter(u => u.instanceId !== instanceId),
    })),

  setGameOver: (message) => set({ gameOverMessage: message }),

  updateStrategicPointState: (pointId, updates) =>
    set(state => {
      if (!state.currentMapDataState || !state.currentMapDataState.strategicPoints) return {};
      const updatedStrategicPoints = state.currentMapDataState.strategicPoints.map(sp =>
        sp.id === pointId ? { ...sp, ...updates } : sp
      );
      return {
        currentMapDataState: { ...state.currentMapDataState, strategicPoints: updatedStrategicPoints },
      };
    }),

  addVictoryPointsToPlayer: (player, points) =>
    set(state => ({
      victoryPoints: {
        ...state.victoryPoints,
        [player]: state.victoryPoints[player] + points,
      },
    })),

  incrementGameTime: () => set(state => ({ gameTimeElapsed: state.gameTimeElapsed + 1 })),

  resetGameSessionState: () => set({
    victoryPoints: { player: 0, enemy: 0 },
    gameTimeElapsed: 0,
    gameOverMessage: null,
    allUnitsOnMap: get().initialDeployment, // Reset units to the initial deployment of the current map
    // currentMapDataState should ideally be reset or reloaded when a new game starts,
    // which is handled by setCurrentMapData.
  }),
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