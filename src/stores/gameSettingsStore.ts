// src/stores/gameSettingsStore.ts
import { create } from 'zustand';
import type { UnitData, UnitClassificationType } from '@/types/unit';
import type { MapData, StrategicPoint, HexData, TerrainType } from '@/types/map';
import { randomizeMapTerrain } from '@/lib/mapGenerator';
import { UNITS_MAP, ALL_UNITS } from '@/gameData/units'; // ALL_UNITS もインポート

// AI難易度の型
export type AiDifficulty = 'easy' | 'normal' | 'hard' | 'very_hard';
// 勢力の型
export type Faction = 'alpha_force' | 'bravo_corp' | 'random';
// 初期コストの型
export type InitialCost = 300 | 500 | 700 | number;

// 初期配置画面から渡されるユニット設定データの型
export interface InitialDeployedUnitConfig {
  unitId: string;
  name: string; // 表示名 (ユニット選択リストで使うため)
  cost: number; // コスト (ユニット選択リストで使うため)
  position: { x: number; y: number }; // 論理座標
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
  lastSuccessfulAttackTimestamp?: number;
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
  setCurrentMapData: (baseMapDataWithOptionalHexes: Omit<MapData, 'hexes'> & { hexes?: Record<string, HexData> } | null) => void;
  setInitialDeployment: (deploymentConfig: InitialDeployedUnitConfig[], unitsDataMap: Map<string, UnitData>) => void;
  setAllUnitsOnMap: (units: PlacedUnit[]) => void;
  updateUnitOnMap: (instanceId: string, updates: Partial<Omit<PlacedUnit, 'instanceId' | 'unitId' | 'name' | 'cost'>>) => void;
  addUnitToMap: (unit: PlacedUnit) => void;
  removeUnitFromMap: (instanceId: string) => void;
  setGameOver: (message: string) => void;
  updateStrategicPointState: (pointId: string, updates: Partial<Omit<StrategicPoint, 'id' | 'x' | 'y' | 'name'>>) => void;
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
  setInitialCost: (cost) => set({ initialCost: cost, playerResources: cost, enemyResources: cost }),
  setSelectedMapId: (mapId) => set({ selectedMapId: mapId }),

  setCurrentMapData: (baseMapDataWithOptionalHexes) => {
    if (!baseMapDataWithOptionalHexes) {
      set({
        currentMapDataState: null,
      });
      console.log('[Store] setCurrentMapData: Cleared currentMapDataState.');
      return;
    }
    const mapDataToProcess = typeof baseMapDataWithOptionalHexes === 'object' && baseMapDataWithOptionalHexes !== null 
        ? baseMapDataWithOptionalHexes 
        : { id: 'unknown', name: 'Unknown Map', cols: 20, rows: 10, deploymentAreas: { player: [], enemy: []}}; 

    const mapDataWithRandomHexes = randomizeMapTerrain(mapDataToProcess as MapData);
    let gameTimeLimitValue = 30 * 60;
    let targetVPValue = 100;

    if (mapDataWithRandomHexes && mapDataWithRandomHexes.cols !== undefined) { 
        if (mapDataWithRandomHexes.cols <= 20) { gameTimeLimitValue = 20 * 60; targetVPValue = 75; }
        else if (mapDataWithRandomHexes.cols <= 25) { gameTimeLimitValue = 30 * 60; targetVPValue = 100; }
        else { gameTimeLimitValue = 40 * 60; targetVPValue = 150; }
    }
    
    set(state => ({ 
      currentMapDataState: mapDataWithRandomHexes,
      gameTimeLimit: gameTimeLimitValue,
      targetVictoryPoints: targetVPValue,
    }));
    console.log('[Store] setCurrentMapData: Updated map data and map-specific settings for:', mapDataWithRandomHexes.id);
  },

  setInitialDeployment: (deploymentConfig, unitsDataMap) => {
    const playerDeployedUnits: PlacedUnit[] = deploymentConfig.map((depUnitConf, index) => {
      const unitDef = unitsDataMap.get(depUnitConf.unitId);
      if (!unitDef) {
        console.error(`[setInitialDeployment] Unit definition not found for id: ${depUnitConf.unitId}`);
        return null;
      }
      const ownerType = 'player';
      return {
        instanceId: `${depUnitConf.unitId}_${ownerType}_player_${index}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        unitId: depUnitConf.unitId,
        name: unitDef.name,
        cost: unitDef.cost,
        position: depUnitConf.position,
        currentHp: unitDef.stats.hp,
        owner: ownerType,
        orientation: 0, 
        isTurning: false, isMoving: false, moveTargetPosition: null, currentPath: null, timeToNextHex: null,
        attackTargetInstanceId: null, status: 'idle', lastAttackTimeHE: undefined, lastAttackTimeAP: undefined,
        lastSuccessfulAttackTimestamp: undefined, justHit: false, hitTimestamp: undefined, productionQueue: null,
      };
    }).filter(unit => unit !== null) as PlacedUnit[];

    const aiDeployedUnits: PlacedUnit[] = [];
    const currentMap = get().currentMapDataState; 

    if (currentMap && currentMap.deploymentAreas && currentMap.deploymentAreas.enemy && currentMap.deploymentAreas.enemy.length > 0) {
      const aiCommanderDef = ALL_UNITS.find(u => u.isCommander);
      if (aiCommanderDef) {
        let aiCommanderPos: { x: number; y: number } | undefined = undefined;
        const enemyDeployArea = [...currentMap.deploymentAreas.enemy]; 
        
        const occupiedByPlayer = new Set(playerDeployedUnits.map(p => `${p.position.x},${p.position.y}`));
        const availableForAICommander = enemyDeployArea.filter(spot => !occupiedByPlayer.has(`${spot.x},${spot.y}`));

        if (availableForAICommander.length > 0) {
            const mapCenterY = currentMap.rows / 2; 
            availableForAICommander.sort((a, b) => {
                if (a.x !== b.x) return b.x - a.x; 
                return Math.abs(a.y - mapCenterY) - Math.abs(b.y - mapCenterY); 
            });
            aiCommanderPos = availableForAICommander[0]; 
        }

        if (aiCommanderPos) {
          aiDeployedUnits.push({
            instanceId: `${aiCommanderDef.id}_enemy_ai_commander_0_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            unitId: aiCommanderDef.id, name: aiCommanderDef.name, cost: aiCommanderDef.cost,
            position: aiCommanderPos, currentHp: aiCommanderDef.stats.hp, owner: 'enemy', orientation: 180,
            isTurning: false, isMoving: false, moveTargetPosition: null, currentPath: null, timeToNextHex: null,
            attackTargetInstanceId: null, status: 'idle', lastAttackTimeHE: undefined, lastAttackTimeAP: undefined,
            lastSuccessfulAttackTimestamp: undefined, justHit: false, hitTimestamp: undefined, productionQueue: null,
          });

          let availableSpotsForAIInfantry = enemyDeployArea.filter(spot =>
            !(spot.x === aiCommanderPos!.x && spot.y === aiCommanderPos!.y) && 
            !occupiedByPlayer.has(`${spot.x},${spot.y}`)
          );

          const rifleDef = unitsDataMap.get('rifle_infantry');
          if (rifleDef) {
            for (let i = 0; i < 2; i++) { 
              if (availableSpotsForAIInfantry.length > 0) {
                const infantryPosIndex = Math.floor(Math.random() * availableSpotsForAIInfantry.length);
                const infantryPos = availableSpotsForAIInfantry.splice(infantryPosIndex, 1)[0]; 
                
                if (infantryPos) {
                    aiDeployedUnits.push({
                        instanceId: `rifle_infantry_enemy_ai_${i + 1}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                        unitId: 'rifle_infantry', name: rifleDef.name, cost: rifleDef.cost,
                        position: infantryPos, currentHp: rifleDef.stats.hp, owner: 'enemy', orientation: 180,
                        isTurning: false, isMoving: false, moveTargetPosition: null, currentPath: null, timeToNextHex: null,
                        attackTargetInstanceId: null, status: 'idle', lastAttackTimeHE: undefined, lastAttackTimeAP: undefined,
                        lastSuccessfulAttackTimestamp: undefined, justHit: false, hitTimestamp: undefined, productionQueue: null,
                    });
                }
              } else {
                console.warn("[setInitialDeployment] Not enough unique deployment spots for AI rifle infantry.");
                break;
              }
            }
          }
        } else {
          console.error("[setInitialDeployment] AI Commander could not be placed. No suitable (non-player-occupied) deployment spot found.");
        }
      } else {
        console.error("[setInitialDeployment] Commander unit definition not found in ALL_UNITS for AI deployment.");
      }
    } else {
      console.error("[setInitialDeployment] AI deployment area not defined or empty in map data, or currentMapDataState not loaded when setInitialDeployment was called.");
    }

    const allInitialUnits = [...playerDeployedUnits, ...aiDeployedUnits];
    const aiCommanderDef = ALL_UNITS.find(ud => ud.isCommander); // Re-check for logging
    if (!aiDeployedUnits.some(u => u.unitId === aiCommanderDef?.id) && aiCommanderDef) { 
        console.error("CRITICAL: AI Commander was NOT deployed (or definition missing)! This will lead to immediate player win if not fixed.");
    } else if (aiCommanderDef) {
        console.log(`[setInitialDeployment] AI Commander successfully added to aiDeployedUnits. Total AI units: ${aiDeployedUnits.length}`);
    }
    
    set({ 
        initialDeployment: [...allInitialUnits], 
        allUnitsOnMap: [...allInitialUnits],      
        victoryPoints: { player: 0, enemy: 0 },
        gameTimeElapsed: 0,
        gameOverMessage: null,
        playerResources: get().initialCost, 
        enemyResources: get().initialCost,  
    });
    console.log('[Store] setInitialDeployment: Completed. Total units:', allInitialUnits.length, 'Player units:', playerDeployedUnits.length);
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
        ...unit,
        isTurning: unit.isTurning ?? false,
        isMoving: unit.isMoving ?? false,
        moveTargetPosition: unit.moveTargetPosition ?? null,
        currentPath: unit.currentPath ?? null,
        timeToNextHex: unit.timeToNextHex ?? null,
        attackTargetInstanceId: unit.attackTargetInstanceId ?? null,
        status: unit.status ?? 'idle',
        lastAttackTimeHE: unit.lastAttackTimeHE ?? undefined,
        lastAttackTimeAP: unit.lastAttackTimeAP ?? undefined,
        lastSuccessfulAttackTimestamp: unit.lastSuccessfulAttackTimestamp ?? undefined,
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
    if (!get().gameOverMessage) {
        console.log(`Game Over condition met: ${message}`);
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
      if (state.gameOverMessage) return {}; 
      const newVP = state.victoryPoints[player] + points;
      // console.log(`Adding ${points} VP to ${player}. New total: ${newVP}`);
      return {
        victoryPoints: {
          ...state.victoryPoints,
          [player]: newVP,
        },
      };
    }),
  incrementGameTime: () => set(state => {
      if (state.gameOverMessage) return {};
      return { gameTimeElapsed: state.gameTimeElapsed + 1 };
  }),
  resetGameSessionState: () => {
    console.log('[Store] resetGameSessionState: Called. Clearing session and unit data.');
    set(state => ({
    victoryPoints: { player: 0, enemy: 0 },
    gameTimeElapsed: 0,
    gameOverMessage: null,
    initialDeployment: [], 
    allUnitsOnMap: [],    
    playerResources: state.initialCost, 
    enemyResources: state.initialCost,
  }))},

  setPlayerResources: (amount) => set({ playerResources: amount }),
  addPlayerResources: (amount) => set(state => ({ playerResources: Math.max(0, state.playerResources + amount) })),
  setEnemyResources: (amount) => set({ enemyResources: amount }),
  addEnemyResources: (amount) => set(state => ({ enemyResources: Math.max(0, state.enemyResources + amount) })),

  startUnitProduction: (commanderInstanceId, unitIdToProduce, owner) => {
    const commander = get().allUnitsOnMap.find(u => u.instanceId === commanderInstanceId);
    const unitDef = UNITS_MAP.get(unitIdToProduce);
    const currentResources = owner === 'player' ? get().playerResources : get().enemyResources;

    if (!commander || commander.owner !== owner) return { success: false, message: "Invalid commander or owner." };
    if (!unitDef) return { success: false, message: "Invalid unit to produce." };
    if (commander.productionQueue) return { success: false, message: "Commander is already producing." };
    if (currentResources < unitDef.cost) return { success: false, message: "Not enough resources." };

    const productionTimeMs = unitDef.productionTime * 1000;
    if (owner === 'player') get().addPlayerResources(-unitDef.cost);
    else get().addEnemyResources(-unitDef.cost);

    set(state => ({
      allUnitsOnMap: state.allUnitsOnMap.map(u =>
        u.instanceId === commanderInstanceId
          ? { ...u, productionQueue: { unitIdToProduce, productionCost: unitDef.cost, timeLeftMs: productionTimeMs, originalProductionTimeMs: productionTimeMs }, status: 'producing' }
          : u
      ),
    }));
    return { success: true, message: `Started producing ${unitDef.name} for ${owner}` };
  },
  clearCommanderProductionQueue: (commanderInstanceId) => {
    set(state => ({
      allUnitsOnMap: state.allUnitsOnMap.map(u =>
        u.instanceId === commanderInstanceId
          ? { ...u, productionQueue: null, status: 'idle' } 
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