// src/app/gameplay/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useCallback } from 'react';
import { useGameSettingsStore, type PlacedUnit } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import GameplayHexGrid from '@/components/game/GameplayHexGrid';
import { ALL_MAPS_DATA } from '@/gameData/maps';
import type { MapData, HexData, TerrainType } from '@/types/map';
import { TERRAIN_MOVE_COSTS } from '@/types/map';
import { ALL_UNITS, UNITS_MAP } from '@/gameData/units';
import { hexDistance, logicalToAxial, axialToLogical, findPathAStar } from '@/lib/hexUtils';
import { hasLineOfSight, calculateDamage } from '@/lib/battleUtils';
import { canObserveTarget } from '@/lib/visibilityUtils';
import { decideCommanderAIAction, decideCombatAIAction, type AIAction, resetGlobalAIBuildOrderIndex } from '@/lib/aiUtils';

const BASE_CAPTURE_DURATION_MS = 10000;
const TICK_RATE_MS = 100;

function GameplayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapIdParam = searchParams.get('mapId');

  const selectedMapIdFromStore = useGameSettingsStore(state => state.selectedMapId);
  const allUnitsOnMapFromStore = useGameSettingsStore(state => state.allUnitsOnMap);
  const gameOverMessage = useGameSettingsStore(state => state.gameOverMessage);
  const playerResources = useGameSettingsStore(state => state.playerResources);
  const enemyResourcesStore = useGameSettingsStore(state => state.enemyResources);
  const victoryPoints = useGameSettingsStore(state => state.victoryPoints);
  const gameTimeFromStore = useGameSettingsStore(state => state.gameTimeElapsed);
  const gameTimeLimit = useGameSettingsStore(state => state.gameTimeLimit);
  const targetVictoryPoints = useGameSettingsStore(state => state.targetVictoryPoints);
  const currentMapDataFromStore = useGameSettingsStore(state => state.currentMapDataState);
  const playerVisibilityMap = useGameSettingsStore(state => state.playerVisibilityMap); // ストアから取得
  const lastKnownEnemyPositions = useGameSettingsStore(state => state.lastKnownEnemyPositions); // ストアから取得
  const selectedHexInfo = useGameSettingsStore(state => state.selectedHexInfo); // ストアから取得

  const {
    updateUnitOnMap,
    setAllUnitsOnMap: setAllUnitsOnMapDirectly,
    setGameOver,
    startUnitProduction: startUnitProductionAction,
    clearCommanderProductionQueue: clearCommanderProductionQueueAction,
    addUnitToMap: addUnitToMapAction,
    addPlayerResources: addPlayerResourcesAction,
    addEnemyResources: addEnemyResourcesAction,
    setCurrentMapData: setMapDataInStore,
    updateStrategicPointState,
    addVictoryPointsToPlayer,
    incrementGameTime,
    updatePlayerVisibilityMap, // ストアのアクションをインポート
    updateLastKnownEnemyPosition, // ストアのアクションをインポート
    clearVisibilityData, // ストアのアクションをインポート
    setSelectedHexInfo, // ストアのアクションをインポート
  } = useGameSettingsStore();


  const [selectedUnitInstanceId, setSelectedUnitInstanceId] = useState<string | null>(null);
  const [detailedSelectedUnitInfo, setDetailedSelectedUnitInfo] = useState<PlacedUnit | null>(null);
  const [attackingVisuals, setAttackingVisuals] = useState<{ visualId: string, attackerId: string, targetId: string, weaponType: 'HE' | 'AP' }[]>([]);
  const LAST_SEEN_DURATION = 5000;

  const COST_REVENUE_INTERVAL_SECONDS = 10;
  const COST_REVENUE_AMOUNT = 50;
  const gameTickRate = TICK_RATE_MS;

  useEffect(() => {
    resetGlobalAIBuildOrderIndex(); 
    const mapIdToLoad = mapIdParam || selectedMapIdFromStore;
    
    const currentMapInStore = useGameSettingsStore.getState().currentMapDataState;
    const unitsInStore = useGameSettingsStore.getState().allUnitsOnMap;

    if (!currentMapInStore || currentMapInStore.id !== mapIdToLoad) {
        if (mapIdToLoad && ALL_MAPS_DATA[mapIdToLoad]) {
            const mapData = JSON.parse(JSON.stringify(ALL_MAPS_DATA[mapIdToLoad])); 
            setMapDataInStore(mapData); 
            console.log('[Gameplay] Map data loaded/updated in store for mapId:', mapIdToLoad);
        } else {
            console.warn(`[Gameplay] Map with id "${mapIdToLoad}" not found. Current store map ID: ${currentMapInStore?.id}`);
            if (!mapIdToLoad && !currentMapInStore) {
                 setMapDataInStore(null); 
            }
        }
    } else {
        console.log('[Gameplay] Map data already in store and matches mapId:', currentMapInStore.id);
    }

    if (unitsInStore.length === 0) {
        console.warn("[Gameplay] GameplayContent mounted, but allUnitsOnMap in store is empty. This is problematic if units were expected from deployment.");
        if (router) router.push('/unit-deployment'); 
    } else {
        console.log('[Gameplay] Units found in store on mount:', unitsInStore.length, unitsInStore.filter(u => u.owner === 'player').length, 'player units.');
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapIdParam, selectedMapIdFromStore, setMapDataInStore, router]); // router was missing, add it.

  useEffect(() => {
    if (gameOverMessage) return;
    const gameTimeAndPlayerResourceInterval = setInterval(() => {
      incrementGameTime();
      const currentElapsedTime = useGameSettingsStore.getState().gameTimeElapsed;
      const currentMap = useGameSettingsStore.getState().currentMapDataState;

      if (currentElapsedTime > 0 && currentElapsedTime % COST_REVENUE_INTERVAL_SECONDS === 0) {
        addPlayerResourcesAction(COST_REVENUE_AMOUNT);
      }

      if (currentElapsedTime > 0 && currentElapsedTime % 30 === 0) {
        if (currentMap?.strategicPoints) {
          const playerOwnedPoints = currentMap.strategicPoints.filter(sp => sp.owner === 'player').length;
          let pointsToAdd = 0;
          if (playerOwnedPoints === 1) pointsToAdd = 1;
          else if (playerOwnedPoints === 2) pointsToAdd = 3;
          else if (playerOwnedPoints === 3) pointsToAdd = 6;
          else if (playerOwnedPoints === 4) pointsToAdd = 10;
          else if (playerOwnedPoints >= 5) pointsToAdd = 15;
          if (pointsToAdd > 0) addVictoryPointsToPlayer('player', pointsToAdd);
        }
      }

      const { victoryPoints: currentVP, gameTimeLimit: timeLimitFromStoreG, targetVictoryPoints: targetVPFromStoreG, gameOverMessage: currentGameOverMsg } = useGameSettingsStore.getState();
      if (!currentGameOverMsg) {
        if (currentVP.player >= targetVPFromStoreG) setGameOver("Player Wins! (Victory Points Reached)");
        else if (currentVP.enemy >= targetVPFromStoreG) setGameOver("Enemy Wins! (Victory Points Reached)");
        else if (currentElapsedTime >= timeLimitFromStoreG) {
          if (currentVP.player > currentVP.enemy) setGameOver("Player Wins! (Time Limit - Higher VP)");
          else if (currentVP.enemy > currentVP.player) setGameOver("Enemy Wins! (Time Limit - Higher VP)");
          else setGameOver("Draw! (Time Limit - VP Tied)");
        }
      }
    }, 1000);
    return () => clearInterval(gameTimeAndPlayerResourceInterval);
  }, [gameOverMessage, incrementGameTime, addVictoryPointsToPlayer, setGameOver, addPlayerResourcesAction]);

  useEffect(() => {
    if (gameOverMessage) return;
    const aiResourceInterval = setInterval(() => {
        const currentElapsedTime = useGameSettingsStore.getState().gameTimeElapsed;
        if (currentElapsedTime > 0 && currentElapsedTime % COST_REVENUE_INTERVAL_SECONDS === 0) {
            addEnemyResourcesAction(COST_REVENUE_AMOUNT);
        }
        const currentMap = useGameSettingsStore.getState().currentMapDataState;
        if (currentElapsedTime > 0 && currentElapsedTime % 30 === 0) {
          if (currentMap?.strategicPoints) {
            const enemyOwnedPoints = currentMap.strategicPoints.filter(sp => sp.owner === 'enemy').length;
            let pointsToAdd = 0;
            if (enemyOwnedPoints === 1) pointsToAdd = 1;
            else if (enemyOwnedPoints === 2) pointsToAdd = 3;
            else if (enemyOwnedPoints === 3) pointsToAdd = 6;
            else if (enemyOwnedPoints === 4) pointsToAdd = 10;
            else if (enemyOwnedPoints >= 5) pointsToAdd = 15;
            if (pointsToAdd > 0) addVictoryPointsToPlayer('enemy', pointsToAdd);
          }
        }
    }, 1000);
    return () => clearInterval(aiResourceInterval);
  }, [gameOverMessage, addEnemyResourcesAction, addVictoryPointsToPlayer]);


  const getTimeToTraverseHex = useCallback((
    unitDef: UnitData,
    targetHexQ: number,
    targetHexR: number,
    map: MapData | null
  ): number => {
    const baseTimePerHexMs = (1 / (unitDef.stats.moveSpeed || 1)) * 1000;
    if (!map || !map.hexes) {
      return baseTimePerHexMs;
    }
    const hexKey = `${targetHexQ},${targetHexR}`;
    const hexData = map.hexes[hexKey];
    if (!hexData) {
      return baseTimePerHexMs;
    }
    const terrainCostMultiplier = TERRAIN_MOVE_COSTS[hexData.terrain];
    if (terrainCostMultiplier === Infinity) {
      return Infinity;
    }
    if (terrainCostMultiplier === undefined) {
      return baseTimePerHexMs;
    }
    return baseTimePerHexMs * terrainCostMultiplier;
  }, []);


  const initiateMove = useCallback((unitToMove: PlacedUnit, targetLogicalX: number, targetLogicalY: number) => {
    const unitDef = UNITS_MAP.get(unitToMove.unitId);
    const currentMap = useGameSettingsStore.getState().currentMapDataState;
    const allUnits = useGameSettingsStore.getState().allUnitsOnMap;

    if (!unitDef || !currentMap || !currentMap.hexes) {
        updateUnitOnMap(unitToMove.instanceId, { currentPath: null, timeToNextHex: null, isMoving: false, status: 'idle', moveTargetPosition: null });
        return;
    }

    const startAxial = logicalToAxial(unitToMove.position.x, unitToMove.position.y);
    const targetAxial = logicalToAxial(targetLogicalX, targetLogicalY);

    if (startAxial.q === targetAxial.q && startAxial.r === targetAxial.r) {
        const attackTarget = unitToMove.attackTargetInstanceId ? allUnits.find(u => u.instanceId === unitToMove.attackTargetInstanceId) : null;
        let newTargetOrientationDeg = unitToMove.orientation;
        if(attackTarget){
            const tDx = attackTarget.position.x - unitToMove.position.x;
            const tDy = attackTarget.position.y - unitToMove.position.y;
            if (Math.abs(tDx) > 0.01 || Math.abs(tDy) > 0.01) {
                newTargetOrientationDeg = (Math.atan2(tDy, tDx) * (180 / Math.PI) + 360) % 360;
            }
        }
        const needsToTurn = Math.abs(newTargetOrientationDeg - unitToMove.orientation) > 1 && unitDef.stats.turnSpeed !== undefined && unitDef.stats.turnSpeed > 0;
        updateUnitOnMap(unitToMove.instanceId, {
            currentPath: null, timeToNextHex: null, isMoving: false,
            targetOrientation: needsToTurn ? newTargetOrientationDeg : undefined,
            isTurning: needsToTurn,
            status: needsToTurn ? 'turning' : (unitToMove.attackTargetInstanceId ? 'aiming' : 'idle'),
            moveTargetPosition: null,
        });
        return;
    }

    const goalHexKey = `${targetAxial.q},${targetAxial.r}`;
    const goalHexData = currentMap.hexes[goalHexKey];
    if (!goalHexData || TERRAIN_MOVE_COSTS[goalHexData.terrain] === Infinity) {
        console.warn(`Goal hex (${targetAxial.q},${targetAxial.r}) is impassable or out of map for ${unitToMove.name}.`);
        updateUnitOnMap(unitToMove.instanceId, { currentPath: null, timeToNextHex: null, isMoving: false, status: 'idle', moveTargetPosition: null });
        return;
    }

    const axialPath = findPathAStar(startAxial, targetAxial, currentMap, allUnits, unitToMove.instanceId);

    if (axialPath.length === 0 && (startAxial.q !== targetAxial.q || startAxial.r !== targetAxial.r)) {
        console.warn(`No path found for ${unitToMove.name} from (${startAxial.q},${startAxial.r}) to (${targetAxial.q},${targetAxial.r})`);
        updateUnitOnMap(unitToMove.instanceId, { currentPath: null, timeToNextHex: null, isMoving: false, status: 'idle', moveTargetPosition: null });
        return;
    }

    const logicalPath = axialPath.map(axial => axialToLogical(axial.q, axial.r));
    let newTargetOrientationDeg = unitToMove.orientation;
    let timeToFirstHex: number | null = null;

    if (logicalPath.length > 0) {
        const firstStepAxial = axialPath[0];
        const firstStepLogical = logicalPath[0];
        const firstStepDx = firstStepLogical.x - unitToMove.position.x;
        const firstStepDy = firstStepLogical.y - unitToMove.position.y;
        if (Math.abs(firstStepDx) > 0.01 || Math.abs(firstStepDy) > 0.01) {
            newTargetOrientationDeg = (Math.atan2(firstStepDy, firstStepDx) * (180 / Math.PI) + 360) % 360;
        }
        timeToFirstHex = getTimeToTraverseHex(unitDef, firstStepAxial.q, firstStepAxial.r, currentMap);
    }

    const needsToTurn = Math.abs(newTargetOrientationDeg - unitToMove.orientation) > 1 && unitDef.stats.turnSpeed !== undefined && unitDef.stats.turnSpeed > 0;
    const canStartMoving = logicalPath.length > 0 && !needsToTurn && timeToFirstHex !== Infinity;

    updateUnitOnMap(unitToMove.instanceId, {
        currentPath: logicalPath.length > 0 ? logicalPath : null,
        timeToNextHex: canStartMoving ? timeToFirstHex : null,
        moveTargetPosition: { x: targetLogicalX, y: targetLogicalY },
        targetOrientation: newTargetOrientationDeg,
        isTurning: needsToTurn,
        isMoving: canStartMoving,
        status: needsToTurn ? 'turning' : (canStartMoving ? 'moving' : 'idle'),
    });
  }, [updateUnitOnMap, getTimeToTraverseHex]);


  useEffect(() => {
    const unitProcessInterval = setInterval(() => {
        const {
          gameOverMessage: currentGameOverMsg,
          allUnitsOnMap: unitsFromStoreAtTickStart, // ティック開始時のユニットリスト
          currentMapDataState: currentMapDataForLoop,
          playerVisibilityMap: currentStoreVisibilityMap,
          lastKnownEnemyPositions: currentStoreLastKnownEnemyPositions,
        } = useGameSettingsStore.getState();

        if (currentGameOverMsg) {
          clearInterval(unitProcessInterval);
          return;
        }

        const currentTime = Date.now();
        let unitsToProcess = [...unitsFromStoreAtTickStart]; // 変更可能なコピーを作成


        unitsToProcess.forEach(unit => {
            const unitDef = UNITS_MAP.get(unit.unitId);
        });

        // 司令官の生存数を計算する前に、破壊されたユニットをフィルタリング
        let currentAliveUnits = unitsToProcess.filter(u => u.status !== 'destroyed');

        let playerCommandersAlive = 0;
        let enemyCommandersAlive = 0;

        currentAliveUnits.forEach(unit => { // フィルタリングされたリストに対して計算
            const unitDef = UNITS_MAP.get(unit.unitId);
            if (unitDef?.isCommander) {
                if (unit.owner === 'player') playerCommandersAlive++;
                else if (unit.owner === 'enemy') enemyCommandersAlive++;
            }
        });

        const playerUnits = currentAliveUnits.filter(u => u.owner === 'player'); // フィルタリングされたリストから取得
        const enemyUnitsActual = currentAliveUnits.filter(u => u.owner === 'enemy'); // フィルタリングされたリストから取得
        
        const newPlayerVisibilityMap: Record<string, boolean> = {};
        const newLastKnownEnemyPositions: Record<string, { x: number; y: number; timestamp: number }> = { ...currentStoreLastKnownEnemyPositions };

        enemyUnitsActual.forEach(enemyUnit => {
            let isVisible = false;
            for (const playerUnit of playerUnits) {
                if (canObserveTarget(playerUnit, enemyUnit, currentMapDataForLoop, unitsToProcess, currentTime)) { // unitsToProcess を使用
                    isVisible = true;
                    break;
                }
            }
            if (isVisible) {
                const enemyAxial = logicalToAxial(enemyUnit.position.x, enemyUnit.position.y);
                newPlayerVisibilityMap[`${enemyAxial.q},${enemyAxial.r}`] = true;
                if (newLastKnownEnemyPositions[enemyUnit.instanceId]) {
                    delete newLastKnownEnemyPositions[enemyUnit.instanceId];
                }
            } else {
                if (!newLastKnownEnemyPositions[enemyUnit.instanceId]) {
                    newLastKnownEnemyPositions[enemyUnit.instanceId] = {
                        x: enemyUnit.position.x,
                        y: enemyUnit.position.y,
                        timestamp: currentTime,
                    };
                }
            }
        });

        for (const instanceId in newLastKnownEnemyPositions) {
            if (currentTime - newLastKnownEnemyPositions[instanceId].timestamp > LAST_SEEN_DURATION) {
                delete newLastKnownEnemyPositions[instanceId];
            }
        }

        updatePlayerVisibilityMap(newPlayerVisibilityMap);
        useGameSettingsStore.setState({ lastKnownEnemyPositions: newLastKnownEnemyPositions });


        unitsToProcess.forEach((unit, index) => { // unitsToProcess をループ
            if (!unit || unit.status === 'destroyed') return;
            const unitDef = UNITS_MAP.get(unit.unitId);
            if (!unitDef) return;

            if (unit.justHit && unit.hitTimestamp && currentTime - unit.hitTimestamp > 300) {
                unitsToProcess[index] = { ...unit, justHit: false };
            }

            if (unit.owner === 'player' && (unit.status === 'idle' || unit.status === 'moving') && !unit.attackTargetInstanceId && !unit.isTurning) {
                if (unitDef) {
                    let potentialTarget: PlacedUnit | null = null;
                    let weaponTypeToUse: 'AP' | 'HE' | null = null;
                    const unitAxial = logicalToAxial(unit.position.x, unit.position.y);

                    if (unitDef.stats.apWeapon) {
                        for (const otherUnit of unitsToProcess) { // unitsToProcess を使用
                            if (otherUnit.owner === 'enemy' && otherUnit.status !== 'destroyed') {
                                const otherUnitAxial = logicalToAxial(otherUnit.position.x, otherUnit.position.y);
                                const distance = hexDistance(unitAxial.q, unitAxial.r, otherUnitAxial.q, otherUnitAxial.r);
                                const targetDef = UNITS_MAP.get(otherUnit.unitId);
                                const targetHasArmor = targetDef ? (targetDef.stats.armor.front > 0 || targetDef.stats.armor.side > 0 || targetDef.stats.armor.back > 0 || targetDef.stats.armor.top > 0) : false;

                                if (distance <= unitDef.stats.apWeapon.range && targetHasArmor && currentMapDataForLoop && hasLineOfSight(unit, otherUnit, currentMapDataForLoop, unitsToProcess)) { // unitsToProcess を使用
                                    potentialTarget = otherUnit;
                                    weaponTypeToUse = 'AP';
                                    break;
                                }
                            }
                        }
                    }

                    if (!potentialTarget && unitDef.stats.heWeapon) {
                        for (const otherUnit of unitsToProcess) { // unitsToProcess を使用
                            if (otherUnit.owner === 'enemy' && otherUnit.status !== 'destroyed') {
                                const otherUnitAxial = logicalToAxial(otherUnit.position.x, otherUnit.position.y);
                                const distance = hexDistance(unitAxial.q, unitAxial.r, otherUnitAxial.q, otherUnitAxial.r);
                                const targetDef = UNITS_MAP.get(otherUnit.unitId);
                                const targetHasArmor = targetDef ? (targetDef.stats.armor.front > 0 || targetDef.stats.armor.side > 0 || targetDef.stats.armor.back > 0 || targetDef.stats.armor.top > 0) : false;

                                if (distance <= unitDef.stats.heWeapon.range && !targetHasArmor && currentMapDataForLoop && hasLineOfSight(unit, otherUnit, currentMapDataForLoop, unitsToProcess)) { // unitsToProcess を使用
                                    potentialTarget = otherUnit;
                                    weaponTypeToUse = 'HE';
                                    break;
                                }
                            }
                        }
                    }

                    if (potentialTarget && weaponTypeToUse) {
                        const target = potentialTarget as PlacedUnit;
                        const dx = target.position.x - unit.position.x;
                        const dy = target.position.y - unit.position.y;
                        let newTargetOrientationDeg = unit.orientation;
                        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
                            newTargetOrientationDeg = (Math.atan2(dy, dx) * (180 / Math.PI) + 360) % 360;
                        }
                        const needsToTurnForAttack = Math.abs(newTargetOrientationDeg - unit.orientation) > 1 && !!unitDef.stats.turnSpeed;

                        unitsToProcess[index] = {
                            ...unit,
                            attackTargetInstanceId: target.instanceId,
                            status: needsToTurnForAttack ? 'turning' : 'aiming',
                            isMoving: false,
                            currentPath: null,
                            moveTargetPosition: null,
                            targetOrientation: newTargetOrientationDeg,
                            isTurning: needsToTurnForAttack,
                        };
                    }
                }
            }


            if (unit.isTurning && unit.targetOrientation !== undefined) {
                const turnSpeedDegPerTick = (unitDef.stats.turnSpeed || 3600) / (1000 / gameTickRate);
                let currentOrientation = unit.orientation; const targetOrientation = unit.targetOrientation;
                let diff = targetOrientation - currentOrientation; if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
                
                if (Math.abs(diff) < turnSpeedDegPerTick || Math.abs(diff) < 0.5) {
                    const newOrientation = targetOrientation;
                    let timeToNextStep: number | null = null;
                    if (unit.currentPath && unit.currentPath.length > 0) {
                        const nextStepAxial = logicalToAxial(unit.currentPath[0].x, unit.currentPath[0].y);
                        timeToNextStep = getTimeToTraverseHex(unitDef, nextStepAxial.q, nextStepAxial.r, currentMapDataForLoop);
                    }
                    const canMoveAfterTurn = !!unit.moveTargetPosition && !!unit.currentPath && unit.currentPath.length > 0 && timeToNextStep !== Infinity;
                    
                    unitsToProcess[index] = {
                        ...unit,
                        orientation: newOrientation, 
                        isTurning: false,
                        isMoving: canMoveAfterTurn,
                        timeToNextHex: canMoveAfterTurn ? timeToNextStep : null,
                        targetOrientation: undefined,
                        status: canMoveAfterTurn ? 'moving' : (unit.attackTargetInstanceId ? 'aiming' : 'idle'),
                    };
                } else {
                    const newOrientation = (currentOrientation + Math.sign(diff) * turnSpeedDegPerTick + 360) % 360;
                    unitsToProcess[index] = { ...unit, orientation: newOrientation };
                }
            }
            else if (unit.isMoving && unit.currentPath && unit.currentPath.length > 0 && unit.timeToNextHex !== null && unit.timeToNextHex !== undefined) {
                let newTimeToNextHex = unit.timeToNextHex - gameTickRate;
                if (newTimeToNextHex <= 0) {
                    const nextLogicalPosition = unit.currentPath[0];
                    const remainingPath = unit.currentPath.slice(1);
                    let newOrientation = unit.orientation;
                    let timeToNextStep: number | null = null;
                    let needsToTurnAfterMove = false;

                    if (remainingPath.length > 0) {
                        const nextNextLogicalPosition = remainingPath[0];
                        const nextNextAxial = logicalToAxial(nextNextLogicalPosition.x, nextNextLogicalPosition.y);
                        timeToNextStep = getTimeToTraverseHex(unitDef, nextNextAxial.q, nextNextAxial.r, currentMapDataForLoop);

                        const dx = nextNextLogicalPosition.x - nextLogicalPosition.x;
                        const dy = nextNextLogicalPosition.y - nextLogicalPosition.y;
                        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
                            newOrientation = (Math.atan2(dy, dx) * (180 / Math.PI) + 360) % 360;
                        }
                        needsToTurnAfterMove = Math.abs(newOrientation - unit.orientation) > 1 && unitDef.stats.turnSpeed !== undefined && unitDef.stats.turnSpeed > 0;
                        const canContinueMoving = !needsToTurnAfterMove && timeToNextStep !== Infinity;

                        unitsToProcess[index] = {
                            ...unit,
                            position: nextLogicalPosition,
                            orientation: needsToTurnAfterMove ? unit.orientation : newOrientation,
                            currentPath: remainingPath,
                            timeToNextHex: canContinueMoving ? timeToNextStep : null,
                            isMoving: canContinueMoving,
                            isTurning: needsToTurnAfterMove,
                            targetOrientation: needsToTurnAfterMove ? newOrientation : undefined,
                            status: needsToTurnAfterMove ? 'turning' : (canContinueMoving ? 'moving' : 'idle'),
                        };
                    } else {
                        unitsToProcess[index] = {
                            ...unit,
                            position: nextLogicalPosition,
                            currentPath: null, timeToNextHex: null,
                            isMoving: false, isTurning: false, moveTargetPosition: null, 
                            status: unit.attackTargetInstanceId ? 'aiming' : 'idle', 
                        };
                    }
                } else {
                    unitsToProcess[index] = { ...unit, timeToNextHex: newTimeToNextHex };
                }
            }
            if (currentMapDataForLoop?.strategicPoints && 
                (unit.status === 'idle' || unit.status === 'moving') &&
                !unit.isTurning &&
                (!unit.attackTargetInstanceId)
            ) {
                const strategicPoint = currentMapDataForLoop.strategicPoints.find(sp => sp.x === unit.position.x && sp.y === unit.position.y);
                if (strategicPoint) {
                    if (strategicPoint.owner !== unit.owner) {
                        if (strategicPoint.capturingPlayer === unit.owner && strategicPoint.captureProgress !== undefined) {
                            const newProgress = strategicPoint.captureProgress + gameTickRate;
                            if (newProgress >= BASE_CAPTURE_DURATION_MS) {
                                updateStrategicPointState(strategicPoint.id, { owner: unit.owner, captureProgress: 0, capturingPlayer: null });
                            } else {
                                updateStrategicPointState(strategicPoint.id, { captureProgress: newProgress });
                            }
                        } else if (strategicPoint.capturingPlayer && strategicPoint.capturingPlayer !== unit.owner && strategicPoint.captureProgress && strategicPoint.captureProgress > 0) {
                            const newProgress = Math.max(0, strategicPoint.captureProgress - gameTickRate * 2);
                            updateStrategicPointState(strategicPoint.id, { 
                                captureProgress: newProgress, 
                                capturingPlayer: newProgress > 0 ? strategicPoint.capturingPlayer : null
                            });
                        } else if (!strategicPoint.capturingPlayer || strategicPoint.captureProgress === 0) {
                            updateStrategicPointState(strategicPoint.id, { capturingPlayer: unit.owner, captureProgress: gameTickRate });
                        }
                    }
                } else {
                }
            }
            else if (unit.attackTargetInstanceId && (unit.status === 'aiming' || unit.status === 'attacking_he' || unit.status === 'attacking_ap' || unit.status === 'reloading_he' || unit.status === 'reloading_ap')) {
                if (unit.isTurning || unit.isMoving && !unitDef.canMoveAndAttack) { }
                else {
                    const targetUnit = unitsToProcess.find(u => u.instanceId === unit.attackTargetInstanceId && u.status !== 'destroyed'); // unitsToProcess を使用
                    if (!targetUnit) { 
                        unitsToProcess[index] = { ...unit, status: 'idle', attackTargetInstanceId: null, lastAttackTimeAP: undefined, lastAttackTimeHE: undefined };
                    } else {
                        const dx = targetUnit.position.x - unit.position.x; const dy = targetUnit.position.y - unit.position.y;
                        let requiredOrientationDeg = unit.orientation;
                        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { requiredOrientationDeg = (Math.atan2(dy, dx) * (180 / Math.PI) + 360) % 360; }

                        if (Math.abs(requiredOrientationDeg - unit.orientation) > 5 && !unit.isTurning) {
                            unitsToProcess[index] = { ...unit, targetOrientation: requiredOrientationDeg, isTurning: true, status: 'aiming' };
                        } else if (!unit.isTurning && !hasLineOfSight(unit, targetUnit, currentMapDataForLoop, unitsToProcess)) { // unitsToProcess を使用
                            unitsToProcess[index] = { ...unit, status: 'aiming' };
                        } else if (!unit.isTurning) {
                            const attackerPosAxial = logicalToAxial(unit.position.x, unit.position.y);
                            const targetPosAxial = logicalToAxial(targetUnit.position.x, targetUnit.position.y);
                            const distance = hexDistance(attackerPosAxial.q, attackerPosAxial.r, targetPosAxial.q, targetPosAxial.r);
                            let weaponChoice: { type: 'HE' | 'AP', stats: NonNullable<UnitData['stats']['heWeapon'] | UnitData['stats']['apWeapon']> } | null = null;
                            const targetDef = UNITS_MAP.get(targetUnit.unitId);

                            if (targetDef) {
                                const targetHasArmor = targetDef.stats.armor.front > 0 || targetDef.stats.armor.side > 0 || targetDef.stats.armor.back > 0 || targetDef.stats.armor.top > 0;

                                if (targetHasArmor) {
                                    if (unitDef.stats.apWeapon && distance <= unitDef.stats.apWeapon.range) {
                                        weaponChoice = { type: 'AP', stats: unitDef.stats.apWeapon };
                                    }
                                } else {
                                    if (unitDef.stats.heWeapon && distance <= unitDef.stats.heWeapon.range) {
                                        weaponChoice = { type: 'HE', stats: unitDef.stats.heWeapon };
                                    }
                                }
                            }

                            if (!weaponChoice) { 
                                unitsToProcess[index] = { ...unit, status: 'aiming' };
                            } else {
                                if (unit.status === `attacking_${weaponChoice.type.toLowerCase()}`) {
                                    const visualId = `${unit.instanceId}-${targetUnit.instanceId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                                    const visualEffect = { visualId, attackerId: unit.instanceId, targetId: targetUnit.instanceId, weaponType: weaponChoice.type };
                                    setAttackingVisuals(prev => [...prev, visualEffect]);
                                    setTimeout(() => setAttackingVisuals(prev => prev.filter(v => v.visualId !== visualEffect.visualId)), 200);
                                    const attackTimestampUpdate: Partial<PlacedUnit> = { lastSuccessfulAttackTimestamp: currentTime };

                                    if (targetDef) {
                                        const damageResult = calculateDamage( unitDef, weaponChoice.type, targetDef, unit.orientation, targetUnit.orientation, targetUnit.position, unit.position );
                                        const newTargetHp = Math.max(0, targetUnit.currentHp - damageResult.damageDealt);
                                        if (newTargetHp <= 0) {
                                            const targetUnitIndex = unitsToProcess.findIndex(u => u.instanceId === targetUnit.instanceId);
                                            if (targetUnitIndex !== -1) {
                                                unitsToProcess[targetUnitIndex] = { ...targetUnit, currentHp: 0, status: 'destroyed' };
                                            }
                                            unitsToProcess[index] = { ...unit, status: 'idle', attackTargetInstanceId: null, lastAttackTimeAP: undefined, lastAttackTimeHE: undefined, ...attackTimestampUpdate };
                                        } else {
                                            const targetUnitIndex = unitsToProcess.findIndex(u => u.instanceId === targetUnit.instanceId);
                                            if (targetUnitIndex !== -1) {
                                                unitsToProcess[targetUnitIndex] = { ...targetUnit, currentHp: newTargetHp, justHit: true, hitTimestamp: currentTime };
                                            }
                                            unitsToProcess[index] = { ...unit, status: weaponChoice.type === 'HE' ? 'reloading_he' : 'reloading_ap', [weaponChoice.type === 'HE' ? 'lastAttackTimeHE' : 'lastAttackTimeAP']: currentTime, ...attackTimestampUpdate };
                                        }
                                    } else {
                                        unitsToProcess[index] = { ...unit, status: 'idle', attackTargetInstanceId: null, ...attackTimestampUpdate };
                                    }
                                } else if (unit.status === 'aiming' || unit.status === `reloading_${weaponChoice.type.toLowerCase()}`) {
                                    const attackIntervalMs = weaponChoice.stats.attackInterval * 1000;
                                    const lastAttackTime = weaponChoice.type === 'HE' ? unit.lastAttackTimeHE : unit.lastAttackTimeAP;
                                    if (!lastAttackTime || currentTime - lastAttackTime >= attackIntervalMs) {
                                        unitsToProcess[index] = { ...unit, status: weaponChoice.type === 'HE' ? 'attacking_he' : 'attacking_ap' };
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (unitDef.isCommander && unit.productionQueue && unit.productionQueue.length > 0) {
                const currentProductionItem = unit.productionQueue[0];
                const newTimeLeftMs = currentProductionItem.timeLeftMs - gameTickRate;

                if (newTimeLeftMs <= 0) {
                    const producedUnitId = currentProductionItem.unitIdToProduce;
                    const producedUnitDef = UNITS_MAP.get(producedUnitId);
                    const productionOriginalCost = currentProductionItem.productionCost;

                    if (!producedUnitDef) {
                        console.error(`[Production] Unit definition not found for produced unit ID: ${producedUnitId}. Refunding cost ${productionOriginalCost}.`);
                        if (unit.owner === 'player') {
                            addPlayerResourcesAction(productionOriginalCost);
                        } else {
                            addEnemyResourcesAction(productionOriginalCost);
                        }
                        // 生産が完了したらキューの最初のアイテムを削除
                        const updatedQueue = unit.productionQueue.slice(1);
                        unitsToProcess[index] = { ...unit, productionQueue: updatedQueue, status: updatedQueue.length > 0 ? 'producing' : 'idle' };
                        return; // ユニット定義がない場合はここで処理を終了
                    }

                    let spawnPosition: { x: number; y: number } | null = null;
                    const commanderAxial = logicalToAxial(unit.position.x, unit.position.y);
                    const potentialSpawnOffsets = [
                        { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 }, { q: 0, r: -1 }, 
                        { q: 1, r: -1 }, { q: -1, r: 1 },
                        { q: 2, r: 0 }, { q: -2, r: 0 }, { q: 0, r: 2 }, { q: 0, r: -2 },
                        { q: 1, r: 1 }, { q: -1, r: -1 }, { q: 2, r: -1 }, { q: -2, r: 1 },
                        { q: 1, r: -2 }, { q: -1, r: 2 }, { q: 2, r: -2 }, { q: -2, r: 2 },
                    ];

                    for (const offset of potentialSpawnOffsets) {
                        const spawnAxial = { q: commanderAxial.q + offset.q, r: commanderAxial.r + offset.r };
                        const spawnLogical = axialToLogical(spawnAxial.q, spawnAxial.r);
                        const hexKey = `${spawnAxial.q},${spawnAxial.r}`;
                        
                        if (!currentMapDataForLoop || 
                            spawnLogical.x < 0 || spawnLogical.x >= currentMapDataForLoop.cols ||
                            spawnLogical.y < 0 || spawnLogical.y >= currentMapDataForLoop.rows) {
                            continue;
                        }

                        const hexData = currentMapDataForLoop?.hexes?.[hexKey];
                        const isOccupied = unitsToProcess.some( // unitsToProcess を使用
                            u => u.position.x === spawnLogical.x && u.position.y === spawnLogical.y && u.status !== 'destroyed'
                        );

                        if (hexData && TERRAIN_MOVE_COSTS[hexData.terrain] !== Infinity && !isOccupied) {
                            spawnPosition = spawnLogical;
                            break;
                        }
                    }

                    if (spawnPosition) {
                        const newUnitInstance: PlacedUnit = {
                            instanceId: `${producedUnitDef.id}_${unit.owner}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                            unitId: producedUnitDef.id,
                            name: producedUnitDef.name,
                            cost: producedUnitDef.cost,
                            position: spawnPosition,
                            currentHp: producedUnitDef.stats.hp,
                            owner: unit.owner,
                            orientation: unit.orientation,
                            status: 'idle',
                            isTurning: false, isMoving: false, moveTargetPosition: null, currentPath: null, timeToNextHex: null,
                            attackTargetInstanceId: null, lastAttackTimeHE: undefined, lastAttackTimeAP: undefined,
                            lastSuccessfulAttackTimestamp: undefined, justHit: false, hitTimestamp: undefined, 
                            productionQueue: [], // 新しいユニットの生産キューは空
                        };
                        unitsToProcess.push(newUnitInstance); // 直接追加
                    } else {
                        console.warn(`[Production] Could not find valid spawn location for ${producedUnitDef.name} by ${unit.name} (${unit.owner}). Refunding cost ${productionOriginalCost}.`);
                        if (unit.owner === 'player') {
                            addPlayerResourcesAction(productionOriginalCost);
                        } else {
                            addEnemyResourcesAction(productionOriginalCost);
                        }
                    }
                    // 生産が完了したらキューの最初のアイテムを削除
                    const updatedQueue = unit.productionQueue.slice(1);
                    unitsToProcess[index] = { ...unit, productionQueue: updatedQueue, status: updatedQueue.length > 0 ? 'producing' : 'idle' };
                } else {
                    // 生産中のアイテムの残り時間を更新
                    const updatedQueue = [...unit.productionQueue];
                    updatedQueue[0] = { ...updatedQueue[0], timeLeftMs: newTimeLeftMs };
                    unitsToProcess[index] = { ...unit, productionQueue: updatedQueue, status: 'producing' };
                }
            }

            if (unit.owner === 'enemy' && !currentGameOverMsg) {
                // AIの生産ロジックもキューの存在を確認するように変更
                if (unit.status === 'idle' || unit.status === 'moving' || (unitDef.isCommander && (!unit.productionQueue || unit.productionQueue.length === 0) && unit.status !== 'producing') ) {
                    const aiDifficulty = useGameSettingsStore.getState().aiDifficulty;
                    const allUnitsCurrent = unitsToProcess; // unitsToProcess を使用
                    const currentEnemyRes = useGameSettingsStore.getState().enemyResources;
                    const currentMap = useGameSettingsStore.getState().currentMapDataState;
                    const gameTime = useGameSettingsStore.getState().gameTimeElapsed;

                    let action: AIAction | null = null;
                    if (unitDef.isCommander && !unit.productionQueue) { 
                        action = decideCommanderAIAction(unit, unitDef, allUnitsCurrent, currentEnemyRes, currentMap, gameTime);
                    } else if (!unitDef.isCommander) { 
                        action = decideCombatAIAction(unit, unitDef, allUnitsCurrent, currentMap);
                    }

                    if (action) {
                        switch (action.type) {
                            case 'MOVE':
                                if (!unit.isMoving || 
                                    (unit.moveTargetPosition?.x !== action.targetPosition.x || unit.moveTargetPosition?.y !== action.targetPosition.y)) {
                                    unitsToProcess[index] = { ...unit, attackTargetInstanceId: null }; // 直接更新
                                    initiateMove(unit, action.targetPosition.x, action.targetPosition.y);
                                }
                                break;
                            case 'ATTACK':
                                const targetUnit = allUnitsCurrent.find(u => u.instanceId === action.attackTargetInstanceId);
                                if (targetUnit && unit.attackTargetInstanceId !== targetUnit.instanceId) {
                                    const dx = targetUnit.position.x - unit.position.x;
                                    const dy = targetUnit.position.y - unit.position.y;
                                    let newTargetOrientationDeg = unit.orientation;
                                    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
                                        newTargetOrientationDeg = (Math.atan2(dy, dx) * (180 / Math.PI) + 360) % 360;
                                    }
                                    unitsToProcess[index] = {
                                        ...unit,
                                        attackTargetInstanceId: targetUnit.instanceId,
                                        status: 'aiming', 
                                        isMoving: false, currentPath: null, moveTargetPosition: null,
                                        targetOrientation: newTargetOrientationDeg,
                                        isTurning: Math.abs(newTargetOrientationDeg - unit.orientation) > 1 && !!unitDef.stats.turnSpeed,
                                    };
                                }
                                break;
                            case 'PRODUCE':
                                // AIの生産は、startUnitProductionActionがキューを管理するのでそのまま
                                const { success } = startUnitProductionAction(unit.instanceId, action.unitIdToProduce, 'enemy');
                                break;
                            case 'IDLE':
                            case 'CAPTURE':
                                // 生産キューが空の場合のみアイドル状態に設定
                                if (unit.status !== 'idle' && !unit.attackTargetInstanceId && !unit.isMoving && !unit.isTurning && (!unit.productionQueue || unit.productionQueue.length === 0)) {
                                   unitsToProcess[index] = { ...unit, status: 'idle' }; // 直接更新
                                }
                                break;
                        }
                    }
                }
            }

        });

        // 最後に、変更されたユニットリストをストアにコミット
        setAllUnitsOnMapDirectly(unitsToProcess);

        if (!currentGameOverMsg) {
            // 司令官が破壊されたかどうかの最終チェック
            let finalPlayerCommandersAlive = 0;
            let finalEnemyCommandersAlive = 0;

            unitsToProcess.filter(u => u.status !== 'destroyed').forEach(unit => { // 更新されたリストに対して計算
                const unitDef = UNITS_MAP.get(unit.unitId);
                if (unitDef?.isCommander) {
                    if (unit.owner === 'player') finalPlayerCommandersAlive++;
                    else if (unit.owner === 'enemy') finalEnemyCommandersAlive++;
                }
            });

            if (finalPlayerCommandersAlive === 0) {
                setGameOver("Enemy Wins! (Player Commander Lost)");
            } 
            else if (finalEnemyCommandersAlive === 0) {
                setGameOver("Player Wins! (Enemy Commander Lost)");
            }
        }

    }, gameTickRate);
    return () => clearInterval(unitProcessInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ 
    gameOverMessage, updateUnitOnMap, setAllUnitsOnMapDirectly, setGameOver, 
    updateStrategicPointState, addUnitToMapAction, clearCommanderProductionQueueAction, 
    startUnitProductionAction, addPlayerResourcesAction, addEnemyResourcesAction, 
    incrementGameTime, initiateMove, getTimeToTraverseHex, 
    playerVisibilityMap, lastKnownEnemyPositions, gameTimeFromStore // Dependencies for visibility updates
    // playerResources is read in UI, but not directly in this interval. Actions handle resource changes.
  ]);


  const handleAttackCommand = useCallback((attackerUnit: PlacedUnit, targetUnit: PlacedUnit) => {
    const attackerDef = UNITS_MAP.get(attackerUnit.unitId);
    const currentMap = useGameSettingsStore.getState().currentMapDataState;
    const allUnits = useGameSettingsStore.getState().allUnitsOnMap;

    if (attackerDef && targetUnit && targetUnit.status !== 'destroyed' && attackerUnit.owner !== targetUnit.owner && currentMap) {
        const attackerPosAxial = logicalToAxial(attackerUnit.position.x, attackerUnit.position.y);
        const targetPosAxial = logicalToAxial(targetUnit.position.x, targetUnit.position.y);
        const distance = hexDistance(attackerPosAxial.q, attackerPosAxial.r, targetPosAxial.q, targetPosAxial.r);

        let weaponToUseRange: number | undefined;
        const targetDef = UNITS_MAP.get(targetUnit.unitId);
        const targetHasArmor = targetDef ? (targetDef.stats.armor.front > 0 || targetDef.stats.armor.side > 0 || targetDef.stats.armor.back > 0 || targetDef.stats.armor.top > 0) : false;

        if (targetHasArmor) {
            // 装甲を持つターゲットにはAP武器のみ考慮
            if (attackerDef.stats.apWeapon && distance <= attackerDef.stats.apWeapon.range) {
                weaponToUseRange = attackerDef.stats.apWeapon.range;
            }
        } else {
            // 装甲を持たないターゲットにはHE武器のみ考慮
            if (attackerDef.stats.heWeapon && distance <= attackerDef.stats.heWeapon.range) {
                weaponToUseRange = attackerDef.stats.heWeapon.range;
            }
        }
        
        const dx = targetUnit.position.x - attackerUnit.position.x;
        const dy = targetUnit.position.y - attackerUnit.position.y;
        let newTargetOrientationDeg = attackerUnit.orientation;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            newTargetOrientationDeg = (Math.atan2(dy, dx) * (180 / Math.PI) + 360) % 360;
        }

        if (weaponToUseRange !== undefined ) { // Unit is in range with some weapon
            if (hasLineOfSight(attackerUnit, targetUnit, currentMap, allUnits)) {
                // console.log(`${attackerUnit.name} is in range and has LoS to ${targetUnit.name}. Setting to aim.`);
                updateUnitOnMap(attackerUnit.instanceId, {
                    attackTargetInstanceId: targetUnit.instanceId,
                    moveTargetPosition: null, currentPath: null, isMoving: false,
                    targetOrientation: newTargetOrientationDeg,
                    isTurning: Math.abs(newTargetOrientationDeg - attackerUnit.orientation) > 1 && !!attackerDef.stats.turnSpeed,
                    status: 'aiming',
                });
            } else { // In range, but no LoS
                // console.log(`${attackerUnit.name} is in range BUT NO LoS to ${targetUnit.name}. Moving to engage target hex.`);
                // Option: Move towards target to gain LoS. For now, just set target, unit might try to fire if LoS clears.
                // Or, explicitly initiate move:
                updateUnitOnMap(attackerUnit.instanceId, { attackTargetInstanceId: targetUnit.instanceId, status: 'idle' }); // Set target, then move
                initiateMove(attackerUnit, targetUnit.position.x, targetUnit.position.y); 
            }
        } else { // Out of range for all weapons
            // console.log(`${attackerUnit.name} is out of range to ${targetUnit.name}. Moving to engage target hex.`);
            updateUnitOnMap(attackerUnit.instanceId, { attackTargetInstanceId: targetUnit.instanceId, status: 'idle' }); // Set target, then move
            initiateMove(attackerUnit, targetUnit.position.x, targetUnit.position.y);
        }
    }
  }, [updateUnitOnMap, initiateMove]);

  const handleHexClickInGame = useCallback((q: number, r: number, logicalX: number, logicalY: number, terrain: TerrainType, unitOnHex?: PlacedUnit, event?: React.MouseEvent) => {
    const currentUnits = useGameSettingsStore.getState().allUnitsOnMap;
    const selectedUnit = selectedUnitInstanceId ? currentUnits.find(u => u.instanceId === selectedUnitInstanceId) : null;

    setSelectedHexInfo({ q, r, logicalX, logicalY, terrain }); // クリックされたヘックス情報をストアに保存

    if (event?.button === 2) { // Right click
      event.preventDefault();
      if (selectedUnit && selectedUnit.owner === 'player') {
        if (unitOnHex && unitOnHex.owner === 'enemy') { // Right click on enemy unit
            handleAttackCommand(selectedUnit, unitOnHex); 
        } else { // Right click on empty hex or friendly unit (move command)
            updateUnitOnMap(selectedUnit.instanceId, { attackTargetInstanceId: null }); // Clear any previous attack target
            initiateMove(selectedUnit, logicalX, logicalY);
        }
      }
      return;
    }

    // Left click
    if (event?.ctrlKey && unitOnHex && selectedUnit) { // Ctrl + Left click on unit (Force attack)
      if (selectedUnit.owner === 'player' && unitOnHex.owner === 'enemy' && selectedUnit.instanceId !== unitOnHex.instanceId) {
          handleAttackCommand(selectedUnit, unitOnHex); 
      }
    } else if (unitOnHex) { // Left click on unit (Select)
      setSelectedUnitInstanceId(unitOnHex.instanceId);
    } else { // Left click on empty hex (Deselect)
      setSelectedUnitInstanceId(null);
    }
  }, [selectedUnitInstanceId, initiateMove, handleAttackCommand, updateUnitOnMap]);

  const handlePause = () => { alert("Game Paused (Pause Menu to be implemented)"); };
  const handleSurrender = () => {
    const currentGameOverMsg = useGameSettingsStore.getState().gameOverMessage;
    if (!currentGameOverMsg) setGameOver("Player Surrendered");
  };

  useEffect(() => {
    if (selectedUnitInstanceId) {
        const unit = useGameSettingsStore.getState().allUnitsOnMap.find(u => u.instanceId === selectedUnitInstanceId);
        setDetailedSelectedUnitInfo(unit || null);
    } else { setDetailedSelectedUnitInfo(null); }
  }, [selectedUnitInstanceId, allUnitsOnMapFromStore]); // allUnitsOnMapFromStore to update info if unit changes

  useEffect(() => {
    const currentGameOverMsg = useGameSettingsStore.getState().gameOverMessage;
    if (currentGameOverMsg) {
        console.log("Game Over:", currentGameOverMsg);
        setTimeout(() => {
            let status = "draw";
            if (currentGameOverMsg.includes("Player Wins")) status = "win";
            else if (currentGameOverMsg.includes("Enemy Wins") || currentGameOverMsg.includes("Surrendered")) status = "lose";
            if (router) router.push(`/results?status=${status}&mapId=${mapIdParam || selectedMapIdFromStore || 'unknown'}&reason=${encodeURIComponent(currentGameOverMsg)}`);
        }, 3000);
    }
  }, [gameOverMessage, router, mapIdParam, selectedMapIdFromStore]);

  const unitsToDisplayOnGrid: PlacedUnit[] = [];

  // Add player units
  allUnitsOnMapFromStore.filter(u => u.owner === 'player' && u.status !== 'destroyed')
    .forEach(unit => unitsToDisplayOnGrid.push(unit));

  // Add visible enemy units
  allUnitsOnMapFromStore.filter(u => u.owner === 'enemy' && u.status !== 'destroyed')
    .forEach(enemyUnit => {
        const enemyAxial = logicalToAxial(enemyUnit.position.x, enemyUnit.position.y);
        const hexKey = `${enemyAxial.q},${enemyAxial.r}`;
        if (playerVisibilityMap[hexKey]) {
            unitsToDisplayOnGrid.push(enemyUnit);
        }
    });

  // Add last seen enemy units (if not currently visible)
  for (const instanceId in lastKnownEnemyPositions) {
    const lastSeenPos = lastKnownEnemyPositions[instanceId];
    const isCurrentlyVisible = unitsToDisplayOnGrid.some(u => u.instanceId === instanceId);
    if (!isCurrentlyVisible) {
        // Reconstruct a "ghost" unit for display
        const originalUnit = ALL_UNITS.find(u => u.id === instanceId.split('_')[0]); // Assuming unitId is first part of instanceId
        if (originalUnit) {
            unitsToDisplayOnGrid.push({
                instanceId: instanceId,
                unitId: originalUnit.id,
                name: originalUnit.name,
                cost: originalUnit.cost,
                position: { x: lastSeenPos.x, y: lastSeenPos.y },
                currentHp: 0, // Or some placeholder HP
                owner: 'enemy',
                orientation: 0, // Or last known orientation
                status: 'idle', // Or 'last_seen'
                isTurning: false, isMoving: false, moveTargetPosition: null, currentPath: null, timeToNextHex: null,
                attackTargetInstanceId: null, lastAttackTimeHE: undefined, lastAttackTimeAP: undefined,
                lastSuccessfulAttackTimestamp: undefined, justHit: false, hitTimestamp: undefined, 
                productionQueue: [],
            });
        }
    }
  }


  const handleStartProductionRequest = (producerCommanderId: string, unitToProduceId: string) => {
    const unitDef = UNITS_MAP.get(unitToProduceId);
    if (!unitDef) { alert("Unit definition not found for production."); return; }
    const result = startUnitProductionAction(producerCommanderId, unitToProduceId, 'player');
    if (result.success) { console.log(result.message); }
    else { alert(`Failed to start production: ${result.message}`); }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      {gameOverMessage && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 pointer-events-none">
              <h1 className="text-4xl font-bold text-yellow-400 animate-pulse">{gameOverMessage}</h1>
          </div>
      )}
      <header className="h-16 bg-black bg-opacity-50 p-3 flex justify-between items-center shadow-lg z-10">
        <div className="flex items-center space-x-6">
          <div>KigaShogi</div>
          <div>Map: <span className="font-semibold">{currentMapDataFromStore?.name || mapIdParam || 'N/A'}</span></div>
          <div>Time: <span className="font-semibold">
              {Math.floor(gameTimeFromStore / 60).toString().padStart(2, '0')}:
              {(gameTimeFromStore % 60).toString().padStart(2, '0')}
          </span> / <span className="text-gray-400">
              {Math.floor(gameTimeLimit / 60).toString().padStart(2, '0')}:
              {(gameTimeLimit % 60).toString().padStart(2, '0')}
          </span></div>
        </div>
        <div className="flex items-center space-x-4">
          <div>P-Res: <span className="font-bold text-yellow-400">{playerResources}</span></div>
          <div>E-Res: <span className="font-bold text-orange-400">{enemyResourcesStore}</span></div>
          <div>VP:
            <span className="text-blue-400 font-semibold"> {victoryPoints.player}</span> /
            <span className="text-red-400 font-semibold"> {victoryPoints.enemy}</span> {}
            (<span className="text-gray-400">T: {targetVictoryPoints}</span>)
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Button onClick={handlePause} variant="secondary" size="sm">Pause</Button>
          <Button onClick={handleSurrender} variant="danger" size="sm" disabled={!!gameOverMessage}>Surrender</Button>
        </div>
      </header>

      <main className="flex-grow flex relative">
        <aside className="w-72 bg-gray-800 bg-opacity-80 p-3 space-y-3 overflow-y-auto shadow-md">
          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2">Unit Information</h2>
          {detailedSelectedUnitInfo && UNITS_MAP.has(detailedSelectedUnitInfo.unitId) ? (
            (() => {
              const unitDef = UNITS_MAP.get(detailedSelectedUnitInfo.unitId)!;
              return (
                <div className="text-sm space-y-1">
                  <p className="text-base"><span className="font-medium">{unitDef.icon} {unitDef.name}</span></p>
                  <p>ID: <span className="text-xs text-gray-400">{detailedSelectedUnitInfo.instanceId.slice(-6)}</span></p>
                  <p>Owner: <span className={detailedSelectedUnitInfo.owner === 'player' ? 'text-blue-300' : 'text-red-300'}>{detailedSelectedUnitInfo.owner}</span></p>
                  <p>HP: {detailedSelectedUnitInfo.currentHp} / {unitDef.stats.hp}</p>
                  {unitDef.stats.hp > 0 && detailedSelectedUnitInfo.currentHp !== undefined && (
                    <div className="w-full bg-gray-600 rounded-full h-2.5 my-1">
                      <div
                        className={`h-2.5 rounded-full ${
                          detailedSelectedUnitInfo.currentHp / unitDef.stats.hp > 0.6 ? 'bg-green-500' :
                          detailedSelectedUnitInfo.currentHp / unitDef.stats.hp > 0.3 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${Math.max(0, (detailedSelectedUnitInfo.currentHp / unitDef.stats.hp) * 100)}%` }}
                      ></div>
                    </div>
                  )}
                  <p>Pos: ({detailedSelectedUnitInfo.position.x.toFixed(1)}, {detailedSelectedUnitInfo.position.y.toFixed(1)}) Orient: {detailedSelectedUnitInfo.orientation.toFixed(0)}°</p>
                  {detailedSelectedUnitInfo.status && <p className="capitalize">Status: <span className="text-yellow-300">{detailedSelectedUnitInfo.status.replace(/_/g, ' ')}</span></p>}
                  {detailedSelectedUnitInfo.isTurning && detailedSelectedUnitInfo.targetOrientation !== undefined && <p className="text-yellow-400">Turning to {detailedSelectedUnitInfo.targetOrientation.toFixed(0)}°</p>}
                  {detailedSelectedUnitInfo.isMoving && detailedSelectedUnitInfo.moveTargetPosition && <p className="text-green-400">Moving to ({detailedSelectedUnitInfo.moveTargetPosition.x.toFixed(1)},{detailedSelectedUnitInfo.moveTargetPosition.y.toFixed(1)})</p>}
                  {detailedSelectedUnitInfo.attackTargetInstanceId &&
                    (() => {
                        const target = useGameSettingsStore.getState().allUnitsOnMap.find(u=>u.instanceId === detailedSelectedUnitInfo.attackTargetInstanceId);
                        return <p className="text-red-400">Targeting: {target?.name || 'Unknown'} ({target?.instanceId.slice(-4)})</p>;
                    })()
                  }
                  <p className="mt-2 font-semibold">Stats:</p>
                  <p>Armor: F:{unitDef.stats.armor.front} S:{unitDef.stats.armor.side} B:{unitDef.stats.armor.back} T:{unitDef.stats.armor.top}</p>
                  {unitDef.stats.heWeapon && <p>HE: {unitDef.stats.heWeapon.power}P / {unitDef.stats.heWeapon.range}R / {unitDef.stats.heWeapon.dps}DPS</p>}
                  {unitDef.stats.apWeapon && <p>AP: {unitDef.stats.apWeapon.power}P / {unitDef.stats.apWeapon.range}R / {unitDef.stats.apWeapon.dps}DPS</p>}
                  <p>Move: {unitDef.stats.moveSpeed} hex/s</p>
                  <p>Sight: x{unitDef.stats.sightMultiplier} / {unitDef.stats.baseDetectionRange} hex</p>
                  {unitDef.stats.turnSpeed !== undefined && <p>Turn: {unitDef.stats.turnSpeed}°/s</p>}
                </div>
              );
            })()
          ) : (
            <p className="text-gray-400 text-sm">No unit selected.</p>
          )}

          {detailedSelectedUnitInfo && UNITS_MAP.get(detailedSelectedUnitInfo.unitId)?.isCommander && detailedSelectedUnitInfo.owner === 'player' && (
            <>
              <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 pt-4">Unit Production</h2>
              {detailedSelectedUnitInfo.productionQueue && detailedSelectedUnitInfo.productionQueue.length > 0 && (
                <div className="text-sm p-2 bg-gray-700 rounded mb-4">
                  <p className="font-semibold mb-1">Production Queue:</p>
                  {detailedSelectedUnitInfo.productionQueue.map((item, idx) => (
                    <div key={idx} className={`mb-2 ${idx === 0 ? 'border-b border-gray-600 pb-2' : ''}`}>
                      <p>
                        {idx === 0 ? 'Producing:' : 'Queued:'} {UNITS_MAP.get(item.unitIdToProduce)?.name}
                        <span className="ml-2 text-xs text-gray-400">({UNITS_MAP.get(item.unitIdToProduce)?.cost}C)</span>
                      </p>
                      {idx === 0 && (
                        <>
                          <p>Time Left: {(item.timeLeftMs / 1000).toFixed(1)}s</p>
                          <div className="w-full bg-gray-600 rounded-full h-2.5 my-1">
                            <div
                              className="bg-blue-500 h-2.5 rounded-full"
                              style={{ width: `${100 - (item.timeLeftMs / item.originalProductionTimeMs) * 100}%` }}
                            ></div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2 text-sm">
                {ALL_UNITS.filter(u => !u.isCommander && u.id !== 'special_forces').map(unitToProduce => (
                  <div key={unitToProduce.id} className="p-2 bg-gray-700 hover:bg-gray-600 rounded flex justify-between items-center">
                    <div>
                      <span>{unitToProduce.icon} {unitToProduce.name}</span>
                      <span className="ml-2 text-xs text-yellow-400">({unitToProduce.cost}C)</span>
                      <span className="ml-2 text-xs text-gray-400">[{unitToProduce.productionTime}s]</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => detailedSelectedUnitInfo && handleStartProductionRequest(detailedSelectedUnitInfo.instanceId, unitToProduce.id)}
                      disabled={playerResources < unitToProduce.cost || !!gameOverMessage} // productionQueueのチェックを削除
                    >
                      Build
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 pt-4">Hex Information</h2>
          {selectedHexInfo ? (
            <div className="text-sm space-y-1">
              <p>Q: {selectedHexInfo.q}, R: {selectedHexInfo.r}</p>
              <p>Logical X: {selectedHexInfo.logicalX}, Y: {selectedHexInfo.logicalY}</p>
              <p>Terrain: <span className="capitalize">{selectedHexInfo.terrain.replace(/_/g, ' ')}</span></p>
              {/* ここに地形効果の情報を追加できます */}
              {selectedHexInfo.terrain === 'forest' && <p className="text-green-300">効果: 視界が制限され、防御ボーナスがあります。</p>}
              {selectedHexInfo.terrain === 'hills' && <p className="text-gray-300">効果: 高台からの射撃にボーナスがあります。</p>}
              {selectedHexInfo.terrain === 'road' && <p className="text-yellow-300">効果: 移動速度が向上します。</p>}
              {selectedHexInfo.terrain === 'city' && <p className="text-blue-300">効果: 防御ボーナスがあり、視界が制限されます。</p>}
              {selectedHexInfo.terrain === 'water' && <p className="text-blue-300">効果: ほとんどのユニットは移動できません。</p>}
              {selectedHexInfo.terrain === 'mountain' && <p className="text-gray-300">効果: 移動が非常に困難で、視界が制限されます。</p>}
              {selectedHexInfo.terrain === 'swamp' && <p className="text-purple-300">効果: 移動速度が低下し、視界が制限されます。</p>}
              {selectedHexInfo.terrain === 'plains' && <p className="text-green-300">効果: 標準的な地形です。</p>}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No hex selected.</p>
          )}
        </aside>

        <section className="flex-grow bg-gray-700 flex items-center justify-center relative">
          <GameplayHexGrid
            mapData={currentMapDataFromStore}
            hexSize={28}
            placedUnits={unitsToDisplayOnGrid} 
            onHexClick={handleHexClickInGame}
            selectedUnitInstanceId={selectedUnitInstanceId}
            attackingPairs={attackingVisuals}
            strategicPoints={currentMapDataFromStore?.strategicPoints || []}
          />
          <div className="absolute bottom-4 right-4 w-56 h-44 bg-green-900 bg-opacity-70 border-2 border-gray-600 rounded shadow-xl p-1 text-xs">
            <p className="text-center text-green-300">Mini-map Placeholder</p>
            {currentMapDataFromStore && (
                <div>
                    Grid: {currentMapDataFromStore.cols}x{currentMapDataFromStore.rows} <br/>
                    Hexes defined: {Object.keys(currentMapDataFromStore.hexes || {}).length}
                </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function GameplayScreen() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-gray-900 text-white text-xl">Loading gameplay...</div>}>
      <GameplayContent />
    </Suspense>
  );
}
