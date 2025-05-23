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
import { ALL_UNITS, UNITS_MAP } from '@/gameData/units';
import { hexDistance, logicalToAxial, getHexLinePath } from '@/lib/hexUtils';
import { hasLineOfSight, calculateDamage } from '@/lib/battleUtils';
import { canObserveTarget } from '@/lib/visibilityUtils';
import { decideCommanderAIAction, decideCombatAIAction, type AIAction } from '@/lib/aiUtils';

// 占領にかかる基本時間 (ms)
const BASE_CAPTURE_DURATION_MS = 10000;
const TICK_RATE_MS = 100; // ゲームループの実行間隔 (ms)

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
  const gameOverMessage = useGameSettingsStore(state => state.gameOverMessage);
  const setGameOver = useGameSettingsStore(state => state.setGameOver);
  const removeUnitFromMapAction = useGameSettingsStore(state => state.removeUnitFromMap); // 実質 status 更新

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

  const [localCurrentMapData, setLocalCurrentMapData] = useState<MapData | null>(null);
  const [selectedUnitInstanceId, setSelectedUnitInstanceId] = useState<string | null>(null);
  const [detailedSelectedUnitInfo, setDetailedSelectedUnitInfo] = useState<PlacedUnit | null>(null);
  const [attackTargetInstanceId, setAttackTargetInstanceId] = useState<string | null>(null); // プレイヤーの攻撃指示用
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
      setLocalCurrentMapData(mapData); // ローカルステートは描画用？ストアと同期しているので不要かも
      setMapDataInStore(mapData);
    } else {
      console.warn(`Map with id "${mapIdToLoad}" not found.`);
      setMapDataInStore(null);
      setLocalCurrentMapData(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapIdParam, selectedMapIdFromStore, setMapDataInStore, resetGameSessionState]);

  useEffect(() => {
    if (gameOverMessage) return;
    const gameTickInterval = setInterval(() => {
      incrementGameTime();
      const currentElapsedTime = useGameSettingsStore.getState().gameTimeElapsed;
      const currentMap = useGameSettingsStore.getState().currentMapDataState;

      // プレイヤーリソース収入
      if (currentElapsedTime > 0 && currentElapsedTime % COST_REVENUE_INTERVAL_SECONDS === 0) {
        addPlayerResourcesAction(COST_REVENUE_AMOUNT);
      }
      // AIリソース収入
      if (currentElapsedTime > 0 && currentElapsedTime % COST_REVENUE_INTERVAL_SECONDS === 0) {
        addEnemyResourcesAction(COST_REVENUE_AMOUNT);
      }

      // 勝利ポイント加算 (プレイヤー)
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
      // 勝利ポイント加算 (AI)
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
  }, [gameOverMessage, incrementGameTime, addVictoryPointsToPlayer, setGameOver, addPlayerResourcesAction, addEnemyResourcesAction]);

  const initiateMove = useCallback((unitToMove: PlacedUnit, targetX: number, targetY: number) => {
    if (unitToMove.status === 'destroyed') return;
    const unitDef = UNITS_MAP.get(unitToMove.unitId);
    if (!unitDef) return;
    const dx = targetX - unitToMove.position.x; const dy = targetY - unitToMove.position.y;
    let newTargetOrientationDeg = unitToMove.orientation;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { const angleRad = Math.atan2(dy, dx); newTargetOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360; }
    const needsToTurn = Math.abs(newTargetOrientationDeg - unitToMove.orientation) > 1 && unitDef.stats.turnSpeed !== undefined && unitDef.stats.turnSpeed > 0;
    const startAxial = logicalToAxial(unitToMove.position.x, unitToMove.position.y); const targetAxial = logicalToAxial(targetX, targetY);
    // TODO: A*経路探索を実装して getHexLinePath と置き換える
    let path = getHexLinePath(startAxial.q, startAxial.r, targetAxial.q, targetAxial.r);
    if (path.length === 0 && (unitToMove.position.x !== targetX || unitToMove.position.y !== targetY)) path.push({x: targetX, y: targetY});
    const timePerHex = (1 / (unitDef.stats.moveSpeed || 1)) * 1000;
    updateUnitOnMap(unitToMove.instanceId, {
        currentPath: path.length > 0 ? path : null, timeToNextHex: (path.length > 0 && !needsToTurn) ? timePerHex : null,
        moveTargetPosition: { x: targetX, y: targetY }, targetOrientation: newTargetOrientationDeg,
        isTurning: needsToTurn, isMoving: path.length > 0 && !needsToTurn,
        status: needsToTurn ? 'turning' : (path.length > 0 ? 'moving' : 'idle'), attackTargetInstanceId: null,
        productionQueue: null, // 移動開始で生産はキャンセル (または別のUIで)
    });
  }, [updateUnitOnMap]);

  useEffect(() => {
    const unitProcessInterval = setInterval(() => {
        if (useGameSettingsStore.getState().gameOverMessage) { clearInterval(unitProcessInterval); return; }
        const currentTime = Date.now();
        const currentUnitsFromStore = useGameSettingsStore.getState().allUnitsOnMap;
        const currentMapDataForLoop = useGameSettingsStore.getState().currentMapDataState;
        let playerCommandersAlive = 0;
        let enemyCommandersAlive = 0;

        // 視界処理 (アクティブなユニットのみ)
        const activePlayerUnits = currentUnitsFromStore.filter(u => u.owner === 'player' && u.status !== 'destroyed');
        const activeEnemyUnits = currentUnitsFromStore.filter(u => u.owner === 'enemy' && u.status !== 'destroyed');
        const newlyVisibleEnemies: PlacedUnit[] = [];

        activeEnemyUnits.forEach(enemyUnit => {
            let isVisible = false;
            for (const playerUnit of activePlayerUnits) {
                if (canObserveTarget(playerUnit, enemyUnit)) { isVisible = true; break; }
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

        // 全ユニットの処理ループ (破壊されたユニットは早期リターン)
        currentUnitsFromStore.forEach(unit => {
            if (!unit || unit.status === 'destroyed') return; // 破壊されたユニットは処理しない

            const unitDef = UNITS_MAP.get(unit.unitId);
            if (!unitDef) return;

            // 司令官生存確認
            if (unitDef.isCommander) {
                if (unit.owner === 'player') playerCommandersAlive++;
                else if (unit.owner === 'enemy') enemyCommandersAlive++;
            }

            // 被弾エフェクトタイマー
            if (unit.justHit && unit.hitTimestamp && currentTime - unit.hitTimestamp > 300) {
                updateUnitOnMap(unit.instanceId, { justHit: false });
            }

            // 旋回処理
            if (unit.isTurning && unit.targetOrientation !== undefined) {
                const turnSpeedDegPerTick = (unitDef.stats.turnSpeed || 3600) / (1000 / gameTickRate);
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
            // 移動処理
            else if (unit.isMoving && unit.currentPath && unit.currentPath.length > 0 && unit.timeToNextHex !== null && unit.timeToNextHex !== undefined) {
                let newTimeToNextHex = unit.timeToNextHex - gameTickRate;
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
                            const enemyOnPoint = currentUnitsFromStore.some(otherUnit => otherUnit.owner !== unit.owner && otherUnit.status !== 'destroyed' && otherUnit.position.x === spAtOldPosition.x && otherUnit.position.y === spAtOldPosition.y);
                            if (!enemyOnPoint) { // 敵が乗っていなければ中立化
                                updateStrategicPointState(spAtOldPosition.id, { owner: 'neutral', captureProgress: 0, capturingPlayer: null });
                            }
                        }
                    }
                } else updateUnitOnMap(unit.instanceId, { timeToNextHex: newTimeToNextHex });
            }
            // 戦略拠点占領処理
            else if (currentMapDataForLoop?.strategicPoints && (unit.status === 'idle' || unit.status === 'moving')) {
                const spUnderUnit = currentMapDataForLoop.strategicPoints.find(sp => sp.x === unit.position.x && sp.y === unit.position.y);
                if (spUnderUnit) {
                    const captureTime = spUnderUnit.timeToCapture || BASE_CAPTURE_DURATION_MS;
                    const enemyOnPoint = currentUnitsFromStore.some(otherUnit => otherUnit.owner !== unit.owner && otherUnit.status !== 'destroyed' && otherUnit.position.x === spUnderUnit.x && otherUnit.position.y === spUnderUnit.y);

                    if (spUnderUnit.owner !== unit.owner && !enemyOnPoint) {
                        if (spUnderUnit.capturingPlayer === unit.owner || !spUnderUnit.capturingPlayer) {
                            let currentProgress = spUnderUnit.captureProgress || 0;
                            if (spUnderUnit.owner !== 'neutral' && spUnderUnit.owner !== unit.owner && spUnderUnit.capturingPlayer !== unit.owner) {
                                currentProgress -= (gameTickRate / captureTime) * 100 * 1.5; // 中立化は1.5倍速
                                if (currentProgress <= 0) {
                                    updateStrategicPointState(spUnderUnit.id, { owner: 'neutral', captureProgress: 0, capturingPlayer: unit.owner });
                                } else {
                                    updateStrategicPointState(spUnderUnit.id, { captureProgress: currentProgress, capturingPlayer: unit.owner });
                                }
                            } else { // 中立または自軍が占領中の他プレイヤーの拠点
                                currentProgress += (gameTickRate / captureTime) * 100;
                                if (currentProgress >= 100) {
                                    updateStrategicPointState(spUnderUnit.id, { owner: unit.owner, captureProgress: 100, capturingPlayer: null });
                                } else {
                                    updateStrategicPointState(spUnderUnit.id, { captureProgress: currentProgress, capturingPlayer: unit.owner });
                                }
                            }
                        }
                    } else if (spUnderUnit.owner === unit.owner && spUnderUnit.capturingPlayer && spUnderUnit.capturingPlayer !== unit.owner && !enemyOnPoint) {
                        // 自軍の拠点で、敵が占領しようとしていたが敵がいなくなった場合
                        updateStrategicPointState(spUnderUnit.id, { capturingPlayer: null, captureProgress: 0 });
                    } else if (enemyOnPoint && spUnderUnit.capturingPlayer === unit.owner) {
                        // 自軍が占領中に敵が乗ってきた場合、占領中断
                        updateStrategicPointState(spUnderUnit.id, { capturingPlayer: null });
                    }
                }
            }
            // 戦闘処理
            else if (unit.attackTargetInstanceId && (unit.status === 'aiming' || unit.status === 'attacking_he' || unit.status === 'attacking_ap' || unit.status === 'reloading_he' || unit.status === 'reloading_ap')) {
                if (unit.isTurning || unit.isMoving) return; // 旋回中・移動中は攻撃準備/攻撃しない
                const targetUnit = currentUnitsFromStore.find(u => u.instanceId === unit.attackTargetInstanceId && u.status !== 'destroyed');
                if (!targetUnit) { updateUnitOnMap(unit.instanceId, { status: 'idle', attackTargetInstanceId: null }); return; }

                const dx = targetUnit.position.x - unit.position.x; const dy = targetUnit.position.y - unit.position.y;
                let requiredOrientationDeg = unit.orientation;
                if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { const angleRad = Math.atan2(dy, dx); requiredOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360; }

                if (Math.abs(requiredOrientationDeg - unit.orientation) > 5) { // 5度以上のズレなら再旋回
                    updateUnitOnMap(unit.instanceId, { targetOrientation: requiredOrientationDeg, isTurning: true, status: 'aiming' });
                    return;
                }
                // TODO: hasLineOfSight の詳細実装
                if (!hasLineOfSight(unit, targetUnit, currentMapDataForLoop, currentUnitsFromStore)) {
                    updateUnitOnMap(unit.instanceId, { status: 'aiming' }); // 射線が通らない場合はエイム継続 (またはターゲット解除)
                    return;
                }

                const attackerPosAxial = logicalToAxial(unit.position.x, unit.position.y); const targetPosAxial = logicalToAxial(targetUnit.position.x, targetUnit.position.y);
                const distance = hexDistance(attackerPosAxial.q, attackerPosAxial.r, targetPosAxial.q, targetPosAxial.r);

                let weaponChoice: { type: 'HE' | 'AP', stats: NonNullable<UnitData['stats']['heWeapon'] | UnitData['stats']['apWeapon']> } | null = null;
                const targetDef = UNITS_MAP.get(targetUnit.unitId);
                if (targetDef) { // ターゲットの定義がある場合のみ武器選択
                    // AP武器を優先的に考慮 (装甲目標に対して)
                    if (unitDef.stats.apWeapon && distance <= unitDef.stats.apWeapon.range && targetDef.stats.armor.front > 0) { // 簡易的に正面装甲で判断
                        weaponChoice = { type: 'AP', stats: unitDef.stats.apWeapon };
                    } else if (unitDef.stats.heWeapon && distance <= unitDef.stats.heWeapon.range) {
                        weaponChoice = { type: 'HE', stats: unitDef.stats.heWeapon };
                    } else if (unitDef.stats.apWeapon && distance <= unitDef.stats.apWeapon.range) { // HEが使えない/射程外だがAPが使える場合
                        weaponChoice = { type: 'AP', stats: unitDef.stats.apWeapon };
                    }
                }

                if (!weaponChoice) { // 有効な武器がないか射程外
                    updateUnitOnMap(unit.instanceId, { status: 'aiming', attackTargetInstanceId: targetUnit.instanceId }); // 攻撃対象は維持しつつエイム
                    return;
                }

                if (unit.status === `attacking_${weaponChoice.type.toLowerCase()}`) {
                    const visualEffect = { attackerId: unit.instanceId, targetId: targetUnit.instanceId, weaponType: weaponChoice.type };
                    setAttackingVisuals(prev => [...prev, visualEffect]);
                    setTimeout(() => setAttackingVisuals(prev => prev.filter(v => v.attackerId !== visualEffect.attackerId || v.targetId !== visualEffect.targetId)), 200);

                    if (targetDef) {
                        const damageResult = calculateDamage(
                            unitDef, weaponChoice.type, targetDef,
                            unit.orientation, targetUnit.orientation,
                            targetUnit.position, unit.position
                        );
                        const newTargetHp = Math.max(0, targetUnit.currentHp - damageResult.damageDealt);
                        if (newTargetHp <= 0) {
                            removeUnitFromMapAction(targetUnit.instanceId); // status を 'destroyed' にする
                            updateUnitOnMap(unit.instanceId, { status: 'idle', attackTargetInstanceId: null, lastAttackTimeAP: undefined, lastAttackTimeHE: undefined });
                        } else {
                            updateUnitOnMap(targetUnit.instanceId, { currentHp: newTargetHp, justHit: true, hitTimestamp: currentTime });
                            updateUnitOnMap(unit.instanceId, { status: weaponChoice.type === 'HE' ? 'reloading_he' : 'reloading_ap', [weaponChoice.type === 'HE' ? 'lastAttackTimeHE' : 'lastAttackTimeAP']: currentTime });
                        }
                    } else { // targetDef がない場合 (エラーケースだが念のため)
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

            // AIユニットの行動決定と実行
            if (unit.owner === 'enemy' && !gameOverMessage) {
                let aiDecision: AIAction | null = null;
                if (unitDef.isCommander) {
                    aiDecision = decideCommanderAIAction(unit, unitDef, currentUnitsFromStore, enemyResourcesStore, currentMapDataForLoop);
                } else {
                    aiDecision = decideCombatAIAction(unit, unitDef, currentUnitsFromStore, currentMapDataForLoop);
                }

                if (aiDecision) {
                    switch (aiDecision.type) {
                        case 'PRODUCE':
                            if (aiDecision.targetUnitId) {
                                const prodResult = startUnitProductionAction(unit.instanceId, aiDecision.targetUnitId, 'enemy');
                                if (prodResult.success) {
                                    // console.log(`AI Commander ${unit.instanceId} started producing ${UNITS_MAP.get(aiDecision.targetUnitId)?.name}`);
                                }
                            }
                            break;
                        case 'MOVE':
                            if (aiDecision.targetPosition && unit.status !== 'moving' && unit.status !== 'turning') {
                                initiateMove(unit, aiDecision.targetPosition.x, aiDecision.targetPosition.y);
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
                                            attackTargetInstanceId: targetPlayerUnit.instanceId,
                                            moveTargetPosition: null, targetOrientation: newTargetOrientationDeg,
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

            // ユニット生産進捗処理 (プレイヤーとAI共通)
            if (unit.productionQueue && unitDef.isCommander) {
                let newTimeLeftMs = unit.productionQueue.timeLeftMs - gameTickRate;
                if (newTimeLeftMs <= 0) {
                    const producedUnitId = unit.productionQueue.unitIdToProduce;
                    const producedUnitDef = UNITS_MAP.get(producedUnitId);
                    if (producedUnitDef) {
                        // 新ユニットの配置位置を決定 (司令官の周囲の空きヘックス)
                        // TODO: findEmptyAdjacentHex のような堅牢な関数を実装
                        let spawnPos: {x: number, y: number} | null = null;
                        const directions = unit.owner === 'player'
                            ? [{dx:0,dy:1}, {dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:-1}, {dx:1,dy:1}, {dx:-1,dy:-1} ] // 下優先
                            : [{dx:0,dy:-1}, {dx:1,dy:0}, {dx:-1,dy:0}, {dx:0,dy:1}, {dx:1,dy:-1}, {dx:-1,dy:1} ]; // 上優先 (AI)

                        for (const dir of directions) {
                            const checkX = unit.position.x + dir.dx;
                            const checkY = unit.position.y + dir.dy;
                            const isOccupied = currentUnitsFromStore.some(u => u.status !== 'destroyed' && u.position.x === checkX && u.position.y === checkY);
                            // TODO: マップ範囲外チェックも必要
                            if (!isOccupied) {
                                spawnPos = {x: checkX, y: checkY};
                                break;
                            }
                        }

                        if (spawnPos) {
                            const newUnitInstanceId = `${producedUnitId}_${unit.owner}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
                            const newPlacedUnit: PlacedUnit = {
                                instanceId: newUnitInstanceId, unitId: producedUnitId, name: producedUnitDef.name,
                                cost: producedUnitDef.cost, position: spawnPos, currentHp: producedUnitDef.stats.hp,
                                owner: unit.owner, orientation: unit.owner === 'player' ? 0 : 180,
                                status: 'idle', isTurning: false, isMoving: false, moveTargetPosition: null,
                                currentPath: null, timeToNextHex: null, attackTargetInstanceId: null,
                                lastAttackTimeHE: undefined, lastAttackTimeAP: undefined,
                                justHit: false, hitTimestamp: undefined, productionQueue: null,
                            };
                            addUnitToMapAction(newPlacedUnit);
                            console.log(`${unit.owner.toUpperCase()} Commander ${unit.instanceId} finished producing ${producedUnitDef.name} at (${spawnPos.x}, ${spawnPos.y})`);
                        } else {
                            console.warn(`${unit.owner.toUpperCase()} Commander ${unit.instanceId} production of ${producedUnitDef.name} failed: No empty spawn location.`);
                            // 生産失敗時、コストを返却するなどの処理も検討
                            if (unit.owner === 'player') addPlayerResourcesAction(unit.productionQueue.productionCost);
                            else addEnemyResourcesAction(unit.productionQueue.productionCost);
                        }
                    }
                    clearCommanderProductionQueueAction(unit.instanceId);
                } else {
                    updateUnitOnMap(unit.instanceId, {
                        productionQueue: { ...unit.productionQueue, timeLeftMs: newTimeLeftMs, }
                    });
                }
            }
        });

        // ゲームオーバー判定 (司令官全滅)
        const anyPlayerUnitsExist = currentUnitsFromStore.some(u => u.owner === 'player' && u.status !== 'destroyed');
        const anyEnemyUnitsExist = currentUnitsFromStore.some(u => u.owner === 'enemy' && u.status !== 'destroyed');

        if (anyPlayerUnitsExist && playerCommandersAlive === 0 && !useGameSettingsStore.getState().gameOverMessage) {
            setGameOver("Enemy Wins! (Player Commander Lost)");
        }
        if (anyEnemyUnitsExist && enemyCommandersAlive === 0 && !useGameSettingsStore.getState().gameOverMessage) {
            setGameOver("Player Wins! (Enemy Commander Lost)");
        }

    }, gameTickRate);
    return () => clearInterval(unitProcessInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    updateUnitOnMap, setGameOver, updateStrategicPointState,
    visibleEnemyUnits, lastSeenEnemyUnits, // 視界関連
    addUnitToMapAction, clearCommanderProductionQueueAction, // 生産関連
    startUnitProductionAction, // AI生産開始用
    initiateMove, // AI移動用
    enemyResourcesStore, // AIリソース参照用
    removeUnitFromMapAction, // ユニット破壊用
    addPlayerResourcesAction, addEnemyResourcesAction, // 生産失敗時のコスト返却用
  ]);

  const handleAttackCommand = useCallback((targetUnit: PlacedUnit) => {
    if (!selectedUnitInstanceId || gameOverMessage) return;
    const currentUnits = useGameSettingsStore.getState().allUnitsOnMap;
    const attacker = currentUnits.find(u => u.instanceId === selectedUnitInstanceId && u.status !== 'destroyed');
    const attackerDef = attacker ? UNITS_MAP.get(attacker.unitId) : null;

    if (attacker && attackerDef && targetUnit && targetUnit.status !== 'destroyed') {
        // 攻撃対象が自分自身でないことを確認
        if (attacker.instanceId === targetUnit.instanceId) return;

        const attackerPosAxial = logicalToAxial(attacker.position.x, attacker.position.y);
        const targetPosAxial = logicalToAxial(targetUnit.position.x, targetUnit.position.y);
        const distance = hexDistance(attackerPosAxial.q, attackerPosAxial.r, targetPosAxial.q, targetPosAxial.r);

        let weaponToUse: 'AP' | 'HE' | null = null;
        if (attackerDef.stats.apWeapon && distance <= attackerDef.stats.apWeapon.range) weaponToUse = 'AP';
        else if (attackerDef.stats.heWeapon && distance <= attackerDef.stats.heWeapon.range) weaponToUse = 'HE';

        const dx = targetUnit.position.x - attacker.position.x; const dy = targetUnit.position.y - attacker.position.y;
        let newTargetOrientationDeg = attacker.orientation;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { const angleRad = Math.atan2(dy, dx); newTargetOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360; }

        if (weaponToUse) { // 射程内なら攻撃準備
            updateUnitOnMap(attacker.instanceId, {
                attackTargetInstanceId: targetUnit.instanceId, moveTargetPosition: null, targetOrientation: newTargetOrientationDeg,
                isTurning: Math.abs(newTargetOrientationDeg - attacker.orientation) > 1 && !!attackerDef.stats.turnSpeed,
                isMoving: false, status: 'aiming', currentPath: null,
            });
        } else { // 射程外ならターゲットに向かって移動
            updateUnitOnMap(attacker.instanceId, { attackTargetInstanceId: targetUnit.instanceId, status: 'idle' }); // 攻撃対象は設定しつつ
            initiateMove(attacker, targetUnit.position.x, targetUnit.position.y);
        }
        setAttackTargetInstanceId(targetUnit.instanceId); // UIフィードバック用
    }
  }, [selectedUnitInstanceId, updateUnitOnMap, initiateMove, gameOverMessage]);

  const handleHexClickInGame = useCallback((q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit, event?: React.MouseEvent) => {
    if (gameOverMessage) return;
    const currentUnits = useGameSettingsStore.getState().allUnitsOnMap;
    // 右クリック: 移動指示 or 攻撃指示解除
    if (event?.button === 2) {
      event.preventDefault();
      if (selectedUnitInstanceId) {
        const selectedUnit = currentUnits.find(u => u.instanceId === selectedUnitInstanceId && u.owner === 'player' && u.status !== 'destroyed');
        if (selectedUnit) {
            initiateMove(selectedUnit, logicalX, logicalY);
            setAttackTargetInstanceId(null); // 移動指示で攻撃対象はリセット
        }
      }
      return;
    }
    // 左クリック: ユニット選択 or 攻撃指示 (Ctrlキー併用)
    if (event?.button === 0) {
        if (event?.ctrlKey && unitOnHex && selectedUnitInstanceId) {
            const attacker = currentUnits.find(u => u.instanceId === selectedUnitInstanceId && u.owner === 'player' && u.status !== 'destroyed');
            // 選択ユニットがプレイヤーのもので、クリック先が敵ユニットの場合
            if (attacker && unitOnHex.owner === 'enemy' && unitOnHex.status !== 'destroyed') {
                handleAttackCommand(unitOnHex);
            }
        } else if (unitOnHex && unitOnHex.status !== 'destroyed') {
            setSelectedUnitInstanceId(unitOnHex.instanceId);
            setAttackTargetInstanceId(null); // 通常選択では攻撃対象リセット
        } else { // 何もない場所をクリック
            setSelectedUnitInstanceId(null);
            setAttackTargetInstanceId(null);
        }
    }
  }, [selectedUnitInstanceId, initiateMove, handleAttackCommand, gameOverMessage]);

  const handlePause = () => { alert("Game Paused (Pause Menu to be implemented)"); };
  const handleSurrender = () => {
    if (!gameOverMessage) {
        setGameOver("Player Surrendered");
    }
  };

  useEffect(() => {
    if (selectedUnitInstanceId) {
        const unit = useGameSettingsStore.getState().allUnitsOnMap.find(u => u.instanceId === selectedUnitInstanceId && u.status !== 'destroyed');
        setDetailedSelectedUnitInfo(unit || null);
    } else { setDetailedSelectedUnitInfo(null); }
  }, [selectedUnitInstanceId, allUnitsOnMapFromStore]); // allUnitsOnMapFromStore を依存配列に追加

  useEffect(() => {
    if (gameOverMessage) {
        console.log("Game Over:", gameOverMessage);
        setTimeout(() => {
            let status = "draw";
            if (gameOverMessage.includes("Player Wins")) status = "win";
            else if (gameOverMessage.includes("Enemy Wins") || gameOverMessage.includes("Surrendered")) status = "lose";
            router.push(`/results?status=${status}&mapId=${mapIdParam || selectedMapIdFromStore || 'unknown'}&reason=${encodeURIComponent(gameOverMessage)}`);
        }, 3000); // 3秒待ってからリザルトへ
    }
  }, [gameOverMessage, router, mapIdParam, selectedMapIdFromStore]);

  // 表示用ユニットリスト (破壊されたユニットはフィルタリング)
  const unitsToDisplayOnGrid = allUnitsOnMapFromStore.filter(u => u.status !== 'destroyed').map(unit => {
      if (unit.owner === 'enemy' && lastSeenEnemyUnits.has(unit.instanceId) && !visibleEnemyUnits.find(veu => veu.instanceId === unit.instanceId)) {
          return { ...lastSeenEnemyUnits.get(unit.instanceId)!, isLastSeen: true }; // lastSeen情報にisLastSeenフラグを付与
      }
      return unit;
  });


  const handleStartProductionRequest = (producerCommanderId: string, unitToProduceId: string) => {
    if (gameOverMessage) return;
    const unitDef = UNITS_MAP.get(unitToProduceId);
    if (!unitDef) {
      alert("Unit definition not found for production.");
      return;
    }
    const result = startUnitProductionAction(producerCommanderId, unitToProduceId, 'player'); // プレイヤーの生産
    if (result.success) {
      // console.log(result.message); // UIフィードバックは生産キュー表示で行う
    } else {
      alert(`Failed to start production: ${result.message}`);
    }
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
          {/* AIリソース表示 (デバッグ用) <div className="text-xs">E-Res: <span className="text-red-400">{enemyResourcesStore}</span></div> */}
          <div>VP: P:<span className="text-blue-400 font-semibold">{playerVP}</span> E:<span className="text-red-400 font-semibold">{enemyVP}</span> (T:{targetVictoryPoints})</div>
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
                  <p className="text-xs text-gray-400">ID: {detailedSelectedUnitInfo.instanceId.slice(-6)}</p>
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
                  <p>Pos: ({detailedSelectedUnitInfo.position.x.toFixed(0)},{detailedSelectedUnitInfo.position.y.toFixed(0)}) Orient: {detailedSelectedUnitInfo.orientation.toFixed(0)}°</p>
                  {detailedSelectedUnitInfo.status && <p className="capitalize">Status: <span className="text-yellow-300">{detailedSelectedUnitInfo.status.replace(/_/g, ' ')}</span></p>}
                  {detailedSelectedUnitInfo.isTurning && detailedSelectedUnitInfo.targetOrientation !== undefined && <p className="text-yellow-400">Turning to {detailedSelectedUnitInfo.targetOrientation.toFixed(0)}°</p>}
                  {detailedSelectedUnitInfo.isMoving && detailedSelectedUnitInfo.moveTargetPosition && <p className="text-green-400">Moving to ({detailedSelectedUnitInfo.moveTargetPosition.x.toFixed(0)},{detailedSelectedUnitInfo.moveTargetPosition.y.toFixed(0)})</p>}
                  {detailedSelectedUnitInfo.attackTargetInstanceId &&
                    (() => {
                        const target = allUnitsOnMapFromStore.find(u=>u.instanceId === detailedSelectedUnitInfo.attackTargetInstanceId);
                        return <p className="text-red-400">Targeting: {target?.name || 'Unknown'} ({target?.currentHp}HP)</p>;
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
            <p className="text-gray-400 text-sm">No unit selected or unit destroyed.</p>
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
                      className="bg-blue-500 h-2.5 rounded-full transition-all duration-100 ease-linear"
                      style={{ width: `${100 - (detailedSelectedUnitInfo.productionQueue.timeLeftMs / detailedSelectedUnitInfo.productionQueue.originalProductionTimeMs) * 100}%` }}
                    ></div>
                  </div>
                  {/* TODO: 生産キャンセルボタン */}
                </div>
              ) : (
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

        <section className="flex-grow bg-gray-700 flex items-center justify-center relative overflow-hidden">
          <GameplayHexGrid
            mapData={currentMapDataFromStore}
            hexSize={28}
            placedUnits={unitsToDisplayOnGrid} // 破壊済みユニットはフィルタリングされたリストを渡す
            onHexClick={handleHexClickInGame}
            selectedUnitInstanceId={selectedUnitInstanceId}
            attackingPairs={attackingVisuals}
            visibleEnemyInstanceIds={new Set(visibleEnemyUnits.map(u => u.instanceId))}
          />
          <div className="absolute bottom-4 right-4 w-56 h-44 bg-green-900 bg-opacity-70 border-2 border-gray-600 rounded shadow-xl p-1 pointer-events-none">
            <p className="text-xs text-center text-green-300">(Mini-map Area)</p>
            {/* ミニマップコンポーネントをここに配置 */}
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