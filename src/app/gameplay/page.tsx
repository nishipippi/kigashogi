// src/app/gameplay/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { useGameSettingsStore } from '@/stores/gameSettingsStore'; // ゲーム設定を参照する可能性
import type { UnitData } from '@/types/unit'; // ユニット情報を表示する可能性

// 仮の選択中ユニット情報
const MOCK_SELECTED_UNIT_DETAILS: Partial<UnitData> & { currentHp?: number } = {
    id: 'rifle_infantry_1',
    name: 'ライフル歩兵 Alpha',
    icon: '👤',
    cost: 25,
    currentHp: 8, // 現在のHP
    stats: { // KigaShog基礎要件定義.txt より一部抜粋
        hp: 10,
        armor: { front: 0, side: 0, back: 0, top: 0 },
        moveSpeed: 1.0,
        hePower: 3, heRange: 3, heAttackInterval: 2.0, heDps: 1.5,
        apPower: 6, apRange: 1, apAttackInterval: 3.0, apDps: 2,
        sightMultiplier: 1.0,
        baseDetectionRange: 3,
    }
};


function GameplayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapId = searchParams.get('mapId');

  const initialCost = useGameSettingsStore(state => state.initialCost);
  const playerFaction = useGameSettingsStore(state => state.playerFaction);

  const [gameTime, setGameTime] = useState(0); // ゲーム内時間 (秒)
  const [resources, setResources] = useState(initialCost);
  const [victoryPoints, setVictoryPoints] = useState({ player: 0, enemy: 0 });
  const [selectedUnitInfo, setSelectedUnitInfo] = useState<Partial<UnitData> & { currentHp?: number } | null>(null);

  // 継続的なコスト収入のタイマー設定 (KigaShog基礎要件定義.txtより)
  const COST_REVENUE_INTERVAL = 10000; // 10秒 (10000 ms)
  const COST_REVENUE_AMOUNT = 50;    // 50コスト

  useEffect(() => {
    // ゲーム内時間のタイマー
    const timer = setInterval(() => {
      setGameTime(prevTime => prevTime + 1);
    }, 1000);

    // 継続的なコスト収入タイマー
    const revenueTimer = setInterval(() => {
      setResources(prevResources => prevResources + COST_REVENUE_AMOUNT);
    }, COST_REVENUE_INTERVAL);


    // 仮: 30秒ごとに勝利ポイント加算 (KigaShogi要件定義補足資料.txtより)
    const vpTimer = setInterval(() => {
        setVictoryPoints(prevVP => ({
            player: prevVP.player + 1, // 仮で1点ずつ
            enemy: prevVP.enemy + 0
        }));
    }, 30000);


    // 仮: ユニット選択のシミュレーション
    setTimeout(() => {
        setSelectedUnitInfo(MOCK_SELECTED_UNIT_DETAILS);
    }, 5000);


    return () => {
      clearInterval(timer);
      clearInterval(revenueTimer);
      clearInterval(vpTimer);
    };
  }, []);

  const handlePause = () => {
    // TODO: ポーズメニュー表示ロジック
    alert("Game Paused (Pause Menu to be implemented)");
  };

  const handleSurrender = () => {
    // TODO: 降参処理とリザルト画面へ遷移
    alert("Surrendered (Results screen to be implemented)");
    router.push(`/results?status=surrender&mapId=${mapId}`);
  };


  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      {/* Top Bar: Game Info & Controls */}
      <header className="h-16 bg-black bg-opacity-50 p-3 flex justify-between items-center shadow-lg z-10">
        <div className="flex items-center space-x-6">
          <div>KigaShogi</div>
          <div>Map: <span className="font-semibold">{mapId || 'N/A'}</span></div>
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

      {/* Main Area: Map and Side Panels */}
      <main className="flex-grow flex relative"> {/* relative for minimap positioning */}
        {/* Left Panel: Selected Unit Info / Production (Placeholder) */}
        <aside className="w-64 bg-gray-800 bg-opacity-80 p-3 space-y-3 overflow-y-auto shadow-md">
          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2">Unit Information</h2>
          {selectedUnitInfo ? (
            <div className="text-sm space-y-1">
              <p><span className="font-medium">{selectedUnitInfo.icon} {selectedUnitInfo.name}</span></p>
              <p>HP: {selectedUnitInfo.currentHp || 'N/A'} / {selectedUnitInfo.stats?.hp || 'N/A'}</p>
              {/* HPバー (簡易) */}
              {selectedUnitInfo.stats?.hp && selectedUnitInfo.currentHp !== undefined &&
                <div className="w-full bg-gray-600 rounded-full h-2.5 my-1">
                  <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${(selectedUnitInfo.currentHp / selectedUnitInfo.stats.hp) * 100}%` }}></div>
                </div>
              }
              <p>Cost: {selectedUnitInfo.cost || 'N/A'}C</p>
              <p>Move: {selectedUnitInfo.stats?.moveSpeed || 'N/A'} hex/s</p>
              <p>Armor: F:{selectedUnitInfo.stats?.armor.front} S:{selectedUnitInfo.stats?.armor.side} B:{selectedUnitInfo.stats?.armor.back} T:{selectedUnitInfo.stats?.armor.top}</p>
              {selectedUnitInfo.stats?.hePower && <p>HE: {selectedUnitInfo.stats.hePower}P / {selectedUnitInfo.stats.heRange}R / {selectedUnitInfo.stats.heDps}DPS</p>}
              {selectedUnitInfo.stats?.apPower && <p>AP: {selectedUnitInfo.stats.apPower}P / {selectedUnitInfo.stats.apRange}R / {selectedUnitInfo.stats.apDps}DPS</p>}
              {/* ... 他のユニット情報 ... */}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No unit selected.</p>
          )}

          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 pt-4">Production Queue</h2>
          <div className="text-gray-400 text-sm">
            <p>(Commander Unit Production UI here)</p>
            <p>Queue: Empty</p>
          </div>
        </aside>

        {/* Center: Main Game Map (Placeholder) */}
        <section className="flex-grow bg-green-700 flex items-center justify-center relative"> {/* Map background color */}
          <p className="text-4xl text-green-200 opacity-50">Main Game Map Area</p>
          {/* Actual game rendering will happen here (e.g., Canvas, SVG, or DOM elements) */}

          {/* Mini-map Placeholder (Positioned absolutely) */}
          <div className="absolute bottom-4 right-4 w-48 h-36 bg-green-800 border-2 border-gray-600 rounded shadow-xl p-1">
            <p className="text-xs text-center text-green-300">Mini-map</p>
            {/* Mini-map content */}
          </div>
        </section>

        {/* Right Panel: Command Panel (Placeholder) */}
        {/* <aside className="w-48 bg-gray-800 bg-opacity-80 p-3 space-y-2 overflow-y-auto shadow-md">
          <h2 className="text-lg font-semibold border-b border-gray-700 pb-2">Commands</h2>
          <Button variant="ghost" size="sm" className="w-full text-left">Move</Button>
          <Button variant="ghost" size="sm" className="w-full text-left">Attack</Button>
          <Button variant="ghost" size="sm" className="w-full text-left">Stop</Button>
          <Button variant="ghost" size="sm" className="w-full text-left">Hold Position</Button>
          {/* ... 他のコマンド ... */}
        {/* </aside> */}
      </main>

      {/* Bottom Bar: Event Notifications / Chat (Placeholder) */}
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