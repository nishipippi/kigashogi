// src/app/gameplay/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useCallback } from 'react';
import { useGameSettingsStore, type PlacedUnit } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import GameplayHexGrid from '@/components/game/GameplayHexGrid';
import { ALL_MAPS_DATA } from '@/gameData/maps';
import type { MapData, HexData, StrategicPoint } from '@/types/map'; // HexData, StrategicPoint をインポート
import { TERRAIN_MOVE_COSTS } from '@/types/map';
import { ALL_UNITS, UNITS_MAP } from '@/gameData/units';
import { hexDistance, logicalToAxial, axialToLogical, findPathAStar } from '@/lib/hexUtils';
import { hasLineOfSight, calculateDamage } from '@/lib/battleUtils';
import { canObserveTarget } from '@/lib/visibilityUtils';
import { decideCommanderAIAction, decideCombatAIAction, type AIAction } from '@/lib/aiUtils';

const BASE_CAPTURE_DURATION_MS = 10000;
const TICK_RATE_MS = 100;

interface LastSeenUnitInfo extends PlacedUnit {
    lastSeenTime: number;
    isLastSeen?: boolean;
}

function GameplayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapIdParam = searchParams.get('mapId');

  const storeInitialCost = useGameSettingsStore(state => state.initialCost);
  const selectedMapIdFromStore = useGameSettingsStore(state => state.selectedMapId);
  const allUnitsOnMapFromStore = useGameSettingsStore(state => state.allUnitsOnMap);
  const updateUnitOnMap = useGameSettingsStore(state => state.updateUnitOnMap);
  const setAllUnitsOnMapDirectly = useGameSettingsStore(state => state.setAllUnitsOnMap);
  const gameOverMessage = useGameSettingsStore(state => state.gameOverMessage);
  const setGameOver = useGameSettingsStore(state => state.setGameOver);

  const playerResources = useGameSettingsStore(state => state.playerResources);
  const enemyResourcesStore = useGameSettingsStore(state => state.enemyResources);
  const startUnitProductionAction = useGameSettingsStore(state => state.startUnitProduction);
  const clearCommanderProductionQueueAction = useGameSettingsStore(state => state.clearCommanderProductionQueue);
  const addUnitToMapAction = useGameSettingsStore(state => state.addUnitToMap);
  const addPlayerResourcesAction = useGameSettingsStore(state => state.addPlayerResources);
  const addEnemyResourcesAction = useGameSettingsStore(state => state.addEnemyResources);

  const setMapDataInStore = useGameSettingsStore(state => state.setCurrentMapData);
  const updateStrategicPointState = useGameSettingsStore(state => state.updateStrategicPointState);
  const playerVP = useGameSettingsStore(state => state.victoryPoints.player);
  const enemyVP = useGameSettingsStore(state => state.victoryPoints.enemy);
  const gameTimeFromStore = useGameSettingsStore(state => state.gameTimeElapsed);
  const gameTimeLimit = useGameSettingsStore(state => state.gameTimeLimit);
  const targetVictoryPoints = useGameSettingsStore(state => state.targetVictoryPoints);
  const addVictoryPointsToPlayer = useGameSettingsStore(state => state.addVictoryPointsToPlayer);
  const incrementGameTime = useGameSettingsStore(state => state.incrementGameTime);
  const resetGameSessionState = useGameSettingsStore(state => state.resetGameSessionState);
  const currentMapDataFromStore = useGameSettingsStore(state => state.currentMapDataState);

  const [selectedUnitInstanceId, setSelectedUnitInstanceId] = useState<string | null>(null);
  const [detailedSelectedUnitInfo, setDetailedSelectedUnitInfo] = useState<PlacedUnit | null>(null);
  const [attackTargetInstanceId, setAttackTargetInstanceId] = useState<string | null>(null); // UIフィードバック用
  const [attackingVisuals, setAttackingVisuals] = useState<{ attackerId: string, targetId: string, weaponType: 'HE' | 'AP' }[]>([]);
  const [visibleEnemyUnits, setVisibleEnemyUnits] = useState<PlacedUnit[]>([]);
  const [lastSeenEnemyUnits, setLastSeenEnemyUnits] = useState<Map<string, LastSeenUnitInfo>>(new Map());
  const LAST_SEEN_DURATION = 5000;

  const COST_REVENUE_INTERVAL_SECONDS = 10;
  const COST_REVENUE_AMOUNT = 50;
  const gameTickRate = TICK_RATE_MS;

  useEffect(() => {
    resetGameSessionState();
    const mapIdToLoad = mapIdParam || selectedMapIdFromStore;
    if (mapIdToLoad && ALL_MAPS_DATA[mapIdToLoad]) {
      const mapData = ALL_MAPS_DATA[mapIdToLoad];
      setMapDataInStore(mapData);
    } else {
      console.warn(`Map with id "${mapIdToLoad}" not found.`);
      setMapDataInStore(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapIdParam, selectedMapIdFromStore, setMapDataInStore, resetGameSessionState]);

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

      const { victoryPoints: currentVP, gameTimeLimit: timeLimitFromStoreG, targetVictoryPoints: targetVPFromStoreG, gameOverMessage: msg } = useGameSettingsStore.getState();
      if (!msg) { // gameOverMessage がセットされていない場合のみ判定
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


  const getTimeToTraverseHex = useCallback((unitDef: UnitData, targetHexQ: number, targetHexR: number, map: MapData | null): number => {
    const baseTimePerHex = (1 / (unitDef.stats.moveSpeed || 1)) * 1000;
    if (!map || !map.hexes) return baseTimePerHex;

    const hexKey = `${targetHexQ},${targetHexR}`;
    const hexData = map.hexes[hexKey];
    if (!hexData) return baseTimePerHex;

    const terrainCostMultiplier = TERRAIN_MOVE_COSTS[hexData.terrain];
    if (terrainCostMultiplier === Infinity) return Infinity;

    return baseTimePerHex * terrainCostMultiplier;
  }, []);


  const initiateMove = useCallback((unitToMove: PlacedUnit, targetLogicalX: number, targetLogicalY: number) => {
    const unitDef = UNITS_MAP.get(unitToMove.unitId);
    const currentMap = useGameSettingsStore.getState().currentMapDataState;
    const allUnits = useGameSettingsStore.getState().allUnitsOnMap;

    if (!unitDef || !currentMap || !currentMap.hexes) {
        updateUnitOnMap(unitToMove.instanceId, { currentPath: null, timeToNextHex: null, isMoving: false, status: 'idle', moveTargetPosition: null, attackTargetInstanceId: null });
        return;
    }

    const startAxial = logicalToAxial(unitToMove.position.x, unitToMove.position.y);
    const targetAxial = logicalToAxial(targetLogicalX, targetLogicalY);

    const goalHexKey = `${targetAxial.q},${targetAxial.r}`;
    const goalHexData = currentMap.hexes[goalHexKey];
    if (!goalHexData || TERRAIN_MOVE_COSTS[goalHexData.terrain] === Infinity) {
        updateUnitOnMap(unitToMove.instanceId, { currentPath: null, timeToNextHex: null, isMoving: false, status: 'idle', moveTargetPosition: null, attackTargetInstanceId: null });
        return;
    }

    const axialPath = findPathAStar(startAxial, targetAxial, currentMap, allUnits, unitToMove.instanceId);

    if (axialPath.length === 0 && (startAxial.q !== targetAxial.q || startAxial.r !== targetAxial.r)) {
        updateUnitOnMap(unitToMove.instanceId, { currentPath: null, timeToNextHex: null, isMoving: false, status: 'idle', moveTargetPosition: null, attackTargetInstanceId: null });
        return;
    }

    const logicalPath = axialPath.map(axial => axialToLogical(axial.q, axial.r));
    let newTargetOrientationDeg = unitToMove.orientation;
    let timeToFirstHex: number | null = null;

    if (logicalPath.length > 0) {
        const firstStepLogical = logicalPath[0];
        const firstStepAxial = axialPath[0];
        const firstStepDx = firstStepLogical.x - unitToMove.position.x;
        const firstStepDy = firstStepLogical.y - unitToMove.position.y;
        if (Math.abs(firstStepDx) > 0.01 || Math.abs(firstStepDy) > 0.01) {
            const angleRad = Math.atan2(firstStepDy, firstStepDx);
            newTargetOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360;
        }
        timeToFirstHex = getTimeToTraverseHex(unitDef, firstStepAxial.q, firstStepAxial.r, currentMap);
    } else if (startAxial.q === targetAxial.q && startAxial.r === targetAxial.r) {
        const dx = targetLogicalX - unitToMove.position.x;
        const dy = targetLogicalY - unitToMove.position.y;
         if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            const angleRad = Math.atan2(dy, dx);
            newTargetOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360;
        }
    }

    const needsToTurn = Math.abs(newTargetOrientationDeg - unitToMove.orientation) > 1 && unitDef.stats.turnSpeed !== undefined && unitDef.stats.turnSpeed > 0;

    updateUnitOnMap(unitToMove.instanceId, {
        currentPath: logicalPath.length > 0 ? logicalPath : null,
        timeToNextHex: (logicalPath.length > 0 && !needsToTurn && timeToFirstHex !== Infinity) ? timeToFirstHex : null,
        moveTargetPosition: { x: targetLogicalX, y: targetLogicalY },
        targetOrientation: newTargetOrientationDeg,
        isTurning: needsToTurn,
        isMoving: logicalPath.length > 0 && !needsToTurn && timeToFirstHex !== Infinity,
        status: needsToTurn ? 'turning' : (logicalPath.length > 0 && timeToFirstHex !== Infinity ? 'moving' : 'idle'),
        attackTargetInstanceId: null,
    });
  }, [updateUnitOnMap, getTimeToTraverseHex]);


  useEffect(() => {
    const unitProcessInterval = setInterval(() => {
        const currentGlobalState = useGameSettingsStore.getState(); // 最新のグローバル状態を取得
        if (currentGlobalState.gameOverMessage) { clearInterval(unitProcessInterval); return; }

        const currentTime = Date.now();
        const currentUnitsFromStore = currentGlobalState.allUnitsOnMap;
        const currentMapDataForLoop = currentGlobalState.currentMapDataState;
        let playerCommandersAlive = 0;
        let enemyCommandersAlive = 0;

        const playerUnits = currentUnitsFromStore.filter(u => u.owner === 'player' && u.status !== 'destroyed');
        const enemyUnitsActual = currentUnitsFromStore.filter(u => u.owner === 'enemy' && u.status !== 'destroyed');
        const newlyVisibleEnemies: PlacedUnit[] = [];

        enemyUnitsActual.forEach(enemyUnit => {
            let isVisible = false;
            for (const playerUnit of playerUnits) {
                // canObserveTarget の呼び出しに currentTime を追加
                if (canObserveTarget(playerUnit, enemyUnit, currentMapDataForLoop, currentUnitsFromStore, currentTime)) {
                    isVisible = true;
                    break;
                }
            }
            if (isVisible) {
                newlyVisibleEnemies.push(enemyUnit);
                setLastSeenEnemyUnits(prev => { const newMap = new Map(prev); newMap.delete(enemyUnit.instanceId); return newMap; });
            } else {
                const previouslyVisible = visibleEnemyUnits.find(veu => veu.instanceId === enemyUnit.instanceId);
                if (previouslyVisible && !lastSeenEnemyUnits.has(enemyUnit.instanceId)) {
                    setLastSeenEnemyUnits(prev => new Map(prev).set(enemyUnit.instanceId, { ...enemyUnit, lastSeenTime: currentTime, isLastSeen: true }));
                }
            }
        });
        setVisibleEnemyUnits(newlyVisibleEnemies);
        setLastSeenEnemyUnits(prev => {
            const newMap = new Map(prev);
            newMap.forEach((seenUnit, id) => { if (currentTime - seenUnit.lastSeenTime > LAST_SEEN_DURATION) newMap.delete(id); });
            return newMap;
        });

        currentUnitsFromStore.forEach(unit => {
            if (!unit || unit.status === 'destroyed') return;
            const unitDef = UNITS_MAP.get(unit.unitId);
            if (!unitDef) return;

            if (unitDef.isCommander) {
                if (unit.owner === 'player') playerCommandersAlive++;
                else if (unit.owner === 'enemy') enemyCommandersAlive++;
            }

            if (unit.justHit && unit.hitTimestamp && currentTime - unit.hitTimestamp > 300) {
                updateUnitOnMap(unit.instanceId, { justHit: false });
            }

            if (unit.isTurning && unit.targetOrientation !== undefined) {
                const turnSpeedDegPerTick = (unitDef.stats.turnSpeed || 3600) / (1000 / gameTickRate);
                let currentOrientation = unit.orientation; const targetOrientation = unit.targetOrientation;
                let diff = targetOrientation - currentOrientation; if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
                let newOrientation = currentOrientation;
                if (Math.abs(diff) < turnSpeedDegPerTick || Math.abs(diff) < 0.5) {
                    newOrientation = targetOrientation;
                    let timeToNextStep: number | null = null;
                    if (unit.currentPath && unit.currentPath.length > 0) {
                        const nextStepAxial = logicalToAxial(unit.currentPath[0].x, unit.currentPath[0].y);
                        timeToNextStep = getTimeToTraverseHex(unitDef, nextStepAxial.q, nextStepAxial.r, currentMapDataForLoop);
                    }
                    updateUnitOnMap(unit.instanceId, {
                        orientation: newOrientation, isTurning: false,
                        isMoving: !!unit.currentPath && unit.currentPath.length > 0 && timeToNextStep !== Infinity,
                        timeToNextHex: (!!unit.currentPath && unit.currentPath.length > 0 && timeToNextStep !== Infinity) ? timeToNextStep : null,
                        targetOrientation: undefined,
                        status: (!!unit.currentPath && unit.currentPath.length > 0 && timeToNextStep !== Infinity) ? 'moving' : (unit.attackTargetInstanceId ? 'aiming' : 'idle'),
                    });
                } else {
                    newOrientation = (currentOrientation + Math.sign(diff) * turnSpeedDegPerTick + 360) % 360;
                    updateUnitOnMap(unit.instanceId, { orientation: newOrientation });
                }
            }
            else if (unit.isMoving && unit.currentPath && unit.currentPath.length > 0 && unit.timeToNextHex !== null && unit.timeToNextHex !== undefined) {
                let newTimeToNextHex = unit.timeToNextHex - gameTickRate;
                if (newTimeToNextHex <= 0) {
                    const oldPosition = unit.position;
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
                            const angleRad = Math.atan2(dy, dx);
                            newOrientation = (angleRad * (180 / Math.PI) + 360) % 360;
                        }
                        needsToTurnAfterMove = Math.abs(newOrientation - unit.orientation) > 1 && unitDef.stats.turnSpeed !== undefined && unitDef.stats.turnSpeed > 0;

                        updateUnitOnMap(unit.instanceId, {
                            position: nextLogicalPosition,
                            orientation: needsToTurnAfterMove ? unit.orientation : newOrientation,
                            currentPath: remainingPath,
                            timeToNextHex: needsToTurnAfterMove || timeToNextStep === Infinity ? null : timeToNextStep,
                            isMoving: !needsToTurnAfterMove && timeToNextStep !== Infinity,
                            isTurning: needsToTurnAfterMove,
                            targetOrientation: needsToTurnAfterMove ? newOrientation : undefined,
                            status: needsToTurnAfterMove ? 'turning' : (timeToNextStep !== Infinity ? 'moving' : 'idle'),
                        });
                    } else {
                        updateUnitOnMap(unit.instanceId, {
                            position: nextLogicalPosition,
                            currentPath: null, timeToNextHex: null,
                            isMoving: false, isTurning: false, moveTargetPosition: null, status: 'idle',
                        });
                    }

                    if (currentMapDataForLoop?.strategicPoints) {
                        const spAtOldPosition = currentMapDataForLoop.strategicPoints.find(sp => sp.x === oldPosition.x && sp.y === oldPosition.y);
                        if (spAtOldPosition && spAtOldPosition.owner === unit.owner) {
                            const isAnyFriendlyUnitOnOldSP = currentUnitsFromStore.some(otherUnit =>
                                otherUnit.instanceId !== unit.instanceId &&
                                otherUnit.owner === unit.owner &&
                                otherUnit.position.x === oldPosition.x &&
                                otherUnit.position.y === oldPosition.y &&
                                otherUnit.status !== 'destroyed'
                            );
                            if (!isAnyFriendlyUnitOnOldSP) {
                                updateStrategicPointState(spAtOldPosition.id, { owner: 'neutral', captureProgress: 0, capturingPlayer: null });
                            }
                        }
                    }
                } else {
                    updateUnitOnMap(unit.instanceId, { timeToNextHex: newTimeToNextHex });
                }
            }
            else if (currentMapDataForLoop?.strategicPoints && (unit.status === 'idle' || unit.status === 'moving')) {
                const spUnderUnit = currentMapDataForLoop.strategicPoints.find(sp => sp.x === unit.position.x && sp.y === unit.position.y);
                if (spUnderUnit) {
                    const captureTime = spUnderUnit.timeToCapture || BASE_CAPTURE_DURATION_MS;
                    const enemyOnPoint = currentUnitsFromStore.some(otherUnit => otherUnit.owner !== unit.owner && otherUnit.position.x === spUnderUnit.x && otherUnit.position.y === spUnderUnit.y && otherUnit.status !== 'destroyed');

                    if (spUnderUnit.owner !== unit.owner && !enemyOnPoint) {
                        if (spUnderUnit.capturingPlayer === unit.owner || !spUnderUnit.capturingPlayer) {
                            let currentProgress = spUnderUnit.captureProgress || 0;
                            if (spUnderUnit.owner !== 'neutral' && spUnderUnit.owner !== unit.owner && spUnderUnit.capturingPlayer !== unit.owner) {
                                currentProgress -= (gameTickRate / captureTime) * 100 * 1.5;
                                if (currentProgress <= 0) {
                                    updateStrategicPointState(spUnderUnit.id, { owner: 'neutral', captureProgress: 0, capturingPlayer: unit.owner });
                                } else {
                                    updateStrategicPointState(spUnderUnit.id, { captureProgress: currentProgress, capturingPlayer: unit.owner });
                                }
                            } else {
                                currentProgress += (gameTickRate / captureTime) * 100;
                                if (currentProgress >= 100) {
                                    updateStrategicPointState(spUnderUnit.id, { owner: unit.owner, captureProgress: 100, capturingPlayer: null });
                                } else {
                                    updateStrategicPointState(spUnderUnit.id, { captureProgress: currentProgress, capturingPlayer: unit.owner });
                                }
                            }
                        }
                    } else if (spUnderUnit.owner === unit.owner && spUnderUnit.capturingPlayer && spUnderUnit.capturingPlayer !== unit.owner && !enemyOnPoint) {
                        updateStrategicPointState(spUnderUnit.id, { capturingPlayer: null, captureProgress: 0 });
                    } else if (enemyOnPoint && spUnderUnit.capturingPlayer === unit.owner) {
                        updateStrategicPointState(spUnderUnit.id, { capturingPlayer: null });
                    }
                }
            }
            else if (unit.attackTargetInstanceId && (unit.status === 'aiming' || unit.status === 'attacking_he' || unit.status === 'attacking_ap' || unit.status === 'reloading_he' || unit.status === 'reloading_ap')) {
                if (unit.isTurning || unit.isMoving) return;
                const targetUnit = currentUnitsFromStore.find(u => u.instanceId === unit.attackTargetInstanceId && u.status !== 'destroyed');
                if (!targetUnit) { updateUnitOnMap(unit.instanceId, { status: 'idle', attackTargetInstanceId: null }); return; }

                const dx = targetUnit.position.x - unit.position.x; const dy = targetUnit.position.y - unit.position.y;
                let requiredOrientationDeg = unit.orientation;
                if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { const angleRad = Math.atan2(dy, dx); requiredOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360; }

                if (Math.abs(requiredOrientationDeg - unit.orientation) > 5) {
                    updateUnitOnMap(unit.instanceId, { targetOrientation: requiredOrientationDeg, isTurning: true, status: 'aiming' });
                    return;
                }
                if (!hasLineOfSight(unit, targetUnit, currentMapDataForLoop, currentUnitsFromStore)) {
                    updateUnitOnMap(unit.instanceId, { status: 'aiming' });
                    return;
                }

                const attackerPosAxial = logicalToAxial(unit.position.x, unit.position.y);
                const targetPosAxial = logicalToAxial(targetUnit.position.x, targetUnit.position.y);
                const distance = hexDistance(attackerPosAxial.q, attackerPosAxial.r, targetPosAxial.q, targetPosAxial.r);

                let weaponChoice: { type: 'HE' | 'AP', stats: NonNullable<UnitData['stats']['heWeapon'] | UnitData['stats']['apWeapon']> } | null = null;
                const targetDef = UNITS_MAP.get(targetUnit.unitId);
                if (targetDef) {
                    const targetHasArmor = targetDef.stats.armor.front > 0 || targetDef.stats.armor.side > 0 || targetDef.stats.armor.back > 0 || targetDef.stats.armor.top > 0;
                    if (unitDef.stats.apWeapon && distance <= unitDef.stats.apWeapon.range && targetHasArmor) {
                        weaponChoice = { type: 'AP', stats: unitDef.stats.apWeapon };
                    } else if (unitDef.stats.heWeapon && distance <= unitDef.stats.heWeapon.range) {
                        weaponChoice = { type: 'HE', stats: unitDef.stats.heWeapon };
                    } else if (unitDef.stats.apWeapon && distance <= unitDef.stats.apWeapon.range) {
                        weaponChoice = { type: 'AP', stats: unitDef.stats.apWeapon };
                    }
                }

                if (!weaponChoice) {
                    updateUnitOnMap(unit.instanceId, { status: 'aiming', attackTargetInstanceId: targetUnit.instanceId });
                    return;
                }

                if (unit.status === `attacking_${weaponChoice.type.toLowerCase()}`) {
                    const visualEffect = { attackerId: unit.instanceId, targetId: targetUnit.instanceId, weaponType: weaponChoice.type };
                    setAttackingVisuals(prev => [...prev, visualEffect]);
                    setTimeout(() => setAttackingVisuals(prev => prev.filter(v => v.attackerId !== visualEffect.attackerId || v.targetId !== visualEffect.targetId)), 200);

                    if (targetDef) {
                        const damageResult = calculateDamage(
                            unitDef, weaponChoice.type, targetDef,
                            unit.orientation, targetUnit.orientation, targetUnit.position, unit.position
                        );
                        const newTargetHp = Math.max(0, targetUnit.currentHp - damageResult.damageDealt);
                        if (newTargetHp <= 0) {
                            updateUnitOnMap(targetUnit.instanceId, { currentHp: 0, status: 'destroyed' });
                            updateUnitOnMap(unit.instanceId, { status: 'idle', attackTargetInstanceId: null, lastAttackTimeAP: undefined, lastAttackTimeHE: undefined });
                        } else {
                            updateUnitOnMap(targetUnit.instanceId, { currentHp: newTargetHp, justHit: true, hitTimestamp: currentTime });
                            updateUnitOnMap(unit.instanceId, { status: weaponChoice.type === 'HE' ? 'reloading_he' : 'reloading_ap', [weaponChoice.type === 'HE' ? 'lastAttackTimeHE' : 'lastAttackTimeAP']: currentTime });
                        }
                    } else {
                         updateUnitOnMap(unit.instanceId, { status: 'idle', attackTargetInstanceId: null });
                    }
                } else if (unit.status === 'aiming' || unit.status === `reloading_${weaponChoice.type.toLowerCase()}`) {
                    const attackIntervalMs = weaponChoice.stats.attackInterval * 1000;
                    const lastAttackTime = weaponChoice.type === 'HE' ? unit.lastAttackTimeHE : unit.lastAttackTimeAP;
                    if (!lastAttackTime || currentTime - lastAttackTime >= attackIntervalMs) {
                        updateUnitOnMap(unit.instanceId, { status: weaponChoice.type === 'HE' ? 'attacking_he' : 'attacking_ap' });
                    }
                }
            }

            if (unit.owner === 'player' && unit.productionQueue && unitDef.isCommander) {
                let newTimeLeftMs = unit.productionQueue.timeLeftMs - gameTickRate;
                if (newTimeLeftMs <= 0) {
                    const producedUnitId = unit.productionQueue.unitIdToProduce;
                    const producedUnitDef = UNITS_MAP.get(producedUnitId);
                    if (producedUnitDef) {
                        let spawnPos: {x: number, y: number} | null = null;
                        const trySpawnPos = { x: unit.position.x, y: unit.position.y + 1 };
                        const trySpawnAxial = logicalToAxial(trySpawnPos.x, trySpawnPos.y);
                        const spawnHexKey = `${trySpawnAxial.q},${trySpawnAxial.r}`;
                        const isSpawnValid = currentMapDataForLoop?.hexes[spawnHexKey] && TERRAIN_MOVE_COSTS[currentMapDataForLoop.hexes[spawnHexKey].terrain] !== Infinity;
                        const isSpawnOccupied = currentUnitsFromStore.some(u => u.position.x === trySpawnPos.x && u.position.y === trySpawnPos.y && u.status !== 'destroyed');
                        if (isSpawnValid && !isSpawnOccupied) {
                            spawnPos = trySpawnPos;
                        } else {
                             console.warn(`Player Commander ${unit.instanceId}: Spawn pos for ${producedUnitDef.name} invalid or occupied.`);
                        }
                        if (spawnPos) {
                            const newUnitInstanceId = `${producedUnitId}_player_${Date.now()}_${Math.random().toString(16).slice(2)}`;
                            const newPlacedUnit: PlacedUnit = {
                                instanceId: newUnitInstanceId, unitId: producedUnitId, name: producedUnitDef.name, cost: producedUnitDef.cost,
                                position: spawnPos, currentHp: producedUnitDef.stats.hp, owner: 'player', orientation: 0, status: 'idle',
                                isTurning: false, isMoving: false, moveTargetPosition: null, currentPath: null, timeToNextHex: null,
                                attackTargetInstanceId: null, lastAttackTimeHE: undefined, lastAttackTimeAP: undefined,
                                justHit: false, hitTimestamp: undefined, productionQueue: null,
                            };
                            addUnitToMapAction(newPlacedUnit);
                        }
                    }
                    clearCommanderProductionQueueAction(unit.instanceId);
                } else {
                    updateUnitOnMap(unit.instanceId, { productionQueue: { ...unit.productionQueue, timeLeftMs: newTimeLeftMs }});
                }
            }

            if (unit.owner === 'enemy' && !currentGlobalState.gameOverMessage) { // gameOverMessage を参照
                let aiDecision: AIAction | null = null;
                if (unitDef.isCommander) {
                    aiDecision = decideCommanderAIAction(unit, unitDef, currentUnitsFromStore, currentGlobalState.enemyResources, currentMapDataForLoop);
                } else {
                    aiDecision = decideCombatAIAction(unit, unitDef, currentUnitsFromStore, currentMapDataForLoop);
                }
                if (aiDecision) {
                    switch (aiDecision.type) {
                        case 'PRODUCE':
                            if (aiDecision.targetUnitId) {
                                const prodResult = startUnitProductionAction(unit.instanceId, aiDecision.targetUnitId, 'enemy');
                            }
                            break;
                        case 'MOVE':
                            if (aiDecision.targetPosition) {
                                if (unit.status !== 'moving' && unit.status !== 'turning' &&
                                    (!unit.moveTargetPosition || unit.moveTargetPosition.x !== aiDecision.targetPosition.x || unit.moveTargetPosition.y !== aiDecision.targetPosition.y)) {
                                    initiateMove(unit, aiDecision.targetPosition.x, aiDecision.targetPosition.y);
                                }
                            }
                            break;
                        case 'ATTACK':
                            if (aiDecision.attackTargetInstanceId) {
                                const targetPlayerUnit = currentUnitsFromStore.find(u => u.instanceId === aiDecision.attackTargetInstanceId && u.owner === 'player' && u.status !== 'destroyed');
                                if (targetPlayerUnit) {
                                    if (unit.attackTargetInstanceId !== targetPlayerUnit.instanceId ||
                                        !(unit.status?.startsWith('attacking_') || unit.status?.startsWith('reloading_') || unit.status === 'aiming')) {
                                        const dx = targetPlayerUnit.position.x - unit.position.x;
                                        const dy = targetPlayerUnit.position.y - unit.position.y;
                                        let newTargetOrientationDeg = unit.orientation;
                                        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
                                            const angleRad = Math.atan2(dy, dx);
                                            newTargetOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360;
                                        }
                                        updateUnitOnMap(unit.instanceId, {
                                            attackTargetInstanceId: targetPlayerUnit.instanceId, moveTargetPosition: null,
                                            targetOrientation: newTargetOrientationDeg,
                                            isTurning: Math.abs(newTargetOrientationDeg - unit.orientation) > 1 && !!unitDef.stats.turnSpeed,
                                            isMoving: false, status: 'aiming', currentPath: null,
                                        });
                                    }
                                }
                            }
                            break;
                        case 'IDLE': break;
                    }
                }
            }
            if (unit.owner === 'enemy' && unit.productionQueue && unitDef.isCommander) {
                let newTimeLeftMs = unit.productionQueue.timeLeftMs - gameTickRate;
                if (newTimeLeftMs <= 0) {
                    const producedUnitId = unit.productionQueue.unitIdToProduce;
                    const producedUnitDef = UNITS_MAP.get(producedUnitId);
                    if (producedUnitDef) {
                        let spawnPos: {x: number, y: number} | null = null;
                        const trySpawnPos = { x: unit.position.x, y: unit.position.y - 1 };
                        const trySpawnAxial = logicalToAxial(trySpawnPos.x, trySpawnPos.y);
                        const spawnHexKey = `${trySpawnAxial.q},${trySpawnAxial.r}`;
                        const isSpawnValid = currentMapDataForLoop?.hexes[spawnHexKey] && TERRAIN_MOVE_COSTS[currentMapDataForLoop.hexes[spawnHexKey].terrain] !== Infinity;
                        const isSpawnOccupied = currentUnitsFromStore.some(u => u.position.x === trySpawnPos.x && u.position.y === trySpawnPos.y && u.status !== 'destroyed');
                        if (isSpawnValid && !isSpawnOccupied) {
                            spawnPos = trySpawnPos;
                        } else {
                            console.warn(`AI Commander ${unit.instanceId}: Spawn pos for ${producedUnitDef.name} invalid or occupied.`);
                        }
                        if (spawnPos) {
                            const newUnitInstanceId = `${producedUnitId}_enemy_${Date.now()}_${Math.random().toString(16).slice(2)}`;
                            const newPlacedUnit: PlacedUnit = {
                                instanceId: newUnitInstanceId, unitId: producedUnitId, name: producedUnitDef.name, cost: producedUnitDef.cost,
                                position: spawnPos, currentHp: producedUnitDef.stats.hp, owner: 'enemy', orientation: 180, status: 'idle',
                                isTurning: false, isMoving: false, moveTargetPosition: null, currentPath: null, timeToNextHex: null,
                                attackTargetInstanceId: null, lastAttackTimeHE: undefined, lastAttackTimeAP: undefined,
                                justHit: false, hitTimestamp: undefined, productionQueue: null,
                            };
                            addUnitToMapAction(newPlacedUnit);
                        }
                    }
                    clearCommanderProductionQueueAction(unit.instanceId);
                } else {
                    updateUnitOnMap(unit.instanceId, { productionQueue: { ...unit.productionQueue, timeLeftMs: newTimeLeftMs }});
                }
            }
        });

        const currentAliveUnits = currentUnitsFromStore.filter(u => u.status !== 'destroyed');
        if (currentAliveUnits.length !== currentUnitsFromStore.length) {
            setAllUnitsOnMapDirectly(currentAliveUnits);
        }

        if (!currentGlobalState.gameOverMessage) { // 最新のgameOverMessageを参照
            const anyPlayerUnitsExist = currentAliveUnits.some(u => u.owner === 'player');
            const anyEnemyUnitsExist = currentAliveUnits.some(u => u.owner === 'enemy');
            if (anyPlayerUnitsExist && playerCommandersAlive === 0) {
                setGameOver("Enemy Wins! (Player Commander Lost)");
            } else if (anyEnemyUnitsExist && enemyCommandersAlive === 0) {
                setGameOver("Player Wins! (Enemy Commander Lost)");
            }
        }

    }, gameTickRate);
    return () => clearInterval(unitProcessInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateUnitOnMap, setAllUnitsOnMapDirectly, setGameOver, updateStrategicPointState, visibleEnemyUnits, lastSeenEnemyUnits, addUnitToMapAction, clearCommanderProductionQueueAction, startUnitProductionAction, addPlayerResourcesAction, addEnemyResourcesAction, enemyResourcesStore, incrementGameTime, playerVP, enemyVP, gameTimeLimit, targetVictoryPoints, initiateMove, getTimeToTraverseHex, gameOverMessage]); // gameOverMessage を依存配列に追加


  const handleAttackCommand = useCallback((targetUnit: PlacedUnit) => {
    if (!selectedUnitInstanceId) return;
    const currentUnits = useGameSettingsStore.getState().allUnitsOnMap;
    const attacker = currentUnits.find(u => u.instanceId === selectedUnitInstanceId);
    const attackerDef = attacker ? UNITS_MAP.get(attacker.unitId) : null;

    if (attacker && attackerDef && targetUnit && targetUnit.status !== 'destroyed' && attacker.owner !== targetUnit.owner) {
        const attackerPosAxial = logicalToAxial(attacker.position.x, attacker.position.y);
        const targetPosAxial = logicalToAxial(targetUnit.position.x, targetUnit.position.y);
        const distance = hexDistance(attackerPosAxial.q, attackerPosAxial.r, targetPosAxial.q, targetPosAxial.r);

        let weaponToUseRange: number | undefined;
        const targetUnitDef = UNITS_MAP.get(targetUnit.unitId);
        const targetHasArmor = targetUnitDef ? (targetUnitDef.stats.armor.front > 0 || targetUnitDef.stats.armor.side > 0 || targetUnitDef.stats.armor.back > 0 || targetUnitDef.stats.armor.top > 0) : false;


        if (attackerDef.stats.apWeapon && targetHasArmor) weaponToUseRange = attackerDef.stats.apWeapon.range;
        else if (attackerDef.stats.heWeapon) weaponToUseRange = attackerDef.stats.heWeapon.range;
        else if (attackerDef.stats.apWeapon) weaponToUseRange = attackerDef.stats.apWeapon.range;


        const dx = targetUnit.position.x - attacker.position.x;
        const dy = targetUnit.position.y - attacker.position.y;
        let newTargetOrientationDeg = attacker.orientation;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            const angleRad = Math.atan2(dy, dx);
            newTargetOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360;
        }

        if (weaponToUseRange !== undefined && distance <= weaponToUseRange) {
            updateUnitOnMap(attacker.instanceId, {
                attackTargetInstanceId: targetUnit.instanceId, moveTargetPosition: null, targetOrientation: newTargetOrientationDeg,
                isTurning: Math.abs(newTargetOrientationDeg - attacker.orientation) > 1 && !!attackerDef.stats.turnSpeed,
                isMoving: false, status: 'aiming', currentPath: null,
            });
        } else {
            updateUnitOnMap(attacker.instanceId, { attackTargetInstanceId: targetUnit.instanceId, status: 'idle' });
            initiateMove(attacker, targetUnit.position.x, targetUnit.position.y);
        }
        setAttackTargetInstanceId(targetUnit.instanceId);
    }
  }, [selectedUnitInstanceId, updateUnitOnMap, initiateMove]);

  const handleHexClickInGame = useCallback((q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit, event?: React.MouseEvent) => {
    const currentUnits = useGameSettingsStore.getState().allUnitsOnMap;
    const selectedUnit = selectedUnitInstanceId ? currentUnits.find(u => u.instanceId === selectedUnitInstanceId) : null;

    if (event?.button === 2) {
      event.preventDefault();
      if (selectedUnit && selectedUnit.owner === 'player') {
        initiateMove(selectedUnit, logicalX, logicalY);
      }
      setAttackTargetInstanceId(null);
      return;
    }

    if (event?.ctrlKey && unitOnHex && selectedUnit) {
      if (selectedUnit.owner === 'player' && unitOnHex.owner === 'enemy' && selectedUnit.instanceId !== unitOnHex.instanceId) {
          handleAttackCommand(unitOnHex);
      }
    } else if (unitOnHex) {
      setSelectedUnitInstanceId(unitOnHex.instanceId);
      setAttackTargetInstanceId(null);
    } else {
      setSelectedUnitInstanceId(null);
      setAttackTargetInstanceId(null);
    }
  }, [selectedUnitInstanceId, initiateMove, handleAttackCommand]);

  const handlePause = () => { alert("Game Paused (Pause Menu to be implemented)"); };
  const handleSurrender = () => {
    if (!gameOverMessage) setGameOver("Player Surrendered");
  };

  useEffect(() => {
    if (selectedUnitInstanceId) {
        const unit = useGameSettingsStore.getState().allUnitsOnMap.find(u => u.instanceId === selectedUnitInstanceId);
        setDetailedSelectedUnitInfo(unit || null);
    } else { setDetailedSelectedUnitInfo(null); }
  }, [selectedUnitInstanceId, allUnitsOnMapFromStore]); // allUnitsOnMapFromStore はストアの配列そのものなので、変更時に再実行される

  useEffect(() => {
    if (gameOverMessage) {
        console.log("Game Over:", gameOverMessage);
        setTimeout(() => {
            let status = "draw";
            if (gameOverMessage.includes("Player Wins")) status = "win";
            else if (gameOverMessage.includes("Enemy Wins") || gameOverMessage.includes("Surrendered")) status = "lose";
            router.push(`/results?status=${status}&mapId=${mapIdParam || selectedMapIdFromStore || 'unknown'}&reason=${encodeURIComponent(gameOverMessage)}`);
        }, 3000);
    }
  }, [gameOverMessage, router, mapIdParam, selectedMapIdFromStore]);

  const unitsToDisplayOnGrid = [
      ...allUnitsOnMapFromStore.filter(u => u.owner === 'player' && u.status !== 'destroyed'),
      ...visibleEnemyUnits.filter(u => u.status !== 'destroyed'),
      ...Array.from(lastSeenEnemyUnits.values()).filter(u => u.status !== 'destroyed').map(u => ({...u, isLastSeen: true}))
  ];

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
            <span className="text-blue-400 font-semibold"> {playerVP}</span> /
            <span className="text-red-400 font-semibold"> {enemyVP}</span> {}
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
                  {detailedSelectedUnitInfo.isMoving && detailedSelectedUnitInfo.moveTargetPosition && <p className="text-green-400">Moving to ({detailedSelectedUnitInfo.moveTargetPosition.x},{detailedSelectedUnitInfo.moveTargetPosition.y})</p>}
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
              {detailedSelectedUnitInfo.productionQueue ? (
                <div className="text-sm p-2 bg-gray-700 rounded">
                  <p>Producing: {UNITS_MAP.get(detailedSelectedUnitInfo.productionQueue.unitIdToProduce)?.name}</p>
                  <p>Time Left: {(detailedSelectedUnitInfo.productionQueue.timeLeftMs / 1000).toFixed(1)}s</p>
                  <div className="w-full bg-gray-600 rounded-full h-2.5 my-1">
                    <div
                      className="bg-blue-500 h-2.5 rounded-full"
                      style={{ width: `${100 - (detailedSelectedUnitInfo.productionQueue.timeLeftMs / detailedSelectedUnitInfo.productionQueue.originalProductionTimeMs) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ) : (
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
                        disabled={playerResources < unitToProduce.cost || !!detailedSelectedUnitInfo.productionQueue || !!gameOverMessage}
                      >
                        Build
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
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
            visibleEnemyInstanceIds={new Set(visibleEnemyUnits.map(u => u.instanceId))}
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