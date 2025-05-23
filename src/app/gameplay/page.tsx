// src/app/gameplay/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { useGameSettingsStore, type PlacedUnit } from '@/stores/gameSettingsStore'; // PlacedUnit をインポート
import type { UnitData } from '@/types/unit';
import GameplayHexGrid from '@/components/game/GameplayHexGrid'; // 新しいグリッドコンポーネント
import { ALL_MAPS_DATA } from '@/gameData/maps'; // ALL_MAPS_DATA はここから
import type { MapData } from '@/types/map';      // MapData 型はここから
import { UNITS_MAP } from '@/gameData/units';

// 選択ユニット表示のテスト用 MOCK_SELECTED_UNIT_DETAILS は直接使用しなくなりました。
// 代わりに detailedSelectedUnitInfo state を使用します。

function GameplayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapIdParam = searchParams.get('mapId');

  const storeInitialCost = useGameSettingsStore(state => state.initialCost);
  const initialDeploymentFromStore = useGameSettingsStore(state => state.initialDeployment);
  const selectedMapIdFromStore = useGameSettingsStore(state => state.selectedMapId);

  const [currentMapData, setCurrentMapData] = useState<MapData | null>(null);
  const [gameTime, setGameTime] = useState(0); // ゲーム内時間 (秒)
  const [resources, setResources] = useState(storeInitialCost); // 初期リソースはストアから
  const [victoryPoints, setVictoryPoints] = useState({ player: 0, enemy: 0 });

  // ゲーム内の全ユニットの状態を管理 (初期配置 + ゲーム中に生産/破壊されるユニット)
  const [allPlacedUnits, setAllPlacedUnits] = useState<PlacedUnit[]>([]);
  // 選択中のユニットのインスタンスID (ユニークID) - 将来的に PlacedUnit に instanceId を持たせる想定
  const [selectedUnitInstanceId, setSelectedUnitInstanceId] = useState<string | null>(null);
  // 選択中のユニットの詳細情報 (UI表示用)
  const [detailedSelectedUnitInfo, setDetailedSelectedUnitInfo] = useState<PlacedUnit | null>(null);

  const COST_REVENUE_INTERVAL = 10000; // 10秒 (10000 ms)
  const COST_REVENUE_AMOUNT = 50;    // 50コスト

  useEffect(() => {
    // マップデータのロード
    const mapIdToLoad = mapIdParam || selectedMapIdFromStore; // URLパラメータ優先
    if (mapIdToLoad && ALL_MAPS_DATA[mapIdToLoad]) {
      setCurrentMapData(ALL_MAPS_DATA[mapIdToLoad]);
    } else {
      console.warn(`Map with id "${mapIdToLoad}" not found.`);
      // フォールバックとして最初のマップなどを設定することも検討
      // const firstMapKey = Object.keys(ALL_MAPS_DATA)[0];
      // if (firstMapKey) setCurrentMapData(ALL_MAPS_DATA[firstMapKey]);
    }
  }, [mapIdParam, selectedMapIdFromStore]);

  useEffect(() => {
    setResources(storeInitialCost);
  }, [storeInitialCost]);

  useEffect(() => {
    // ストアから取得した初期配置をゲーム内ユニットリストにセット
    // initialDeploymentFromStore が変更されたとき（通常はページロード後1回）に実行
    if (initialDeploymentFromStore && initialDeploymentFromStore.length > 0) {
      setAllPlacedUnits(initialDeploymentFromStore);
    }
  }, [initialDeploymentFromStore]);

  useEffect(() => {
    const timer = setInterval(() => {
      setGameTime(prevTime => prevTime + 1);
    }, 1000);

    const revenueTimer = setInterval(() => {
      setResources(prevResources => prevResources + COST_REVENUE_AMOUNT);
    }, COST_REVENUE_INTERVAL);

    const vpTimer = setInterval(() => {
        setVictoryPoints(prevVP => ({
            player: prevVP.player + 1, // 仮で1点ずつ
            enemy: prevVP.enemy + 0
        }));
    }, 30000);

    // // 仮: ユニット選択のシミュレーション (MOCK_SELECTED_UNIT_DETAILS を使っていた部分の代替)
    // if (allPlacedUnits.length > 0 && !detailedSelectedUnitInfo) {
    //     const firstUnit = allPlacedUnits[0];
    //     // setSelectedUnitInstanceId(firstUnit.instanceId); // TODO: instanceId を使う
    //     setSelectedUnitInstanceId(firstUnit.unitId); // 仮
    //     setDetailedSelectedUnitInfo(firstUnit);
    // }


    return () => {
      clearInterval(timer);
      clearInterval(revenueTimer);
      clearInterval(vpTimer);
    };
  }, []); // 依存配列が空なので、マウント時に一度だけ実行される

  const handleHexClickInGame = (q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit) => {
    console.log(`Clicked hex: (${logicalX}, ${logicalY}), Unit:`, unitOnHex);
    if (unitOnHex) {
      // setSelectedUnitInstanceId(unitOnHex.instanceId); // TODO: PlacedUnitにinstanceIdを追加し、それを使用する
      setSelectedUnitInstanceId(unitOnHex.unitId + `_${unitOnHex.position.x}_${unitOnHex.position.y}`); // 仮のユニークIDとして使用
      setDetailedSelectedUnitInfo(unitOnHex);
    } else {
      // ユニットがいない場所をクリックしたら選択解除
      setSelectedUnitInstanceId(null);
      setDetailedSelectedUnitInfo(null);
    }
  };

  const handlePause = () => {
    // TODO: ポーズメニュー表示ロジック
    alert("Game Paused (Pause Menu to be implemented)");
  };

  const handleSurrender = () => {
    // TODO: 降参処理とリザルト画面へ遷移
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
            (Target: 100) {/* Targetはマップサイズ等で変動 */}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Button onClick={handlePause} variant="secondary" size="sm">Pause</Button>
          <Button onClick={handleSurrender} variant="danger" size="sm">Surrender</Button>
        </div>
      </header>

      <main className="flex-grow flex relative">
        <aside className="w-64 bg-gray-800 bg-opacity-80 p-3 space-y-3 overflow-y-auto shadow-md">
          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2">Unit Information</h2>
          {detailedSelectedUnitInfo && UNITS_MAP.has(detailedSelectedUnitInfo.unitId) ? (
            (() => { // 即時実行関数でスコープを作成
              const unitDef = UNITS_MAP.get(detailedSelectedUnitInfo.unitId)!; // !で non-null をアサート (型ガード済みのため)
              return (
                <div className="text-sm space-y-1">
                  <p><span className="font-medium">{unitDef.icon} {unitDef.name}</span></p>
                  <p>Owner: <span className={detailedSelectedUnitInfo.owner === 'player' ? 'text-blue-300' : 'text-red-300'}>{detailedSelectedUnitInfo.owner}</span></p>
                  <p>HP: {detailedSelectedUnitInfo.currentHp} / {unitDef.stats.hp}</p>
                  {unitDef.stats.hp > 0 && detailedSelectedUnitInfo.currentHp !== undefined && ( // HPが0より大きい場合のみバー表示
                    <div className="w-full bg-gray-600 rounded-full h-2.5 my-1">
                      <div
                        className={`h-2.5 rounded-full ${
                          detailedSelectedUnitInfo.currentHp / unitDef.stats.hp > 0.6 ? 'bg-green-500' :
                          detailedSelectedUnitInfo.currentHp / unitDef.stats.hp > 0.3 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${Math.max(0, (detailedSelectedUnitInfo.currentHp / unitDef.stats.hp) * 100)}%` }} // マイナスにならないように
                      ></div>
                    </div>
                  )}
                  <p>Armor: F:{unitDef.stats.armor.front} S:{unitDef.stats.armor.side} B:{unitDef.stats.armor.back} T:{unitDef.stats.armor.top}</p>
                  {unitDef.stats.heWeapon && <p>HE: {unitDef.stats.heWeapon.power}P / {unitDef.stats.heWeapon.range}R / {unitDef.stats.heWeapon.dps}DPS</p>}
                  {unitDef.stats.apWeapon && <p>AP: {unitDef.stats.apWeapon.power}P / {unitDef.stats.apWeapon.range}R / {unitDef.stats.apWeapon.dps}DPS</p>}
                  <p>Move: {unitDef.stats.moveSpeed} hex/s</p>
                  <p>Sight: x{unitDef.stats.sightMultiplier} / {unitDef.stats.baseDetectionRange} hex</p>
                  {unitDef.stats.turnSpeed !== undefined && <p>Turn: {unitDef.stats.turnSpeed}°/s</p>}
                  {/* 将来的にはユニットの現在の状態なども表示 */}
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
            placedUnits={allPlacedUnits}
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