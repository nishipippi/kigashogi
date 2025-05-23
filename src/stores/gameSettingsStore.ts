// src/stores/gameSettingsStore.ts
import { create } from 'zustand';
import type { UnitData, UnitClassificationType } from '@/types/unit';
import type { MapData, StrategicPoint, HexData, TerrainType } from '@/types/map';
import { randomizeMapTerrain } from '@/lib/mapGenerator';
import { UNITS_MAP } from '@/gameData/units';

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
  name: string; // ユニット名 (UnitDataからコピー)
  cost: number; // コスト (UnitDataからコピー)
  position: { x: number; y: number }; // 論理座標
  currentHp: number;
  owner: 'player' | 'enemy';
  orientation: number; // 0-359 degrees
  targetOrientation?: number;
  isTurning?: boolean;
  isMoving?: boolean;
  moveTargetPosition?: { x: number; y: number } | null;
  currentPath?: { x: number; y: number }[] | null; // 論理座標のパス
  timeToNextHex?: number | null; // ms
  attackTargetInstanceId?: string | null;
  status?: UnitStatus;
  lastAttackTimeHE?: number; // HE武器の最後の攻撃開始時刻 (リロード管理用)
  lastAttackTimeAP?: number; // AP武器の最後の攻撃開始時刻 (リロード管理用)
  lastSuccessfulAttackTimestamp?: number; // 最後に攻撃が成功した(または試みた)時刻 (発見ペナルティ用)
  justHit?: boolean; // 被弾直後か
  hitTimestamp?: number; // 被弾した時刻 (被弾エフェクト表示用)
  // Production related (for commander units)
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

  initialDeployment: PlacedUnit[]; // ゲーム開始時の初期配置ユニット
  allUnitsOnMap: PlacedUnit[];     // 現在マップ上に存在する全ユニットの動的状態
  gameOverMessage: string | null;

  victoryPoints: { player: number; enemy: number };
  gameTimeElapsed: number; // seconds
  gameTimeLimit: number;   // seconds
  targetVictoryPoints: number;

  playerResources: number;
  enemyResources: number;

  // アクション
  setAiDifficulty: (difficulty: AiDifficulty) => void;
  setPlayerFaction: (faction: Faction) => void;
  setEnemyFaction: (faction: Faction) => void;
  setInitialCost: (cost: InitialCost) => void;
  setSelectedMapId: (mapId: string | null) => void;
  setCurrentMapData: (baseMapDataWithOptionalHexes: Omit<MapData, 'hexes'> & { hexes?: Record<string, HexData> } | null) => void;
  setInitialDeployment: (deploymentConfig: InitialDeployedUnitConfig[], unitsDataMap: Map<string, UnitData>) => void;
  setAllUnitsOnMap: (units: PlacedUnit[]) => void; // 直接全ユニットを置き換える (デバッグ用など)
  updateUnitOnMap: (instanceId: string, updates: Partial<Omit<PlacedUnit, 'instanceId' | 'unitId' | 'name' | 'cost'>>) => void; // ID,unitId,name,cost以外を更新
  addUnitToMap: (unit: PlacedUnit) => void;
  removeUnitFromMap: (instanceId: string) => void; // (現状未使用だが、破壊処理は直接filterしている)
  setGameOver: (message: string) => void;
  updateStrategicPointState: (pointId: string, updates: Partial<Omit<StrategicPoint, 'id' | 'x' | 'y' | 'name'>>) => void;
  addVictoryPointsToPlayer: (player: 'player' | 'enemy', points: number) => void;
  incrementGameTime: () => void;
  resetGameSessionState: () => void; // ゲームセッション全体をリセット

  setPlayerResources: (amount: number) => void;
  addPlayerResources: (amount: number) => void;
  setEnemyResources: (amount: number) => void;
  addEnemyResources: (amount: number) => void;

  startUnitProduction: (commanderInstanceId: string, unitIdToProduce: string, owner: 'player' | 'enemy') => { success: boolean, message: string };
  clearCommanderProductionQueue: (commanderInstanceId: string) => void;
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
  gameTimeLimit: 30 * 60,
  targetVictoryPoints: 100,
  playerResources: 500, // initialCostで初期化されるべきだが、フォールバック
  enemyResources: 500,  // 同上

  // アクションの実装
  setAiDifficulty: (difficulty) => set({ aiDifficulty: difficulty }),
  setPlayerFaction: (faction) => set({ playerFaction: faction }),
  setEnemyFaction: (faction) => set({ enemyFaction: faction }),
  setInitialCost: (cost) => set({ initialCost: cost, playerResources: cost, enemyResources: cost }), // コスト設定時にリソースも初期化
  setSelectedMapId: (mapId) => set({ selectedMapId: mapId }),

  setCurrentMapData: (baseMapDataWithOptionalHexes) => {
    if (!baseMapDataWithOptionalHexes) {
      set({
        currentMapDataState: null,
        victoryPoints: { player: 0, enemy: 0 }, gameTimeElapsed: 0, gameOverMessage: null,
        allUnitsOnMap: [], initialDeployment: [], // マップがないならユニットもクリア
        playerResources: get().initialCost, enemyResources: get().initialCost,
      });
      return;
    }

    const mapDataWithRandomHexes = randomizeMapTerrain(baseMapDataWithOptionalHexes as MapData);

    let gameTimeLimitValue = 30 * 60;
    let targetVPValue = 100;
    if (mapDataWithRandomHexes) {
        if (mapDataWithRandomHexes.cols <= 20) { gameTimeLimitValue = 20 * 60; targetVPValue = 75; }
        else if (mapDataWithRandomHexes.cols <= 25) { gameTimeLimitValue = 30 * 60; targetVPValue = 100; }
        else { gameTimeLimitValue = 40 * 60; targetVPValue = 150; }
    }
    set({
      currentMapDataState: mapDataWithRandomHexes,
      gameTimeLimit: gameTimeLimitValue,
      targetVictoryPoints: targetVPValue,
      victoryPoints: { player: 0, enemy: 0 },
      gameTimeElapsed: 0,
      gameOverMessage: null,
      // allUnitsOnMap は initialDeployment がセットされた後にそれを反映する
      // initialDeployment は setCurrentMapData の後、unit-deployment画面でセットされる想定
      allUnitsOnMap: get().initialDeployment, // 既存の初期配置を使うか、空にするかはゲームフローによる
      playerResources: get().initialCost,
      enemyResources: get().initialCost,
    });
  },

  setInitialDeployment: (deploymentConfig, unitsDataMap) => {
    const placedUnits: PlacedUnit[] = deploymentConfig.map((depUnitConf, index) => {
      const unitDef = unitsDataMap.get(depUnitConf.unitId);
      if (!unitDef) {
        console.error(`Unit definition not found for id: ${depUnitConf.unitId}`);
        // 適切なフォールバックやエラー処理
        // ここではnullを返してfilterで除外するか、デフォルトユニットを作る
        return null;
      }
      // AI対戦モードでは、半分を敵に割り当てるなどのロジックが必要
      // ここでは簡易的に、indexの偶奇で割り振る。実際はゲームモードに応じて変更。
      const ownerType = index % 2 === 0 ? 'player' : 'enemy';

      return {
        instanceId: `${depUnitConf.unitId}_${ownerType}_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`,
        unitId: depUnitConf.unitId,
        name: unitDef.name,
        cost: unitDef.cost,
        position: depUnitConf.position,
        currentHp: unitDef.stats.hp,
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
        lastSuccessfulAttackTimestamp: undefined, // ★★★ 初期化 ★★★
        justHit: false,
        hitTimestamp: undefined,
        productionQueue: null,
      };
    }).filter(unit => unit !== null) as PlacedUnit[]; // nullを除去
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

  addUnitToMap: (unit) => {
    const unitWithDefaults: PlacedUnit = {
        ...unit, // 渡されたユニット情報をベースに
        // 不足しているかもしれないプロパティのデフォルト値を設定
        isTurning: unit.isTurning ?? false,
        isMoving: unit.isMoving ?? false,
        moveTargetPosition: unit.moveTargetPosition ?? null,
        currentPath: unit.currentPath ?? null,
        timeToNextHex: unit.timeToNextHex ?? null,
        attackTargetInstanceId: unit.attackTargetInstanceId ?? null,
        status: unit.status ?? 'idle',
        lastAttackTimeHE: unit.lastAttackTimeHE ?? undefined,
        lastAttackTimeAP: unit.lastAttackTimeAP ?? undefined,
        lastSuccessfulAttackTimestamp: unit.lastSuccessfulAttackTimestamp ?? undefined, // ★★★ 初期化 ★★★
        justHit: unit.justHit ?? false,
        hitTimestamp: unit.hitTimestamp ?? undefined,
        productionQueue: unit.productionQueue ?? null,
    };
    set(state => ({ allUnitsOnMap: [...state.allUnitsOnMap, unitWithDefaults] }));
  },

  removeUnitFromMap: (instanceId) =>
    set(state => ({
      allUnitsOnMap: state.allUnitsOnMap.filter(u => u.instanceId !== instanceId),
    })),

  setGameOver: (message) => {
    if (!get().gameOverMessage) { // まだゲームオーバーでない場合のみセット
        set({ gameOverMessage: message });
    }
  },

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
    set(state => {
      if (state.gameOverMessage) return {}; // ゲームオーバーならVP加算しない
      return {
        victoryPoints: {
          ...state.victoryPoints,
          [player]: state.victoryPoints[player] + points,
        },
      };
    }),

  incrementGameTime: () => set(state => {
      if (state.gameOverMessage) return {}; // ゲームオーバーなら時間進行しない
      return { gameTimeElapsed: state.gameTimeElapsed + 1 };
  }),

  resetGameSessionState: () => set(state => ({ // get() の代わりに引数 state を使う
    victoryPoints: { player: 0, enemy: 0 },
    gameTimeElapsed: 0,
    gameOverMessage: null,
    allUnitsOnMap: state.initialDeployment, // 初期配置に戻す
    playerResources: state.initialCost,
    enemyResources: state.initialCost,
    // currentMapDataState は selectedMapId に基づいて再ロードされるのでここではリセットしないか、
    // または、ゲームモード選択に戻るなら selectedMapId も null にする
    // selectedMapId: null,
    // currentMapDataState: null,
  })),

  setPlayerResources: (amount) => set({ playerResources: amount }),
  addPlayerResources: (amount) => set(state => ({ playerResources: Math.max(0, state.playerResources + amount) })), // マイナスにならないように
  setEnemyResources: (amount) => set({ enemyResources: amount }),
  addEnemyResources: (amount) => set(state => ({ enemyResources: Math.max(0, state.enemyResources + amount) })), // マイナスにならないように

  startUnitProduction: (commanderInstanceId, unitIdToProduce, owner) => {
    const commander = get().allUnitsOnMap.find(u => u.instanceId === commanderInstanceId);
    const unitDef = UNITS_MAP.get(unitIdToProduce);
    const currentResources = owner === 'player' ? get().playerResources : get().enemyResources;

    if (!commander || commander.owner !== owner) return { success: false, message: "Invalid commander or owner." };
    if (!unitDef) return { success: false, message: "Invalid unit to produce." };
    if (commander.productionQueue) return { success: false, message: "Commander is already producing." };
    if (currentResources < unitDef.cost) return { success: false, message: "Not enough resources." };

    const productionTimeMs = unitDef.productionTime * 1000;

    if (owner === 'player') {
        get().addPlayerResources(-unitDef.cost);
    } else {
        get().addEnemyResources(-unitDef.cost);
    }

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
              status: 'producing', // 生産中ステータス
            }
          : u
      ),
    }));
    return { success: true, message: `Started producing ${unitDef.name} for ${owner}` };
  },

  clearCommanderProductionQueue: (commanderInstanceId) => {
    set(state => ({
      allUnitsOnMap: state.allUnitsOnMap.map(u =>
        u.instanceId === commanderInstanceId
          ? { ...u, productionQueue: null, status: 'idle' } // アイドルに戻す
          : u
      ),
    }));
  },
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