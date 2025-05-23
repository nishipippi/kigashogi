// src/app/gameplay/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useCallback } from 'react';
import { useGameSettingsStore, type PlacedUnit } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import GameplayHexGrid from '@/components/game/GameplayHexGrid';
import { ALL_MAPS_DATA } from '@/gameData/maps'; 
import type { MapData } from '@/types/map';      // MapData 型はここから
import { UNITS_MAP } from '@/gameData/units';
import { hexDistance, logicalToAxial, getHexLinePath } from '@/lib/hexUtils';

function GameplayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapIdParam = searchParams.get('mapId');

  const storeInitialCost = useGameSettingsStore(state => state.initialCost);
  const initialDeploymentFromStore = useGameSettingsStore(state => state.initialDeployment); // これは最初の読み込みに使う
  const selectedMapIdFromStore = useGameSettingsStore(state => state.selectedMapId);
  const allUnitsOnMap = useGameSettingsStore(state => state.allUnitsOnMap);
  const updateUnitOnMap = useGameSettingsStore(state => state.updateUnitOnMap);
  const setAllUnitsOnMap = useGameSettingsStore(state => state.setAllUnitsOnMap); // ゲーム開始時に使う

  const [currentMapData, setCurrentMapData] = useState<MapData | null>(null);
  const [gameTime, setGameTime] = useState(0);
  const [resources, setResources] = useState(storeInitialCost);
  const [victoryPoints, setVictoryPoints] = useState({ player: 0, enemy: 0 });

  const [selectedUnitInstanceId, setSelectedUnitInstanceId] = useState<string | null>(null);
  const [detailedSelectedUnitInfo, setDetailedSelectedUnitInfo] = useState<PlacedUnit | null>(null);
  // const [targetMovePosition, setTargetMovePosition] = useState<{ x: number; y: number } | null>(null); // ユニットごとの状態に移行
  const [attackTargetInstanceId, setAttackTargetInstanceId] = useState<string | null>(null);


  const COST_REVENUE_INTERVAL = 10000;
  const COST_REVENUE_AMOUNT = 50;

  useEffect(() => {
    const mapIdToLoad = mapIdParam || selectedMapIdFromStore;
    if (mapIdToLoad && ALL_MAPS_DATA[mapIdToLoad]) {
      setCurrentMapData(ALL_MAPS_DATA[mapIdToLoad]);
    } else {
      console.warn(`Map with id "${mapIdToLoad}" not found.`);
    }
  }, [mapIdParam, selectedMapIdFromStore]);

  useEffect(() => {
    setResources(storeInitialCost);
  }, [storeInitialCost]);

  // ゲーム開始時にストアの initialDeployment を allUnitsOnMap にコピーする処理 (一度だけ)
  useEffect(() => {
    if (initialDeploymentFromStore && initialDeploymentFromStore.length > 0 && allUnitsOnMap.length === 0) {
        // ストアの allUnitsOnMap を初期配置で設定する (もしくは setInitialDeployment で既に行われている)
        // ここでは、initialDeploymentFromStore を直接 setAllUnitsOnMap に渡すのが素直
        // ただし、ストアの setInitialDeployment で既に allUnitsOnMap も更新されているなら不要
        // 現状のストアの setInitialDeployment は allUnitsOnMap も更新するので、この useEffect は不要かもしれない。
        // 安全のため、allUnitsOnMapが空の場合のみ実行する形にするか、ストアのロジックを信頼する。
        // setAllUnitsOnMap(initialDeploymentFromStore);
    }
  }, [initialDeploymentFromStore, allUnitsOnMap, setAllUnitsOnMap]);


  useEffect(() => {
    const timer = setInterval(() => setGameTime(prev => prev + 1), 1000);
    const revenueTimer = setInterval(() => setResources(prev => prev + COST_REVENUE_AMOUNT), COST_REVENUE_INTERVAL);
    const vpTimer = setInterval(() => setVictoryPoints(prev => ({ player: prev.player + 1, enemy: prev.enemy + 0 })), 30000);
    return () => { clearInterval(timer); clearInterval(revenueTimer); clearInterval(vpTimer); };
  }, []);


  const initiateMove = useCallback((unitToMove: PlacedUnit, targetLogicalX: number, targetLogicalY: number) => {
    const unitDef = UNITS_MAP.get(unitToMove.unitId);
    if (!unitDef) return;

    const startAxial = logicalToAxial(unitToMove.position.x, unitToMove.position.y);
    const targetAxial = logicalToAxial(targetLogicalX, targetLogicalY);
    let path = getHexLinePath(startAxial.q, startAxial.r, targetAxial.q, targetAxial.r);

    if (path.length === 0 && (unitToMove.position.x !== targetLogicalX || unitToMove.position.y !== targetLogicalY)) {
        path.push({ x: targetLogicalX, y: targetLogicalY });
    }

    if (path.length > 0) {
        const firstStep = path[0];
        const dx = firstStep.x - unitToMove.position.x;
        const dy = firstStep.y - unitToMove.position.y;
        let newTargetOrientation = unitToMove.orientation;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            const angleRad = Math.atan2(dy, dx);
            newTargetOrientation = (angleRad * (180 / Math.PI) + 360) % 360;
        }

        const needsToTurn = Math.abs(newTargetOrientation - unitToMove.orientation) > 1 &&
                            unitDef.stats.turnSpeed !== undefined && unitDef.stats.turnSpeed > 0;
        const timePerHex = (1 / (unitDef.stats.moveSpeed || 1)) * 1000;

        updateUnitOnMap(unitToMove.instanceId, {
            currentPath: path,
            timeToNextHex: needsToTurn ? null : timePerHex,
            moveTargetPosition: { x: targetLogicalX, y: targetLogicalY },
            targetOrientation: newTargetOrientation,
            isTurning: needsToTurn,
            isMoving: !needsToTurn,
            status: needsToTurn ? 'turning' : 'moving',
        });
    } else {
        updateUnitOnMap(unitToMove.instanceId, {
            currentPath: null, timeToNextHex: null, isMoving: false, status: 'idle'
        });
    }
  }, [updateUnitOnMap]);


  useEffect(() => {
    const tickRate = 100;
    const unitProcessInterval = setInterval(() => {
      const currentTime = Date.now(); // 攻撃間隔チェック用
      allUnitsOnMap.forEach(unit => {
        if (!unit) return;
        const unitDef = UNITS_MAP.get(unit.unitId);
        if (!unitDef) return;

        // 旋回処理
        if (unit.isTurning && unit.targetOrientation !== undefined) {
            const turnSpeedDegPerTick = (unitDef.stats.turnSpeed || 3600) / (1000 / tickRate);
            let currentOrientation = unit.orientation;
            const targetOrientation = unit.targetOrientation;
            let diff = targetOrientation - currentOrientation;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;

            let newOrientation = currentOrientation;
            if (Math.abs(diff) < turnSpeedDegPerTick || Math.abs(diff) < 0.1) {
                newOrientation = targetOrientation;
                const timePerHex = (1 / (unitDef.stats.moveSpeed || 1)) * 1000;
                updateUnitOnMap(unit.instanceId, {
                    orientation: newOrientation,
                    isTurning: false,
                    isMoving: !!unit.currentPath && unit.currentPath.length > 0,
                    timeToNextHex: (!!unit.currentPath && unit.currentPath.length > 0) ? timePerHex : null,
                    targetOrientation: undefined,
                    status: (!!unit.currentPath && unit.currentPath.length > 0) ? 'moving' : 'idle',
                });
            } else {
                newOrientation = (currentOrientation + Math.sign(diff) * turnSpeedDegPerTick + 360) % 360;
                updateUnitOnMap(unit.instanceId, { orientation: newOrientation });
            }
        }
        // 移動処理 (ステップベース)
        else if (unit.isMoving && unit.currentPath && unit.currentPath.length > 0 && unit.timeToNextHex !== null && unit.timeToNextHex !== undefined) {
            let newTimeToNextHex = unit.timeToNextHex - tickRate;

            if (newTimeToNextHex <= 0) {
                const nextPosition = unit.currentPath[0];
                const remainingPath = unit.currentPath.slice(1);
                let newOrientation = unit.orientation;

                if (remainingPath.length > 0) {
                    const nextNextPosition = remainingPath[0];
                    const dx = nextNextPosition.x - nextPosition.x;
                    const dy = nextNextPosition.y - nextPosition.y;
                    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
                        const angleRad = Math.atan2(dy, dx);
                        newOrientation = (angleRad * (180 / Math.PI) + 360) % 360;
                    }
                    const needsToTurn = Math.abs(newOrientation - unit.orientation) > 1 &&
                                        unitDef.stats.turnSpeed !== undefined && unitDef.stats.turnSpeed > 0;
                    const timePerHex = (1 / (unitDef.stats.moveSpeed || 1)) * 1000;
                    updateUnitOnMap(unit.instanceId, {
                        position: nextPosition,
                        orientation: needsToTurn ? unit.orientation : newOrientation,
                        currentPath: remainingPath,
                        timeToNextHex: needsToTurn ? null : timePerHex,
                        isMoving: !needsToTurn,
                        isTurning: needsToTurn,
                        targetOrientation: needsToTurn ? newOrientation : undefined,
                        status: needsToTurn ? 'turning' : 'moving',
                    });
                } else { // 最終目的地に到達
                    updateUnitOnMap(unit.instanceId, {
                        position: nextPosition,
                        orientation: newOrientation, // 最終的な向き
                        currentPath: null,
                        timeToNextHex: null,
                        isMoving: false,
                        isTurning: false,
                        moveTargetPosition: null,
                        status: 'idle',
                    });
                    console.log(`Unit ${unit.instanceId} arrived at final destination (${nextPosition.x}, ${nextPosition.y})`);
                }
            } else {
                updateUnitOnMap(unit.instanceId, { timeToNextHex: newTimeToNextHex });
            }
        }
        // 攻撃処理の準備
        else if (unit.attackTargetInstanceId && (unit.status === 'aiming' || unit.status === 'attacking_he' || unit.status === 'attacking_ap' || unit.status === 'reloading_he' || unit.status === 'reloading_ap')) {
            if (unit.isTurning || unit.isMoving) { return; } // 移動中や旋回中は攻撃準備中断

            const targetUnit = allUnitsOnMap.find(u => u.instanceId === unit.attackTargetInstanceId);
            if (!targetUnit || !unitDef) {
                updateUnitOnMap(unit.instanceId, { status: 'idle', attackTargetInstanceId: null });
                return;
            }

            const dx = targetUnit.position.x - unit.position.x;
            const dy = targetUnit.position.y - unit.position.y;
            let requiredOrientationDeg = unit.orientation;
            if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
                const angleRad = Math.atan2(dy, dx);
                requiredOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360;
            }
            if (Math.abs(requiredOrientationDeg - unit.orientation) > 5) {
                updateUnitOnMap(unit.instanceId, { targetOrientation: requiredOrientationDeg, isTurning: true, status: 'aiming' });
                return;
            }

            const attackerPosAxial = logicalToAxial(unit.position.x, unit.position.y);
            const targetPosAxial = logicalToAxial(targetUnit.position.x, targetUnit.position.y);
            const distance = hexDistance(attackerPosAxial.q, attackerPosAxial.r, targetPosAxial.q, targetPosAxial.r);

            let weaponToUse: { type: 'HE' | 'AP', stats: NonNullable<UnitData['stats']['heWeapon'] | UnitData['stats']['apWeapon']> } | null = null;
            if (unitDef.stats.apWeapon && distance <= unitDef.stats.apWeapon.range) {
                weaponToUse = { type: 'AP', stats: unitDef.stats.apWeapon };
            } else if (unitDef.stats.heWeapon && distance <= unitDef.stats.heWeapon.range) {
                weaponToUse = { type: 'HE', stats: unitDef.stats.heWeapon };
            }

            if (!weaponToUse) {
                updateUnitOnMap(unit.instanceId, { status: 'idle', attackTargetInstanceId: null });
                return;
            }

            const attackIntervalMs = weaponToUse.stats.attackInterval * 1000;
            const lastAttackTime = weaponToUse.type === 'HE' ? unit.lastAttackTimeHE : unit.lastAttackTimeAP;

            if (unit.status === 'aiming' || (lastAttackTime && currentTime - lastAttackTime >= attackIntervalMs) ) {
                if (unit.status !== `attacking_${weaponToUse.type.toLowerCase() as 'he' | 'ap'}`) {
                     console.log(`${unit.name} starts attacking ${targetUnit.name} with ${weaponToUse.type}`);
                     updateUnitOnMap(unit.instanceId, {
                        status: weaponToUse.type === 'HE' ? 'attacking_he' : 'attacking_ap',
                        [weaponToUse.type === 'HE' ? 'lastAttackTimeHE' : 'lastAttackTimeAP']: currentTime
                     });
                }
            } else if (lastAttackTime && currentTime - lastAttackTime < attackIntervalMs) {
                const newStatus = weaponToUse.type === 'HE' ? 'reloading_he' : 'reloading_ap';
                if (unit.status !== newStatus) {
                    updateUnitOnMap(unit.instanceId, { status: newStatus });
                }
            }
        }
      });
    }, tickRate);
    return () => clearInterval(unitProcessInterval);
  }, [allUnitsOnMap, updateUnitOnMap]);


  const handleAttackCommand = useCallback((targetUnit: PlacedUnit) => {
    if (!selectedUnitInstanceId || !allUnitsOnMap) return;
    const attacker = allUnitsOnMap.find(u => u.instanceId === selectedUnitInstanceId);
    const attackerDef = attacker ? UNITS_MAP.get(attacker.unitId) : null;

    if (attacker && attackerDef && targetUnit) {
        console.log(`Attack command: ${attacker.name} -> ${targetUnit.name}`);
        // setAttackTargetInstanceId(targetUnit.instanceId); // これはUI表示用なので、ストアの更新が主

        const attackerPosAxial = logicalToAxial(attacker.position.x, attacker.position.y);
        const targetPosAxial = logicalToAxial(targetUnit.position.x, targetUnit.position.y);
        const distance = hexDistance(attackerPosAxial.q, attackerPosAxial.r, targetPosAxial.q, targetPosAxial.r);

        let weaponToUse: 'AP' | 'HE' | null = null;
        let range = 0;
        if (attackerDef.stats.apWeapon && distance <= attackerDef.stats.apWeapon.range) {
            weaponToUse = 'AP';
            range = attackerDef.stats.apWeapon.range;
        } else if (attackerDef.stats.heWeapon && distance <= attackerDef.stats.heWeapon.range) {
            weaponToUse = 'HE';
            range = attackerDef.stats.heWeapon.range;
        }

        const dx = targetUnit.position.x - attacker.position.x;
        const dy = targetUnit.position.y - attacker.position.y;
        let newTargetOrientationDeg = attacker.orientation;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            const angleRad = Math.atan2(dy, dx);
            newTargetOrientationDeg = (angleRad * (180 / Math.PI) + 360) % 360;
        }

        if (weaponToUse) {
            console.log(`${weaponToUse} Weapon In range! Distance: ${distance.toFixed(1)}, Range: ${range}`);
            updateUnitOnMap(attacker.instanceId, {
                attackTargetInstanceId: targetUnit.instanceId,
                moveTargetPosition: null,
                targetOrientation: newTargetOrientationDeg,
                isTurning: Math.abs(newTargetOrientationDeg - attacker.orientation) > 1 && !!attackerDef.stats.turnSpeed,
                isMoving: false,
                status: 'aiming',
            });
        } else {
            console.log(`Out of range for any weapon. Distance: ${distance.toFixed(1)}`);
            // 攻撃対象を記憶しつつ移動開始
            updateUnitOnMap(attacker.instanceId, { attackTargetInstanceId: targetUnit.instanceId, status: 'idle' });
            initiateMove(attacker, targetUnit.position.x, targetUnit.position.y);
        }
        setAttackTargetInstanceId(targetUnit.instanceId); // UI表示用のコンポーネントstate
    }
  }, [selectedUnitInstanceId, allUnitsOnMap, updateUnitOnMap, initiateMove]);


  const handleHexClickInGame = useCallback((q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit, event?: React.MouseEvent) => {
    if (event?.button === 2) { // 右クリック
      event.preventDefault();
      if (selectedUnitInstanceId) {
        const selectedUnit = allUnitsOnMap.find(u => u.instanceId === selectedUnitInstanceId);
        if (selectedUnit) {
          // 右クリックした先にユニットがいても、移動指示を優先 (ターゲットクリア)
          updateUnitOnMap(selectedUnit.instanceId, {attackTargetInstanceId: null});
          initiateMove(selectedUnit, logicalX, logicalY);
        }
      }
      setAttackTargetInstanceId(null); // UI表示用もクリア
      return;
    }

    // 左クリック
    if (event?.ctrlKey && unitOnHex && selectedUnitInstanceId) {
      const attacker = allUnitsOnMap.find(u => u.instanceId === selectedUnitInstanceId);
      if (attacker && attacker.instanceId !== unitOnHex.instanceId) { // 自分自身は攻撃しない
        handleAttackCommand(unitOnHex);
      }
    } else if (unitOnHex) {
      setSelectedUnitInstanceId(unitOnHex.instanceId);
      setDetailedSelectedUnitInfo(unitOnHex);
      setAttackTargetInstanceId(null); // 通常選択で攻撃目標クリア
      // setTargetMovePosition(null); // ユニット選択時に移動目標をクリアするかは設計次第
    } else {
      setSelectedUnitInstanceId(null);
      setDetailedSelectedUnitInfo(null);
      setAttackTargetInstanceId(null);
      // setTargetMovePosition(null);
    }
  }, [selectedUnitInstanceId, allUnitsOnMap, initiateMove, handleAttackCommand, updateUnitOnMap]);

  const handlePause = () => { alert("Game Paused (Pause Menu to be implemented)"); };
  const handleSurrender = () => {
    alert("Surrendered (Results screen to be implemented)");
    router.push(`/results?status=surrender&mapId=${mapIdParam}`);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <header className="h-16 bg-black bg-opacity-50 p-3 flex justify-between items-center shadow-lg z-10">
        <div className="flex items-center space-x-6">
          <div>KigaShogi</div>
          <div>Map: <span className="font-semibold">{currentMapData?.name || mapIdParam || 'N/A'}</span></div>
          <div>Time: <span className="font-semibold">{Math.floor(gameTime / 60)}:{(gameTime % 60).toString().padStart(2, '0')}</span></div>
        </div>
        <div className="flex items-center space-x-4">
          <div>Resources: <span className="font-bold text-yellow-400">{resources} C</span></div>
          <div>Victory Points:
            <span className="text-blue-400 font-semibold"> {victoryPoints.player}</span> /
            <span className="text-red-400 font-semibold"> {victoryPoints.enemy}</span>
            (Target: 100)
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
              const currentUnitState = allUnitsOnMap.find(u => u.instanceId === detailedSelectedUnitInfo.instanceId) || detailedSelectedUnitInfo; // ストアの最新状態を参照
              return (
                <div className="text-sm space-y-1">
                  <p className="text-base"><span className="font-medium">{unitDef.icon} {unitDef.name}</span></p>
                  <p>Instance ID: <span className="text-xs text-gray-400">{currentUnitState.instanceId}</span></p>
                  <p>Owner: <span className={currentUnitState.owner === 'player' ? 'text-blue-300' : 'text-red-300'}>{currentUnitState.owner}</span></p>
                  <p>HP: {currentUnitState.currentHp} / {unitDef.stats.hp}</p>
                  {unitDef.stats.hp > 0 && currentUnitState.currentHp !== undefined && (
                    <div className="w-full bg-gray-600 rounded-full h-2.5 my-1">
                      <div
                        className={`h-2.5 rounded-full ${
                          currentUnitState.currentHp / unitDef.stats.hp > 0.6 ? 'bg-green-500' :
                          currentUnitState.currentHp / unitDef.stats.hp > 0.3 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${Math.max(0, (currentUnitState.currentHp / unitDef.stats.hp) * 100)}%` }}
                      ></div>
                    </div>
                  )}
                  <p>Pos: ({currentUnitState.position.x.toFixed(1)}, {currentUnitState.position.y.toFixed(1)}) Orient: {currentUnitState.orientation.toFixed(0)}°</p>
                  <p>Status: <span className="font-semibold">{currentUnitState.status}</span></p>
                  {currentUnitState.isTurning && currentUnitState.targetOrientation !== undefined && <p className="text-yellow-400">Turning to {currentUnitState.targetOrientation.toFixed(0)}°</p>}
                  {currentUnitState.isMoving && currentUnitState.moveTargetPosition && <p className="text-green-400">Moving to ({currentUnitState.moveTargetPosition.x}, {currentUnitState.moveTargetPosition.y})</p>}
                  {currentUnitState.attackTargetInstanceId && <p className="text-red-400">Targeting: {allUnitsOnMap.find(u=>u.instanceId === currentUnitState.attackTargetInstanceId)?.name}</p>}


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

          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 pt-4">Production Queue</h2>
          <div className="text-gray-400 text-sm">
            <p>(Commander Unit Production UI here)</p>
            <p>Queue: Empty</p>
          </div>
        </aside>

        <section className="flex-grow bg-gray-700 flex items-center justify-center relative">
          <GameplayHexGrid
            mapData={currentMapData}
            hexSize={26}
            placedUnits={allUnitsOnMap}
            onHexClick={handleHexClickInGame}
            selectedUnitInstanceId={selectedUnitInstanceId}
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