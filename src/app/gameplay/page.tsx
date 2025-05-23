// src/app/gameplay/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useCallback } from 'react'; // useCallback を追加
import { useGameSettingsStore, type PlacedUnit } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import GameplayHexGrid from '@/components/game/GameplayHexGrid';
import { ALL_MAPS_DATA } from '@/gameData/maps'; // ALL_MAPS_DATA はここから
import type { MapData } from '@/types/map';      // MapData 型はここから
import { UNITS_MAP } from '@/gameData/units';

function GameplayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapIdParam = searchParams.get('mapId');

  const storeInitialCost = useGameSettingsStore(state => state.initialCost);
  // allUnitsOnMap はストアから直接取得し、コンポーネントのローカルstateとしては管理しない
  const allUnitsOnMap = useGameSettingsStore(state => state.allUnitsOnMap);
  const updateUnitOnMap = useGameSettingsStore(state => state.updateUnitOnMap);
  // setAllUnitsOnMap は初期化時にストア側で行うため、ここでは直接呼ばない
  // const setAllUnitsOnMap = useGameSettingsStore(state => state.setAllUnitsOnMap);
  const selectedMapIdFromStore = useGameSettingsStore(state => state.selectedMapId);
  // const initialDeploymentFromStore = useGameSettingsStore(state => state.initialDeployment);


  const [currentMapData, setCurrentMapData] = useState<MapData | null>(null);
  const [gameTime, setGameTime] = useState(0);
  const [resources, setResources] = useState(storeInitialCost);
  const [victoryPoints, setVictoryPoints] = useState({ player: 0, enemy: 0 });

  const [selectedUnitInstanceId, setSelectedUnitInstanceId] = useState<string | null>(null);
  const [detailedSelectedUnitInfo, setDetailedSelectedUnitInfo] = useState<PlacedUnit | null>(null);
  const [targetMovePosition, setTargetMovePosition] = useState<{ x: number; y: number } | null>(null);

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

  // ゲーム開始時にストアの initialDeployment を allUnitsOnMap にコピーするロジックは
  // ストアの setInitialDeployment 内で既に行われているため、ここでは不要。
  // useEffect(() => {
  //   if (initialDeploymentFromStore && initialDeploymentFromStore.length > 0 && allUnitsOnMap.length === 0) {
  //     // このロジックはストアの初期化方法による。
  //     // ストアが永続化されておらず、ページリロードで initialDeployment が残っていても allUnitsOnMap が空になる場合など。
  //     // 通常は setInitialDeployment 呼び出し時に allUnitsOnMap もセットされる。
  //     // useGameSettingsStore.getState().setAllUnitsOnMap(initialDeploymentFromStore); // 直接呼ぶのは非推奨
  //   }
  // }, [initialDeploymentFromStore, allUnitsOnMap]);


  useEffect(() => {
    const timer = setInterval(() => setGameTime(prev => prev + 1), 1000);
    const revenueTimer = setInterval(() => setResources(prev => prev + COST_REVENUE_AMOUNT), COST_REVENUE_INTERVAL);
    const vpTimer = setInterval(() => setVictoryPoints(prev => ({ player: prev.player + 1, enemy: prev.enemy + 0 })), 30000);
    return () => { clearInterval(timer); clearInterval(revenueTimer); clearInterval(vpTimer); };
  }, []);

  // ユニット移動ロジック
  useEffect(() => {
    if (!selectedUnitInstanceId || !targetMovePosition || !allUnitsOnMap || allUnitsOnMap.length === 0) return;

    let animationFrameId: number;
    const unitToMove = allUnitsOnMap.find(u => u.instanceId === selectedUnitInstanceId);

    if (!unitToMove) {
      setTargetMovePosition(null);
      return;
    }

    const move = () => {
      // ストアから最新のユニット情報を取得し直す（他の要因で変更されている可能性に対応）
      const currentUnitState = useGameSettingsStore.getState().allUnitsOnMap.find(u => u.instanceId === selectedUnitInstanceId);
      if (!currentUnitState || !targetMovePosition) { // targetMovePositionがnullになったら停止
        setTargetMovePosition(null);
        return;
      }

      const currentPos = currentUnitState.position;
      const targetPos = targetMovePosition;
      let newX = currentPos.x;
      let newY = currentPos.y;
      let newOrientation = currentUnitState.orientation;
      const speedFactor = 0.05; // 移動速度係数 (小さいほど遅い)

      const dx = targetPos.x - currentPos.x;
      const dy = targetPos.y - currentPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 0.1) { // 到着判定
        newX = targetPos.x;
        newY = targetPos.y;
        setTargetMovePosition(null); // 移動完了
        updateUnitOnMap(selectedUnitInstanceId, { position: { x: newX, y: newY }, orientation: newOrientation });
        console.log(`Unit ${selectedUnitInstanceId} arrived at (${newX.toFixed(1)}, ${newY.toFixed(1)})`);
        return;
      }

      // 移動方向への単位ベクトル
      const moveX = dx / distance;
      const moveY = dy / distance;

      newX += moveX * speedFactor;
      newY += moveY * speedFactor;

      // 向きの計算 (0-5のヘックス方向)
      if (distance > 0.01) {
          const angleRad = Math.atan2(dy, dx);
          let angleDeg = angleRad * (180 / Math.PI) + 90; // +90度でY軸上向きを0度基準に調整
          if (angleDeg < 0) angleDeg += 360;
          if (angleDeg >= 360) angleDeg -= 360;
          // 60度ごとのセクターに丸める (0が上、1が右上...)
          newOrientation = Math.floor(angleDeg / 60 + 0.5) % 6;
      }

      updateUnitOnMap(selectedUnitInstanceId, {
        position: { x: parseFloat(newX.toFixed(2)), y: parseFloat(newY.toFixed(2)) },
        orientation: newOrientation
      });

      animationFrameId = requestAnimationFrame(move); // 次のフレームで再帰的にmoveを呼び出す
    };

    animationFrameId = requestAnimationFrame(move); // 移動開始

    return () => {
      cancelAnimationFrame(animationFrameId); // クリーンアップ
      // もし移動中に選択ユニットが変わったり、目標が変わったら、
      // ここで updateUnitOnMap を呼ばないようにするか、
      // setTargetMovePosition(null) を呼んで移動を止める。
    };
  }, [selectedUnitInstanceId, targetMovePosition, allUnitsOnMap, updateUnitOnMap]);


  const handleMapRightClick = useCallback((logicalX: number, logicalY: number) => {
    if (selectedUnitInstanceId) {
      console.log(`Move command for unit ${selectedUnitInstanceId} to (${logicalX}, ${logicalY})`);
      setTargetMovePosition({ x: logicalX, y: logicalY });
    }
  }, [selectedUnitInstanceId]);

  const handleHexClickInGame = useCallback((q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit, event?: React.MouseEvent<SVGGElement>) => {
    if (event) {
        event.preventDefault(); // イベントのデフォルト動作を抑制
        if (event.button === 2 || event.type === 'contextmenu') { // 右クリックまたはコンテキストメニューイベント
            handleMapRightClick(logicalX, logicalY);
            return;
        }
    }

    // 左クリックの処理
    if (unitOnHex) {
      setSelectedUnitInstanceId(unitOnHex.instanceId);
      setDetailedSelectedUnitInfo(unitOnHex);
    } else {
      setSelectedUnitInstanceId(null);
      setDetailedSelectedUnitInfo(null);
    }
  }, [handleMapRightClick]);


  useEffect(() => {
    // allUnitsOnMapが更新されたら、選択中ユニットの詳細情報も更新する
    if (selectedUnitInstanceId) {
        const updatedSelectedUnit = allUnitsOnMap.find(u => u.instanceId === selectedUnitInstanceId);
        if (updatedSelectedUnit) {
            setDetailedSelectedUnitInfo(updatedSelectedUnit);
        } else {
            // 選択されていたユニットがマップから消えた場合など
            setSelectedUnitInstanceId(null);
            setDetailedSelectedUnitInfo(null);
        }
    }
  }, [allUnitsOnMap, selectedUnitInstanceId]);


  const handlePause = () => {
    alert("Game Paused (Pause Menu to be implemented)");
  };

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
        <aside className="w-72 bg-gray-800 bg-opacity-80 p-4 space-y-3 overflow-y-auto shadow-md"> {/* 幅を少し広げた */}
          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-3">Unit Information</h2>
          {detailedSelectedUnitInfo && UNITS_MAP.has(detailedSelectedUnitInfo.unitId) ? (
            (() => {
              const unitDef = UNITS_MAP.get(detailedSelectedUnitInfo.unitId)!;
              return (
                <div className="text-sm space-y-1.5"> {/* space-yを調整 */}
                  <div className="flex items-center mb-1">
                    <span className="text-2xl mr-2">{unitDef.icon}</span>
                    <span className="font-semibold text-lg">{unitDef.name}</span>
                  </div>
                  <p>Instance ID: <span className="text-gray-400 text-xs">{detailedSelectedUnitInfo.instanceId}</span></p>
                  <p>Owner: <span className={detailedSelectedUnitInfo.owner === 'player' ? 'text-blue-400' : 'text-red-400'}>{detailedSelectedUnitInfo.owner}</span></p>
                  <p>HP: {detailedSelectedUnitInfo.currentHp} / {unitDef.stats.hp}</p>
                  {unitDef.stats.hp > 0 && detailedSelectedUnitInfo.currentHp !== undefined && (
                    <div className="w-full bg-gray-600 rounded h-3 my-1"> {/* 高さを調整 */}
                      <div
                        className={`h-full rounded ${ /* 色を調整 */
                          detailedSelectedUnitInfo.currentHp / unitDef.stats.hp > 0.66 ? 'bg-green-500' :
                          detailedSelectedUnitInfo.currentHp / unitDef.stats.hp > 0.33 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${Math.max(0, (detailedSelectedUnitInfo.currentHp / unitDef.stats.hp) * 100)}%` }}
                      ></div>
                    </div>
                  )}
                  <p>Armor: F:{unitDef.stats.armor.front} S:{unitDef.stats.armor.side} B:{unitDef.stats.armor.back} T:{unitDef.stats.armor.top}</p>
                  {unitDef.stats.heWeapon && <p>HE: {unitDef.stats.heWeapon.power}P / {unitDef.stats.heWeapon.range}R / {unitDef.stats.heWeapon.dps}DPS</p>}
                  {unitDef.stats.apWeapon && <p>AP: {unitDef.stats.apWeapon.power}P / {unitDef.stats.apWeapon.range}R / {unitDef.stats.apWeapon.dps}DPS</p>}
                  <p>Move: {unitDef.stats.moveSpeed} hex/s</p>
                  <p>Orientation: {detailedSelectedUnitInfo.orientation} (0-5)</p> {/* 向き表示 */}
                  <p>Sight: x{unitDef.stats.sightMultiplier} / {unitDef.stats.baseDetectionRange} hex</p>
                  {unitDef.stats.turnSpeed !== undefined && <p>Turn: {unitDef.stats.turnSpeed}°/s</p>}
                </div>
              );
            })()
          ) : (
            <p className="text-gray-400 text-sm">No unit selected.</p>
          )}

          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 pt-4 mb-3">Production Queue</h2>
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
          <div className="absolute bottom-4 right-4 w-56 h-40 bg-gray-800 bg-opacity-80 border-2 border-gray-600 rounded shadow-xl p-2"> {/* サイズと色調整 */}
            <p className="text-xs text-center text-gray-300 mb-1">Mini-map</p>
            {/* ミニマップの内容はここに */}
          </div>
        </section>
      </main>

      <footer className="h-10 bg-black bg-opacity-30 px-3 py-2 text-xs text-gray-400 border-t border-gray-700 flex items-center"> {/* flex items-center追加 */}
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