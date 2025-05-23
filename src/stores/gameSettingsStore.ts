// src/stores/gameSettingsStore.ts
import { create } from 'zustand';
import type { UnitData, UnitClassificationType } from '@/types/unit'; // UnitClassificationType をインポート
import type { MapData, StrategicPoint } from '@/types/map';
import { UNITS_MAP } from '@/gameData/units';
import { randomizeMapTerrain } from '@/lib/mapGenerator'; // ★★★ 地形生成関数をインポート ★★★

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
  ownerOverride?: 'player' | 'enemy'; // 初期配置でオーナーを強制指定する場合
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
  | 'producing'
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
  orientation: number;
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
  productionQueue?: {
    unitIdToProduce: string;
    productionCost: number;
    timeLeftMs: number;
    originalProductionTimeMs: number;
  } | null;
}

// ストアの状態の型定義
interface GameSettingsState {
  aiDifficulty: AiDifficulty;
  playerFaction: Faction;
  enemyFaction: Faction;
  initialCost: InitialCost;
  selectedMapId: string | null;
  currentMapDataState: MapData | null;

  initialDeployment: PlacedUnit[];
  allUnitsOnMap: PlacedUnit[];
  gameOverMessage: string | null;

  victoryPoints: { player: number; enemy: number };
  gameTimeElapsed: number;
  gameTimeLimit: number;
  targetVictoryPoints: number;

  playerResources: number;
  enemyResources: number;

  setAiDifficulty: (difficulty: AiDifficulty) => void;
  setPlayerFaction: (faction: Faction) => void;
  setEnemyFaction: (faction: Faction) => void;
  setInitialCost: (cost: InitialCost) => void;
  setSelectedMapId: (mapId: string | null) => void;
  setCurrentMapData: (mapData: MapData | null) => void; // 引数の型は MapData | null のまま
  setInitialDeployment: (deploymentConfig: InitialDeployedUnitConfig[], unitsDataMap: Map<string, UnitData>) => void;
  setAllUnitsOnMap: (units: PlacedUnit[]) => void;
  updateUnitOnMap: (instanceId: string, updates: Partial<Omit<PlacedUnit, 'instanceId' | 'unitId'>>) => void;
  addUnitToMap: (unit: PlacedUnit) => void;
  removeUnitFromMap: (instanceId: string) => void;
  setGameOver: (message: string) => void;
  updateStrategicPointState: (pointId: string, updates: Partial<StrategicPoint>) => void;
  addVictoryPointsToPlayer: (player: 'player' | 'enemy', points: number) => void;
  incrementGameTime: () => void;
  resetGameSessionState: () => void;

  setPlayerResources: (amount: number) => void;
  addPlayerResources: (amount: number) => void;
  setEnemyResources: (amount: number) => void;
  addEnemyResources: (amount: number) => void;

  startUnitProduction: (commanderInstanceId: string, unitIdToProduce: string, owner: 'player' | 'enemy') => { success: boolean, message: string };
  clearCommanderProductionQueue: (commanderInstanceId: string) => void;
}

export const useGameSettingsStore = create<GameSettingsState>((set, get) => ({
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
  gameTimeLimit: 30 * 60,
  targetVictoryPoints: 100,
  playerResources: 500,
  enemyResources: 500,

  setAiDifficulty: (difficulty) => set({ aiDifficulty: difficulty }),
  setPlayerFaction: (faction) => set({ playerFaction: faction }),
  setEnemyFaction: (faction) => set({ enemyFaction: faction }),
  setInitialCost: (cost) => {
    set({
      initialCost: cost,
      playerResources: cost,
      enemyResources: cost,
    });
  },
  setSelectedMapId: (mapId) => set({ selectedMapId: mapId }),

  setCurrentMapData: (baseMapDataWithOptionalHexes) => { // 引数名は baseMapData の方が適切かも
    if (!baseMapDataWithOptionalHexes) {
      set({
        currentMapDataState: null,
        gameTimeLimit: 30 * 60, // デフォルトに戻す
        targetVictoryPoints: 100, // デフォルトに戻す
        victoryPoints: { player: 0, enemy: 0 },
        gameTimeElapsed: 0,
        gameOverMessage: null,
        allUnitsOnMap: [], // マップがないならユニットも空に
        playerResources: get().initialCost, // 初期コストに戻す
        enemyResources: get().initialCost,
      });
      return;
    }

    // ★★★ 地形をランダム生成して上書き ★★★
    // randomizeMapTerrain は MapData を期待するので、型アサーションか、
    // randomizeMapTerrain の引数型を Omit<MapData, 'hexes'> | MapData のように許容する。
    // ここでは、baseMapDataWithOptionalHexes が MapData の構造を持つと仮定して渡す。
    // ただし、渡されるオブジェクトの hexes が未定義または空であることを randomizeMapTerrain が想定している。
    const mapDataWithRandomHexes = randomizeMapTerrain(baseMapDataWithOptionalHexes as MapData);

    let gameTimeLimit = 30 * 60;
    let targetVP = 100;
    // mapDataWithRandomHexes が null になることはないはずだが、念のためチェック
    if (mapDataWithRandomHexes) {
        if (mapDataWithRandomHexes.cols <= 20) { gameTimeLimit = 20 * 60; targetVP = 75; }
        else if (mapDataWithRandomHexes.cols <= 25) { gameTimeLimit = 30 * 60; targetVP = 100; }
        else { gameTimeLimit = 40 * 60; targetVP = 150; }
    }

    const currentInitialCost = get().initialCost;
    set({
      currentMapDataState: mapDataWithRandomHexes,
      gameTimeLimit: gameTimeLimit,
      targetVictoryPoints: targetVP,
      victoryPoints: { player: 0, enemy: 0 },
      gameTimeElapsed: 0,
      gameOverMessage: null,
      allUnitsOnMap: get().initialDeployment, // マップがロード/変更されたら初期配置に戻す
      playerResources: currentInitialCost,
      enemyResources: currentInitialCost,
    });
  },

  setInitialDeployment: (deploymentConfig, unitsDataMap) => {
    const placedUnits: PlacedUnit[] = deploymentConfig.map((depUnit, index) => {
      const unitDef = unitsDataMap.get(depUnit.unitId);
      const ownerType = depUnit.ownerOverride || (index % 2 === 0 ? 'player' : 'enemy');
      return {
        instanceId: `${depUnit.unitId}_${ownerType}_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`,
        unitId: depUnit.unitId,
        name: unitDef?.name || depUnit.name,
        cost: unitDef?.cost || depUnit.cost,
        position: depUnit.position,
        currentHp: unitDef?.stats.hp || 0,
        owner: ownerType,
        orientation: ownerType === 'player' ? 0 : 180,
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
        hitTimestamp: undefined,
        productionQueue: null,
      };
    });
    // initialDeployment を設定したら、allUnitsOnMap もそれに合わせるのが一般的
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
      allUnitsOnMap: state.allUnitsOnMap.map(u =>
        u.instanceId === instanceId ? { ...u, status: 'destroyed', currentHp: 0 } : u
      ),
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
        [player]: Math.max(0, state.victoryPoints[player] + points),
      },
    })),

  incrementGameTime: () => set(state => ({ gameTimeElapsed: state.gameTimeElapsed + 1 })),

  resetGameSessionState: () => {
    const currentInitialCost = get().initialCost;
    // initialDeployment はマップ選択時に設定されるため、ここではリセットしない。
    // allUnitsOnMap は initialDeployment に基づいてリセットされるべき。
    const currentInitialDeployment = get().initialDeployment;
    set({
        victoryPoints: { player: 0, enemy: 0 },
        gameTimeElapsed: 0,
        gameOverMessage: null,
        allUnitsOnMap: [...currentInitialDeployment], // 初期配置に戻す
        playerResources: currentInitialCost,
        enemyResources: currentInitialCost,
        // currentMapDataState は setCurrentMapData で管理される。
        // selectedMapId もマップ選択画面で管理される。
    });
  },

  setPlayerResources: (amount) => set({ playerResources: amount }),
  addPlayerResources: (amount) => set(state => ({ playerResources: state.playerResources + amount })),
  setEnemyResources: (amount) => set({ enemyResources: amount }),
  addEnemyResources: (amount) => set(state => ({ enemyResources: state.enemyResources + amount })),

  startUnitProduction: (commanderInstanceId, unitIdToProduce, owner) => {
    const commander = get().allUnitsOnMap.find(u => u.instanceId === commanderInstanceId);
    const unitDef = UNITS_MAP.get(unitIdToProduce);
    let currentResources: number;
    let addResourcesAction: (amount: number) => void;

    if (owner === 'player') {
      currentResources = get().playerResources;
      addResourcesAction = get().addPlayerResources;
    } else {
      currentResources = get().enemyResources;
      addResourcesAction = get().addEnemyResources;
    }

    if (!commander || commander.owner !== owner) return { success: false, message: "Invalid commander or owner." };
    if (!unitDef) return { success: false, message: "Invalid unit to produce." };
    if (commander.productionQueue) return { success: false, message: "Commander is already producing." };
    if (currentResources < unitDef.cost) return { success: false, message: "Not enough resources." };

    const productionTimeMs = unitDef.productionTime * 1000;
    addResourcesAction(-unitDef.cost);

    set(state => ({
      allUnitsOnMap: state.allUnitsOnMap.map(u =>
        u.instanceId === commanderInstanceId
          ? {
              ...u,
              productionQueue: {
                unitIdToProduce,
                productionCost: unitDef.cost,
                timeLeftMs: productionTimeMs,
                originalProductionTimeMs: productionTimeMs,
              },
            }
          : u
      ),
    }));
    return { success: true, message: `Started producing ${unitDef.name} for ${owner}` };
  },

  clearCommanderProductionQueue: (commanderInstanceId: string) => {
    set(state => ({
      allUnitsOnMap: state.allUnitsOnMap.map(u =>
        u.instanceId === commanderInstanceId
          ? { ...u, productionQueue: null }
          : u
      ),
    }));
  },
}));

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