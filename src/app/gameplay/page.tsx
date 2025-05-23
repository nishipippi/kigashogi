// src/app/gameplay/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useCallback } from 'react';
import { useGameSettingsStore, type PlacedUnit } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import GameplayHexGrid from '@/components/game/GameplayHexGrid';
import { ALL_MAPS_DATA } from '@/gameData/maps'; // ALL_MAPS_DATA はここから
import type { MapData } from '@/types/map';      // MapData 型はここから
import { UNITS_MAP } from '@/gameData/units';
import { hexDistance, logicalToAxial } from '@/lib/hexUtils';

function GameplayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapIdParam = searchParams.get('mapId');

  const storeInitialCost = useGameSettingsStore(state => state.initialCost);
  // initialDeploymentFromStore は直接は使わず、allUnitsOnMap をストアから購読
  const selectedMapIdFromStore = useGameSettingsStore(state => state.selectedMapId);
  const allUnitsOnMap = useGameSettingsStore(state => state.allUnitsOnMap);
  const updateUnitOnMap = useGameSettingsStore(state => state.updateUnitOnMap);

  const [currentMapData, setCurrentMapData] = useState<MapData | null>(null);
  const [gameTime, setGameTime] = useState(0);
  const [resources, setResources] = useState(storeInitialCost);
  const [victoryPoints, setVictoryPoints] = useState({ player: 0, enemy: 0 });

  const [selectedUnitInstanceId, setSelectedUnitInstanceId] = useState<string | null>(null);
  const [detailedSelectedUnitInfo, setDetailedSelectedUnitInfo] = useState<PlacedUnit | null>(null);
  const [attackTargetInstanceId, setAttackTargetInstanceId] = useState<string | null>(null);
  // targetMovePosition はコンポーネントstateから削除され、各ユニットのプロパティとして管理

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

  useEffect(() => {
    const timer = setInterval(() => setGameTime(prev => prev + 1), 1000);
    const revenueTimer = setInterval(() => setResources(prev => prev + COST_REVENUE_AMOUNT), COST_REVENUE_INTERVAL);
    const vpTimer = setInterval(() => setVictoryPoints(prev => ({ player: prev.player + 1, enemy: prev.enemy + 0 })), 30000);
    return () => { clearInterval(timer); clearInterval(revenueTimer); clearInterval(vpTimer); };
  }, []);

  const initiateMove = useCallback((unitToMove: PlacedUnit, targetX: number, targetY: number) => {
    const unitDef = UNITS_MAP.get(unitToMove.unitId);
    if (!unitDef) return;

    const dx = targetX - unitToMove.position.x;
    const dy = targetY - unitToMove.position.y;
    let newTargetOrientation = unitToMove.orientation;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        const angleRad = Math.atan2(dy, dx);
        let angleDeg = angleRad * (180 / Math.PI);
        if (angleDeg < 0) angleDeg += 360;
        newTargetOrientation = Math.round(angleDeg / 60) % 6;
    }

    const needsToTurn = newTargetOrientation !== unitToMove.orientation && unitDef.stats.turnSpeed !== undefined && unitDef.stats.turnSpeed > 0;

    updateUnitOnMap(unitToMove.instanceId, {
        moveTargetPosition: { x: targetX, y: targetY },
        targetOrientation: newTargetOrientation,
        isTurning: needsToTurn,
        isMoving: !needsToTurn,
    });
  }, [updateUnitOnMap]);

  // ユニットの更新ループ (旋回と移動)
  useEffect(() => {
    const unitProcessInterval = setInterval(() => {
      // allUnitsOnMap はストアから最新のものを取得している想定だが、
      // このループ内で直接ストアの値を参照するとuseEffectの依存関係が複雑になるため、
      // useGameSettingsStore.getState().allUnitsOnMap を使うか、
      // allUnitsOnMap を依存配列に入れてループ内で最新の値を使う。
      // ここでは、依存配列に入っている allUnitsOnMap (ループ開始時のスナップショット) を使う。
      // ストアが更新されると、このuseEffectが再実行され、新しい allUnitsOnMap でループが回る。
      const currentUnits = useGameSettingsStore.getState().allUnitsOnMap; // ★ ループ内で最新のストア状態を取得

      currentUnits.forEach(unit => {
        if (!unit) return;
        const unitDef = UNITS_MAP.get(unit.unitId);
        if (!unitDef) return;

        // 旋回処理
        if (unit.isTurning && unit.targetOrientation !== undefined) {
          const currentOrientation = unit.orientation;
          const targetOrientation = unit.targetOrientation;
          // const turnSpeedDegPerTick = (unitDef.stats.turnSpeed || 3600) / (1000 / 100); // 将来的に使用

          let diff = (targetOrientation - currentOrientation + 6) % 6;
          let newOrientation = currentOrientation;

          if (diff !== 0) {
            if (diff <= 3) { newOrientation = (currentOrientation + 1) % 6; }
            else { newOrientation = (currentOrientation - 1 + 6) % 6; }

            if (newOrientation === targetOrientation) {
              updateUnitOnMap(unit.instanceId, {
                orientation: newOrientation,
                isTurning: false,
                isMoving: !!unit.moveTargetPosition,
              });
            } else {
              updateUnitOnMap(unit.instanceId, { orientation: newOrientation });
            }
          } else {
            updateUnitOnMap(unit.instanceId, {
              isTurning: false,
              isMoving: !!unit.moveTargetPosition,
            });
          }
        }
        // 移動処理
        else if (unit.isMoving && unit.moveTargetPosition) {
          const currentPos = unit.position;
          const targetPos = unit.moveTargetPosition;
          let newX = currentPos.x;
          let newY = currentPos.y;

          const stepSize = (unitDef.stats.moveSpeed || 1) * 0.1; // 1tick(100ms)での移動距離

          const dxTotal = targetPos.x - currentPos.x;
          const dyTotal = targetPos.y - currentPos.y;
          const distanceToTarget = Math.sqrt(dxTotal * dxTotal + dyTotal * dyTotal);

          if (distanceToTarget < stepSize) {
            updateUnitOnMap(unit.instanceId, {
              position: targetPos,
              isMoving: false,
              moveTargetPosition: null,
            });
            console.log(`Unit ${unit.instanceId} arrived at (${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)})`);
          } else {
            newX += (dxTotal / distanceToTarget) * stepSize;
            newY += (dyTotal / distanceToTarget) * stepSize;

            // 移動中に再度向きを計算
            const dxNext = targetPos.x - newX;
            const dyNext = targetPos.y - newY;
            let nextTargetOrientation = unit.orientation;
            if (Math.abs(dxNext) > 0.01 || Math.abs(dyNext) > 0.01) {
                const angleRad = Math.atan2(dyNext, dxNext);
                let angleDeg = angleRad * (180 / Math.PI);
                if (angleDeg < 0) angleDeg += 360;
                nextTargetOrientation = Math.round(angleDeg / 60) % 6;
            }

            if (nextTargetOrientation !== unit.orientation && unitDef.stats.turnSpeed && (Math.abs(nextTargetOrientation - unit.orientation) % 6 !== 0) ) {
                 updateUnitOnMap(unit.instanceId, {
                    position: { x: parseFloat(newX.toFixed(2)), y: parseFloat(newY.toFixed(2)) },
                    targetOrientation: nextTargetOrientation,
                    isTurning: true,
                    isMoving: false
                });
            } else {
                updateUnitOnMap(unit.instanceId, {
                    position: { x: parseFloat(newX.toFixed(2)), y: parseFloat(newY.toFixed(2)) },
                    orientation: nextTargetOrientation // 向きも更新
                });
            }
          }
        }
      });
    }, 100);

    return () => clearInterval(unitProcessInterval);
  }, [updateUnitOnMap]); // allUnitsOnMap を依存配列から削除 (ループ内でgetStateするため)


  const handleAttackCommand = useCallback((targetUnit: PlacedUnit) => {
    if (!selectedUnitInstanceId) return;
    const currentAllUnits = useGameSettingsStore.getState().allUnitsOnMap; // 最新のユニット情報を取得
    const attacker = currentAllUnits.find(u => u.instanceId === selectedUnitInstanceId);
    const attackerDef = attacker ? UNITS_MAP.get(attacker.unitId) : null;

    if (attacker && attackerDef && targetUnit) {
        console.log(`Attack command: ${attacker.name} -> ${targetUnit.name}`);
        setAttackTargetInstanceId(targetUnit.instanceId);

        const attackerPosAxial = logicalToAxial(attacker.position.x, attacker.position.y);
        const targetPosAxial = logicalToAxial(targetUnit.position.x, targetUnit.position.y);
        const distance = hexDistance(attackerPosAxial.q, attackerPosAxial.r, targetPosAxial.q, targetPosAxial.r);

        const heRange = attackerDef.stats.heWeapon?.range;
        const apRange = attackerDef.stats.apWeapon?.range;
        let isInRange = false;
        let weaponUsed = "";

        if (heRange !== undefined && distance <= heRange) { isInRange = true; weaponUsed = "HE"; }
        if (apRange !== undefined && distance <= apRange) { isInRange = true; weaponUsed = "AP"; }

        const dx = targetUnit.position.x - attacker.position.x;
        const dy = targetUnit.position.y - attacker.position.y;
        let newTargetOrientation = attacker.orientation;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            const angleRad = Math.atan2(dy, dx);
            let angleDeg = angleRad * (180 / Math.PI);
            if (angleDeg < 0) angleDeg += 360;
            newTargetOrientation = Math.round(angleDeg / 60) % 6;
        }

        if (isInRange) {
            console.log(`${weaponUsed} Weapon In range! Distance: ${distance.toFixed(1)}`);
            if (newTargetOrientation !== attacker.orientation && attackerDef.stats.turnSpeed) {
                updateUnitOnMap(attacker.instanceId, { targetOrientation: newTargetOrientation, isTurning: true, isMoving: false });
            } else {
                console.log("Facing target, ready to fire (actual firing not implemented)");
            }
        } else {
            console.log(`Out of range. Distance: ${distance.toFixed(1)}`);
            initiateMove(attacker, targetUnit.position.x, targetUnit.position.y);
        }
    }
  }, [selectedUnitInstanceId, updateUnitOnMap, initiateMove]);


  const handleHexClickInGame = useCallback((q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit, event?: React.MouseEvent) => {
    const currentAllUnits = useGameSettingsStore.getState().allUnitsOnMap; // 最新のユニット情報を取得

    if (event?.button === 2) { // 右クリック
      event.preventDefault();
      if (selectedUnitInstanceId) {
        const selectedUnit = currentAllUnits.find(u => u.instanceId === selectedUnitInstanceId);
        if (selectedUnit) {
          initiateMove(selectedUnit, logicalX, logicalY);
        }
      }
      setAttackTargetInstanceId(null);
      return;
    }

    // 左クリック
    if (event?.ctrlKey && unitOnHex && selectedUnitInstanceId) {
      const attacker = currentAllUnits.find(u => u.instanceId === selectedUnitInstanceId);
      if (attacker && attacker.instanceId !== unitOnHex.instanceId) {
        handleAttackCommand(unitOnHex);
      }
    } else if (unitOnHex) {
      setSelectedUnitInstanceId(unitOnHex.instanceId);
      setDetailedSelectedUnitInfo(unitOnHex);
      setAttackTargetInstanceId(null);
    } else {
      setSelectedUnitInstanceId(null);
      setDetailedSelectedUnitInfo(null);
      setAttackTargetInstanceId(null);
    }
  }, [selectedUnitInstanceId, initiateMove, handleAttackCommand]);

  const handlePause = () => { alert("Game Paused (Pause Menu to be implemented)"); };
  const handleSurrender = () => {
    alert("Surrendered (Results screen to be implemented)");
    router.push(`/results?status=surrender&mapId=${mapIdParam}`);
  };

  // selectedUnitInstanceId が変更されたときに detailedSelectedUnitInfo を更新
  useEffect(() => {
    if (selectedUnitInstanceId) {
      const unit = useGameSettingsStore.getState().allUnitsOnMap.find(u => u.instanceId === selectedUnitInstanceId);
      setDetailedSelectedUnitInfo(unit || null);
    } else {
      setDetailedSelectedUnitInfo(null);
    }
  }, [selectedUnitInstanceId]);


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
                  <p>Position: ({detailedSelectedUnitInfo.position.x.toFixed(1)}, {detailedSelectedUnitInfo.position.y.toFixed(1)}) Orient: {detailedSelectedUnitInfo.orientation}</p>
                  {detailedSelectedUnitInfo.isTurning && detailedSelectedUnitInfo.targetOrientation !== undefined && <p className="text-yellow-400">Status: Turning (to {detailedSelectedUnitInfo.targetOrientation})</p>}
                  {detailedSelectedUnitInfo.isMoving && detailedSelectedUnitInfo.moveTargetPosition && <p className="text-green-400">Status: Moving (to {detailedSelectedUnitInfo.moveTargetPosition.x.toFixed(1)},{detailedSelectedUnitInfo.moveTargetPosition.y.toFixed(1)})</p>}
                  {attackTargetInstanceId && <p className="text-red-400">Attacking: {useGameSettingsStore.getState().allUnitsOnMap.find(u=>u.instanceId === attackTargetInstanceId)?.name}</p>}

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
            placedUnits={allUnitsOnMap} // ストアから取得した allUnitsOnMap を渡す
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