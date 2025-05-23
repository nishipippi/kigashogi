// src/app/gameplay/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useCallback } from 'react';
import { useGameSettingsStore, type PlacedUnit } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import GameplayHexGrid from '@/components/game/GameplayHexGrid';
import { ALL_MAPS_DATA } from '@/gameData/maps';
import type { MapData } from '@/types/map';
import { ALL_UNITS, UNITS_MAP } from '@/gameData/units'; // ALL_UNITS もインポート
import { hexDistance, logicalToAxial, getHexLinePath } from '@/lib/hexUtils';
import { hasLineOfSight, calculateDamage } from '@/lib/battleUtils';
import { canObserveTarget } from '@/lib/visibilityUtils'; // canObserveTarget をインポート

// 占領にかかる基本時間 (ms)
const BASE_CAPTURE_DURATION_MS = 10000;

interface LastSeenUnitInfo extends PlacedUnit {
    lastSeenTime: number; // 発見が途切れた時刻
}

function GameplayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapIdParam = searchParams.get('mapId');

  const storeInitialCost = useGameSettingsStore(state => state.initialCost);
  const selectedMapIdFromStore = useGameSettingsStore(state => state.selectedMapId);
  const allUnitsOnMapFromStore = useGameSettingsStore(state => state.allUnitsOnMap); // ストアのユニットリスト
  const updateUnitOnMap = useGameSettingsStore(state => state.updateUnitOnMap);
  const setAllUnitsOnMapDirectly = useGameSettingsStore(state => state.setAllUnitsOnMap);
  const gameOverMessage = useGameSettingsStore(state => state.gameOverMessage);
  const setGameOver = useGameSettingsStore(state => state.setGameOver);
  // ストアから個別に値やアクションを取得

  const allUnitsOnMap = useGameSettingsStore(state => state.allUnitsOnMap); // 配列だが、Zustandは賢く参照比較してくれる

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
  const currentMapDataFromStore = useGameSettingsStore(state => state.currentMapDataState); // オブジェクトだが、Zustandは参照比較


  const [localCurrentMapData, setLocalCurrentMapData] = useState<MapData | null>(null);
  const [resources, setResources] = useState(storeInitialCost);

  const [selectedUnitInstanceId, setSelectedUnitInstanceId] = useState<string | null>(null);
  const [detailedSelectedUnitInfo, setDetailedSelectedUnitInfo] = useState<PlacedUnit | null>(null);
  const [attackTargetInstanceId, setAttackTargetInstanceId] = useState<string | null>(null);
  const [attackingVisuals, setAttackingVisuals] = useState<{ attackerId: string, targetId: string, weaponType: 'HE' | 'AP' }[]>([]);
  const [visibleEnemyUnits, setVisibleEnemyUnits] = useState<PlacedUnit[]>([]);
  const [lastSeenEnemyUnits, setLastSeenEnemyUnits] = useState<Map<string, LastSeenUnitInfo>>(new Map());
  const LAST_SEEN_DURATION = 5000;


  const COST_REVENUE_INTERVAL = 10000;
  const COST_REVENUE_AMOUNT = 50;

  useEffect(() => {
    resetGameSessionState();
    const mapIdToLoad = mapIdParam || selectedMapIdFromStore;
    if (mapIdToLoad && ALL_MAPS_DATA[mapIdToLoad]) {
      const mapData = ALL_MAPS_DATA[mapIdToLoad];
      setLocalCurrentMapData(mapData);
      setMapDataInStore(mapData);
    } else {
      console.warn(`Map with id "${mapIdToLoad}" not found.`);
      setMapDataInStore(null);
      setLocalCurrentMapData(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapIdParam, selectedMapIdFromStore, setMapDataInStore, resetGameSessionState]);

  useEffect(() => {
    setResources(storeInitialCost);
  }, [storeInitialCost]);

  useEffect(() => {
    if (gameOverMessage) return;
    const gameTickInterval = setInterval(() => {
      incrementGameTime();
      const currentElapsedTime = useGameSettingsStore.getState().gameTimeElapsed;
      const currentMap = useGameSettingsStore.getState().currentMapDataState;
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
      const { victoryPoints: currentVP, gameTimeLimit: timeLimitFromStoreG, targetVictoryPoints: targetVPFromStoreG } = useGameSettingsStore.getState();
      if (currentVP.player >= targetVPFromStoreG) setGameOver("Player Wins! (Victory Points Reached)");
      else if (currentVP.enemy >= targetVPFromStoreG) setGameOver("Enemy Wins! (Victory Points Reached)");
      else if (currentElapsedTime >= timeLimitFromStoreG) {
        if (currentVP.player > currentVP.enemy) setGameOver("Player Wins! (Time Limit - Higher VP)");
        else if (currentVP.enemy > currentVP.player) setGameOver("Enemy Wins! (Time Limit - Higher VP)");
        else setGameOver("Draw! (Time Limit - VP Tied)");
      }
    }, 1000);
    return () => clearInterval(gameTickInterval);
  }, [gameOverMessage, incrementGameTime, addVictoryPointsToPlayer, setGameOver]);

  const initiateMove = useCallback((unitToMove: PlacedUnit, targetX: number, targetY: number) => {
    const unitDef = UNITS_MAP.get(unitToMove.unitId);
    if (!unitDef) return;
    const dx = targetX - unitToMove.position.x; const dy = targetY - unitToMove.position.y;
    let newTargetOrientationDeg = unitToMove.orientation;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { const angleRad = Math.atan2(dy, dx); newTargetOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360; }
    const needsToTurn = Math.abs(newTargetOrientationDeg - unitToMove.orientation) > 1 && unitDef.stats.turnSpeed !== undefined && unitDef.stats.turnSpeed > 0;
    const startAxial = logicalToAxial(unitToMove.position.x, unitToMove.position.y); const targetAxial = logicalToAxial(targetX, targetY);
    let path = getHexLinePath(startAxial.q, startAxial.r, targetAxial.q, targetAxial.r);
    if (path.length === 0 && (unitToMove.position.x !== targetX || unitToMove.position.y !== targetY)) path.push({x: targetX, y: targetY});
    const timePerHex = (1 / (unitDef.stats.moveSpeed || 1)) * 1000;
    updateUnitOnMap(unitToMove.instanceId, {
        currentPath: path.length > 0 ? path : null, timeToNextHex: (path.length > 0 && !needsToTurn) ? timePerHex : null,
        moveTargetPosition: { x: targetX, y: targetY }, targetOrientation: newTargetOrientationDeg,
        isTurning: needsToTurn, isMoving: path.length > 0 && !needsToTurn,
        status: needsToTurn ? 'turning' : (path.length > 0 ? 'moving' : 'idle'), attackTargetInstanceId: null,
    });
  }, [updateUnitOnMap]);

  useEffect(() => {
    const tickRate = 100;
    const unitProcessInterval = setInterval(() => {
        if (useGameSettingsStore.getState().gameOverMessage) { clearInterval(unitProcessInterval); return; }
        const currentTime = Date.now();
        const currentUnitsFromStore = useGameSettingsStore.getState().allUnitsOnMap;
        const currentMapDataForLoop = useGameSettingsStore.getState().currentMapDataState;
        let playerCommandersAlive = 0;

        const playerUnits = currentUnitsFromStore.filter(u => u.owner === 'player');
        const enemyUnitsActual = currentUnitsFromStore.filter(u => u.owner === 'enemy');
        const newlyVisibleEnemies: PlacedUnit[] = [];
        const currentlySeenInstanceIds = new Set<string>();

        enemyUnitsActual.forEach(enemyUnit => {
            let isVisible = false;
            for (const playerUnit of playerUnits) {
                if (canObserveTarget(playerUnit, enemyUnit)) { isVisible = true; break; }
            }
            if (isVisible) {
                newlyVisibleEnemies.push(enemyUnit);
                currentlySeenInstanceIds.add(enemyUnit.instanceId);
                setLastSeenEnemyUnits(prev => { const newMap = new Map(prev); newMap.delete(enemyUnit.instanceId); return newMap; });
            } else {
                const previouslyVisible = visibleEnemyUnits.find(veu => veu.instanceId === enemyUnit.instanceId);
                if (previouslyVisible && !lastSeenEnemyUnits.has(enemyUnit.instanceId)) {
                    setLastSeenEnemyUnits(prev => new Map(prev).set(enemyUnit.instanceId, { ...enemyUnit, lastSeenTime: currentTime }));
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
            if (!unit) return;
            const unitDef = UNITS_MAP.get(unit.unitId);
            if (!unitDef) return;
            if (unitDef.isCommander && unit.owner === 'player') playerCommandersAlive++;
            if (unit.justHit && unit.hitTimestamp && currentTime - unit.hitTimestamp > 300) updateUnitOnMap(unit.instanceId, { justHit: false });
            if (unit.isTurning && unit.targetOrientation !== undefined) {
                const turnSpeedDegPerTick = (unitDef.stats.turnSpeed || 3600) / (1000 / tickRate);
                let currentOrientation = unit.orientation; const targetOrientation = unit.targetOrientation;
                let diff = targetOrientation - currentOrientation; if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
                let newOrientation = currentOrientation;
                if (Math.abs(diff) < turnSpeedDegPerTick || Math.abs(diff) < 0.5) {
                    newOrientation = targetOrientation;
                    const timePerHex = (1 / (unitDef.stats.moveSpeed || 1)) * 1000;
                    updateUnitOnMap(unit.instanceId, {
                        orientation: newOrientation, isTurning: false,
                        isMoving: !!unit.currentPath && unit.currentPath.length > 0,
                        timeToNextHex: (!!unit.currentPath && unit.currentPath.length > 0) ? timePerHex : null,
                        targetOrientation: undefined,
                        status: (!!unit.currentPath && unit.currentPath.length > 0) ? 'moving' : (unit.attackTargetInstanceId ? 'aiming' : 'idle'),
                    });
                } else {
                    newOrientation = (currentOrientation + Math.sign(diff) * turnSpeedDegPerTick + 360) % 360;
                    updateUnitOnMap(unit.instanceId, { orientation: newOrientation });
                }
            }
            else if (unit.isMoving && unit.currentPath && unit.currentPath.length > 0 && unit.timeToNextHex !== null && unit.timeToNextHex !== undefined) {
                let newTimeToNextHex = unit.timeToNextHex - tickRate;
                if (newTimeToNextHex <= 0) {
                    const oldPosition = unit.position; const nextPosition = unit.currentPath[0];
                    const remainingPath = unit.currentPath.slice(1); let newOrientation = unit.orientation;
                    if (remainingPath.length > 0) {
                        const nextNextPosition = remainingPath[0];
                        const dx = nextNextPosition.x - nextPosition.x; const dy = nextNextPosition.y - nextPosition.y;
                        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { const angleRad = Math.atan2(dy, dx); newOrientation = (angleRad * (180 / Math.PI) + 360) % 360; }
                        const needsToTurn = Math.abs(newOrientation - unit.orientation) > 1 && unitDef.stats.turnSpeed !== undefined && unitDef.stats.turnSpeed > 0;
                        const timePerHex = (1 / (unitDef.stats.moveSpeed || 1)) * 1000;
                        updateUnitOnMap(unit.instanceId, {
                            position: nextPosition, orientation: needsToTurn ? unit.orientation : newOrientation,
                            currentPath: remainingPath, timeToNextHex: needsToTurn ? null : timePerHex,
                            isMoving: !needsToTurn, isTurning: needsToTurn,
                            targetOrientation: needsToTurn ? newOrientation : undefined, status: needsToTurn ? 'turning' : 'moving',
                        });
                    } else {
                        updateUnitOnMap(unit.instanceId, {
                            position: nextPosition, orientation: newOrientation, currentPath: null, timeToNextHex: null,
                            isMoving: false, isTurning: false, moveTargetPosition: null, status: 'idle',
                        });
                    }
                    if (currentMapDataForLoop?.strategicPoints) {
                        const spAtOldPosition = currentMapDataForLoop.strategicPoints.find(sp => sp.x === oldPosition.x && sp.y === oldPosition.y);
                        if (spAtOldPosition && spAtOldPosition.owner === unit.owner) {
                            updateStrategicPointState(spAtOldPosition.id, { owner: 'neutral', captureProgress: 0, capturingPlayer: null });
                        }
                    }
                } else updateUnitOnMap(unit.instanceId, { timeToNextHex: newTimeToNextHex });
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
                                currentProgress -= (tickRate / captureTime) * 100 * 1.5;
                                if (currentProgress <= 0) updateStrategicPointState(spUnderUnit.id, { owner: 'neutral', captureProgress: 0, capturingPlayer: unit.owner });
                                else updateStrategicPointState(spUnderUnit.id, { captureProgress: currentProgress, capturingPlayer: unit.owner });
                            } else {
                                currentProgress += (tickRate / captureTime) * 100;
                                if (currentProgress >= 100) updateStrategicPointState(spUnderUnit.id, { owner: unit.owner, captureProgress: 100, capturingPlayer: null });
                                else updateStrategicPointState(spUnderUnit.id, { captureProgress: currentProgress, capturingPlayer: unit.owner });
                            }
                        }
                    } else if (spUnderUnit.owner === unit.owner && spUnderUnit.capturingPlayer && spUnderUnit.capturingPlayer !== unit.owner && !enemyOnPoint) {
                        updateStrategicPointState(spUnderUnit.id, { capturingPlayer: null, captureProgress: 0 });
                    }
                }
            }
            else if (unit.attackTargetInstanceId && (unit.status === 'aiming' || unit.status === 'attacking_he' || unit.status === 'attacking_ap' || unit.status === 'reloading_he' || unit.status === 'reloading_ap')) {
                if (unit.isTurning || unit.isMoving) return;
                const targetUnit = currentUnitsFromStore.find(u => u.instanceId === unit.attackTargetInstanceId);
                if (!targetUnit) { updateUnitOnMap(unit.instanceId, { status: 'idle', attackTargetInstanceId: null }); return; }
                const dx = targetUnit.position.x - unit.position.x; const dy = targetUnit.position.y - unit.position.y;
                let requiredOrientationDeg = unit.orientation;
                if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { const angleRad = Math.atan2(dy, dx); requiredOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360; }
                if (Math.abs(requiredOrientationDeg - unit.orientation) > 5) { updateUnitOnMap(unit.instanceId, { targetOrientation: requiredOrientationDeg, isTurning: true, status: 'aiming' }); return; }
                if (!hasLineOfSight(unit, targetUnit, currentMapDataForLoop, currentUnitsFromStore)) { updateUnitOnMap(unit.instanceId, { status: 'aiming' }); return; }
                const attackerPosAxial = logicalToAxial(unit.position.x, unit.position.y); const targetPosAxial = logicalToAxial(targetUnit.position.x, targetUnit.position.y);
                const distance = hexDistance(attackerPosAxial.q, attackerPosAxial.r, targetPosAxial.q, targetPosAxial.r);
                let weaponChoice: { type: 'HE' | 'AP', stats: NonNullable<UnitData['stats']['heWeapon'] | UnitData['stats']['apWeapon']> } | null = null;
                if (unitDef.stats.apWeapon && distance <= unitDef.stats.apWeapon.range) weaponChoice = { type: 'AP', stats: unitDef.stats.apWeapon };
                else if (unitDef.stats.heWeapon && distance <= unitDef.stats.heWeapon.range) weaponChoice = { type: 'HE', stats: unitDef.stats.heWeapon };
                if (!weaponChoice) { updateUnitOnMap(unit.instanceId, { status: 'aiming', attackTargetInstanceId: targetUnit.instanceId }); return; }

                if (unit.status === `attacking_${weaponChoice.type.toLowerCase()}`) {
                    const visualEffect = { attackerId: unit.instanceId, targetId: targetUnit.instanceId, weaponType: weaponChoice.type };
                    setAttackingVisuals(prev => [...prev, visualEffect]);
                    setTimeout(() => setAttackingVisuals(prev => prev.filter(v => v.attackerId !== visualEffect.attackerId || v.targetId !== visualEffect.targetId)), 200);
                    const targetDef = UNITS_MAP.get(targetUnit.unitId);
                    if (targetDef) {
                        const damageResult = calculateDamage(unitDef, weaponChoice.type, targetDef);
                        const newTargetHp = Math.max(0, targetUnit.currentHp - damageResult.damageDealt);
                        if (newTargetHp <= 0) {
                            const remainingUnits = currentUnitsFromStore.filter(u => u.instanceId !== targetUnit.instanceId);
                            setAllUnitsOnMapDirectly(remainingUnits);
                            updateUnitOnMap(unit.instanceId, { status: 'idle', attackTargetInstanceId: null, lastAttackTimeAP: undefined, lastAttackTimeHE: undefined });
                        } else {
                            updateUnitOnMap(targetUnit.instanceId, { currentHp: newTargetHp, justHit: true, hitTimestamp: currentTime });
                            updateUnitOnMap(unit.instanceId, { status: weaponChoice.type === 'HE' ? 'reloading_he' : 'reloading_ap', [weaponChoice.type === 'HE' ? 'lastAttackTimeHE' : 'lastAttackTimeAP']: currentTime });
                        }
                    } else updateUnitOnMap(unit.instanceId, { status: 'idle', attackTargetInstanceId: null });
                } else if (unit.status === 'aiming' || unit.status === `reloading_${weaponChoice.type.toLowerCase()}`) {
                    const attackIntervalMs = weaponChoice.stats.attackInterval * 1000;
                    const lastAttackTime = weaponChoice.type === 'HE' ? unit.lastAttackTimeHE : unit.lastAttackTimeAP;
                    if (!lastAttackTime || currentTime - lastAttackTime >= attackIntervalMs) {
                        updateUnitOnMap(unit.instanceId, { status: weaponChoice.type === 'HE' ? 'attacking_he' : 'attacking_ap' });
                    }
                }
            }
        });
        const anyPlayerUnitsExist = currentUnitsFromStore.some(u => u.owner === 'player');
        if (anyPlayerUnitsExist && playerCommandersAlive === 0 && !useGameSettingsStore.getState().gameOverMessage) {
            setGameOver("Enemy Wins! (Player Commander Lost)");
        }
    }, tickRate);
    return () => clearInterval(unitProcessInterval);
  }, [updateUnitOnMap, setAllUnitsOnMapDirectly, setGameOver, updateStrategicPointState, visibleEnemyUnits, lastSeenEnemyUnits]); // visibleEnemyUnits, lastSeenEnemyUnits を追加

  const handleAttackCommand = useCallback((targetUnit: PlacedUnit) => {
    if (!selectedUnitInstanceId) return;
    const currentUnits = useGameSettingsStore.getState().allUnitsOnMap;
    const attacker = currentUnits.find(u => u.instanceId === selectedUnitInstanceId);
    const attackerDef = attacker ? UNITS_MAP.get(attacker.unitId) : null;
    if (attacker && attackerDef && targetUnit) {
        const attackerPosAxial = logicalToAxial(attacker.position.x, attacker.position.y);
        const targetPosAxial = logicalToAxial(targetUnit.position.x, targetUnit.position.y);
        const distance = hexDistance(attackerPosAxial.q, attackerPosAxial.r, targetPosAxial.q, targetPosAxial.r);
        let weaponToUse: 'AP' | 'HE' | null = null;
        if (attackerDef.stats.apWeapon && distance <= attackerDef.stats.apWeapon.range) weaponToUse = 'AP';
        else if (attackerDef.stats.heWeapon && distance <= attackerDef.stats.heWeapon.range) weaponToUse = 'HE';
        const dx = targetUnit.position.x - attacker.position.x; const dy = targetUnit.position.y - attacker.position.y;
        let newTargetOrientationDeg = attacker.orientation;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { const angleRad = Math.atan2(dy, dx); newTargetOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360; }
        if (weaponToUse) {
            updateUnitOnMap(attacker.instanceId, {
                attackTargetInstanceId: targetUnit.instanceId, moveTargetPosition: null, targetOrientation: newTargetOrientationDeg,
                isTurning: Math.abs(newTargetOrientationDeg - attacker.orientation) > 1 && !!attackerDef.stats.turnSpeed,
                isMoving: false, status: 'aiming',
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
    if (event?.button === 2) {
      event.preventDefault();
      if (selectedUnitInstanceId) { const selectedUnit = currentUnits.find(u => u.instanceId === selectedUnitInstanceId); if (selectedUnit) initiateMove(selectedUnit, logicalX, logicalY); }
      setAttackTargetInstanceId(null); return;
    }
    if (event?.ctrlKey && unitOnHex && selectedUnitInstanceId) {
      const attacker = currentUnits.find(u => u.instanceId === selectedUnitInstanceId);
      if (attacker && attacker.instanceId !== unitOnHex.instanceId) handleAttackCommand(unitOnHex);
    } else if (unitOnHex) {
      setSelectedUnitInstanceId(unitOnHex.instanceId); setAttackTargetInstanceId(null);
    } else {
      setSelectedUnitInstanceId(null); setAttackTargetInstanceId(null);
    }
  }, [selectedUnitInstanceId, initiateMove, handleAttackCommand]);

  const handlePause = () => { alert("Game Paused (Pause Menu to be implemented)"); };
  const handleSurrender = () => { alert("Surrendered (Results screen to be implemented)"); setGameOver("Player Surrendered"); };

  useEffect(() => {
    if (selectedUnitInstanceId) {
        const unit = useGameSettingsStore.getState().allUnitsOnMap.find(u => u.instanceId === selectedUnitInstanceId);
        setDetailedSelectedUnitInfo(unit || null);
    } else { setDetailedSelectedUnitInfo(null); }
  }, [selectedUnitInstanceId, allUnitsOnMapFromStore]); // allUnitsOnMapFromStore を使用

  useEffect(() => {
    if (gameOverMessage) {
        console.log("Game Over:", gameOverMessage);
        setTimeout(() => {
            let status = "draw";
            if (gameOverMessage.includes("Player Wins")) status = "win";
            else if (gameOverMessage.includes("Enemy Wins") || gameOverMessage.includes("Surrendered")) status = "lose";
            router.push(`/results?status=${status}&mapId=${mapIdParam}&reason=${encodeURIComponent(gameOverMessage)}`);
        }, 2000);
    }
  }, [gameOverMessage, router, mapIdParam]);

  const unitsToDisplayOnGrid = [
      ...allUnitsOnMapFromStore.filter(u => u.owner === 'player' && u.status !== 'destroyed'),
      ...visibleEnemyUnits.filter(u => u.status !== 'destroyed'),
      ...Array.from(lastSeenEnemyUnits.values()).filter(u => u.status !== 'destroyed')
  ];
  const visibleEnemyInstanceIdsSet = new Set(visibleEnemyUnits.map(u => u.instanceId));


  const handleStartProduction = (producerCommanderId: string, unitToProduceId: string) => {
    const unitDef = UNITS_MAP.get(unitToProduceId);
    if (!unitDef) return;
    if (resources < unitDef.cost) { alert("Not enough resources!"); return; }
    console.log(`Player wants to produce ${unitDef.name} from commander ${producerCommanderId}. Cost: ${unitDef.cost}, Time: ${unitDef.productionTime}s`);
    alert(`Start producing ${unitDef.name}! (Not fully implemented)`);
    setResources(prev => prev - unitDef.cost);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      {gameOverMessage && (
          <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
              <h1 className="text-4xl font-bold text-yellow-400 animate-pulse">{gameOverMessage}</h1>
          </div>
      )}
      <header className="h-16 bg-black bg-opacity-50 p-3 flex justify-between items-center shadow-lg z-10">
        <div className="flex items-center space-x-6">
          <div>KigaShogi</div>
          <div>Map: <span className="font-semibold">{currentMapDataFromStore?.name || mapIdParam || 'N/A'}</span></div>
          <div>Time Left: <span className="font-semibold">
              {Math.max(0, Math.floor((gameTimeLimit - gameTimeFromStore) / 60))}:
              {Math.max(0, (gameTimeLimit - gameTimeFromStore) % 60).toString().padStart(2, '0')}
          </span></div>
        </div>
        <div className="flex items-center space-x-4">
          <div>Resources: <span className="font-bold text-yellow-400">{resources} C</span></div>
          <div>Victory Points:
            <span className="text-blue-400 font-semibold"> {playerVP}</span> /
            <span className="text-red-400 font-semibold"> {enemyVP}</span>
            (Target: {targetVictoryPoints})
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Button onClick={handlePause} variant="secondary" size="sm">Pause</Button>
          <Button onClick={handleSurrender} variant="danger" size="sm">Surrender</Button>
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
                  <p>Instance ID: <span className="text-xs text-gray-400">{detailedSelectedUnitInfo.instanceId}</span></p>
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
                  <p>Position: ({detailedSelectedUnitInfo.position.x.toFixed(1)}, {detailedSelectedUnitInfo.position.y.toFixed(1)}) Orient: {detailedSelectedUnitInfo.orientation.toFixed(0)}°</p>
                  {detailedSelectedUnitInfo.status && <p className="capitalize">Status: <span className="text-yellow-300">{detailedSelectedUnitInfo.status.replace(/_/g, ' ')}</span></p>}
                  {detailedSelectedUnitInfo.isTurning && detailedSelectedUnitInfo.targetOrientation !== undefined && <p className="text-yellow-400">Turning to {detailedSelectedUnitInfo.targetOrientation.toFixed(0)}°</p>}
                  {detailedSelectedUnitInfo.isMoving && detailedSelectedUnitInfo.moveTargetPosition && <p className="text-green-400">Moving to ({detailedSelectedUnitInfo.moveTargetPosition.x},{detailedSelectedUnitInfo.moveTargetPosition.y})</p>}
                  {detailedSelectedUnitInfo.attackTargetInstanceId &&
                    (() => {
                        const target = useGameSettingsStore.getState().allUnitsOnMap.find(u=>u.instanceId === detailedSelectedUnitInfo.attackTargetInstanceId);
                        return <p className="text-red-400">Targeting: {target?.name || 'Unknown'}</p>;
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

          {detailedSelectedUnitInfo && UNITS_MAP.get(detailedSelectedUnitInfo.unitId)?.isCommander && (
            <>
              <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 pt-4">Unit Production</h2>
              <div className="space-y-2 text-sm">
                {ALL_UNITS.filter(u => !u.isCommander).map(unitToProduce => (
                  <div key={unitToProduce.id} className="p-2 bg-gray-700 hover:bg-gray-600 rounded flex justify-between items-center">
                    <div>
                      <span>{unitToProduce.icon} {unitToProduce.name}</span>
                      <span className="ml-2 text-xs text-yellow-400">({unitToProduce.cost}C)</span>
                      <span className="ml-2 text-xs text-gray-400">[{unitToProduce.productionTime}s]</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => detailedSelectedUnitInfo && handleStartProduction(detailedSelectedUnitInfo.instanceId, unitToProduce.id)}
                      disabled={resources < unitToProduce.cost}
                    >
                      Build
                    </Button>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="text-md font-semibold mt-2">Queue:</h3>
                <p className="text-xs text-gray-400">(Production queue display here)</p>
              </div>
            </>
          )}
        </aside>

        <section className="flex-grow bg-gray-700 flex items-center justify-center relative">
          <GameplayHexGrid
            mapData={currentMapDataFromStore}
            hexSize={26}
            placedUnits={unitsToDisplayOnGrid}
            onHexClick={handleHexClickInGame}
            selectedUnitInstanceId={selectedUnitInstanceId}
            attackingPairs={attackingVisuals}
            visibleEnemyInstanceIds={new Set(visibleEnemyUnits.map(u => u.instanceId))} // visibleEnemyInstanceIds を渡す
          />
          <div className="absolute bottom-4 right-4 w-48 h-36 bg-green-800 border-2 border-gray-600 rounded shadow-xl p-1">
            <p className="text-xs text-center text-green-300">Mini-map</p>
          </div>
        </section>
      </main>

      <footer className="h-10 bg-black bg-opacity-30 px-3 py-2 text-xs text-gray-400 border-t border-gray-700">
        Event: Unit Alpha destroyed! | Player Beta captured Strategic Point Charlie!
      </footer>
    </div>
  );
}

export default function GameplayScreen() {
  return (
    <Suspense fallback={<div>Loading gameplay...</div>}>
      <GameplayContent />
    </Suspense>
  );
}