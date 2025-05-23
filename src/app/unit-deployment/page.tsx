// src/app/unit-deployment/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { useGameSettingsStore } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit'; // UnitDataの型をインポート
import DeploymentHexGrid from '@/components/game/DeploymentHexGrid'; // ヘックスグリッドコンポーネント
import { MOCK_MAPS, type MapData } from '@/types/map'; // マップデータと型

// DeployedUnit 型定義 (他のファイルに移動した場合はインポートに変更)
export interface DeployedUnit {
  unitId: string;
  name: string;
  cost: number;
  position: { x: number; y: number }; // 論理座標 (ヘックスグリッド用)
}

// 仮のユニットリストデータ (実際にはユニット定義ファイルなどから取得)
const MOCK_UNITS: UnitData[] = [
  { id: 'rifle_infantry', name: 'ライフル歩兵', cost: 25, icon: '👤' },
  { id: 'light_infantry', name: '軽歩兵', cost: 40, icon: '🏃' },
  { id: 'support_infantry', name: 'サポート歩兵', cost: 40, icon: '🛠️' },
  { id: 'anti_tank_infantry', name: '対戦車歩兵', cost: 40, icon: '💥' },
  { id: 'special_forces', name: '特殊部隊', cost: 100, icon: '🥷' },
  { id: 'recon_infantry', name: '偵察歩兵', cost: 40, icon: '👀' },
  { id: 'main_battle_tank', name: '主力戦車', cost: 200, icon: ' M ' },
  { id: 'ifv', name: '歩兵戦闘車', cost: 80, icon: ' I ' },
  { id: 'sp_artillery', name: '自走砲', cost: 150, icon: ' A ' },
  { id: 'commander', name: '司令官ユニット', cost: 300, icon: ' C ', isCommander: true },
];


function UnitDeploymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapIdParam = searchParams.get('mapId');
  const mode = searchParams.get('mode');

  const maxCost = useGameSettingsStore(state => state.initialCost);
  // const playerFaction = useGameSettingsStore(state => state.playerFaction); // 必要なら使用

  const [currentMapData, setCurrentMapData] = useState<MapData | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitData | null>(null);
  const [deployedUnits, setDeployedUnits] = useState<DeployedUnit[]>([]);
  const [currentCost, setCurrentCost] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes for deployment
  const [commanderDeployed, setCommanderDeployed] = useState(false);

  useEffect(() => {
    if (mapIdParam && MOCK_MAPS[mapIdParam]) {
      setCurrentMapData(MOCK_MAPS[mapIdParam]);
    } else {
      console.warn(`Map with id "${mapIdParam}" not found. Defaulting or error handling needed.`);
      // 例: router.push('/map-selection?error=map_not_found');
      // またはデフォルトマップを設定: setCurrentMapData(MOCK_MAPS.map1);
    }
  }, [mapIdParam]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prevTime => prevTime - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    const totalCost = deployedUnits.reduce((sum, unit) => sum + unit.cost, 0);
    setCurrentCost(totalCost);
    setCommanderDeployed(deployedUnits.some(unit => unit.unitId === 'commander'));
  }, [deployedUnits]);

  const handleUnitSelect = (unit: UnitData) => {
    setSelectedUnit(unit);
    console.log(`Selected: ${unit.name}`);
  };

  const handleHexPlacement = (q: number, r: number, logicalX: number, logicalY: number) => {
    if (!currentMapData) return;

    const { deploymentArea } = currentMapData;
    const isDeployableTile = (
      logicalX >= deploymentArea.startX && logicalX <= deploymentArea.endX &&
      logicalY >= deploymentArea.startY && logicalY <= deploymentArea.endY
    );

    if (!isDeployableTile) {
      alert("このヘックスには配置できません。");
      return;
    }

    if (selectedUnit) {
      if (currentCost + selectedUnit.cost > maxCost) {
        alert("コスト上限を超えています！");
        return;
      }
      if (selectedUnit.isCommander && commanderDeployed) {
        alert("司令官ユニットは既に配置されています。");
        return;
      }
      if (deployedUnits.some(u => u.position.x === logicalX && u.position.y === logicalY)) {
        alert("このヘックスには既にユニットが配置されています。");
        return;
      }

      const newDeployedUnit: DeployedUnit = {
        unitId: selectedUnit.id,
        name: selectedUnit.name,
        cost: selectedUnit.cost,
        position: { x: logicalX, y: logicalY },
      };
      setDeployedUnits(prev => [...prev, newDeployedUnit]);
      setSelectedUnit(null);
    }
  };

  const handleRemoveUnit = (index: number) => {
    setDeployedUnits(prev => prev.filter((_, i) => i !== index));
  };

  const handleReady = () => {
    if (!commanderDeployed) {
      alert("司令官ユニットを配置してください！");
      return;
    }
    console.log("Ready! Deploying units:", deployedUnits);
    router.push(`/loading?mapId=${mapIdParam}&mode=${mode}`);
  };

  const isCommanderMandatoryAndNotDeployed = MOCK_UNITS.find(u => u.isCommander) && !commanderDeployed;

  return (
    <div className="flex flex-col h-screen bg-gray-800 text-white">
      <header className="p-4 bg-gray-900 shadow-md flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Unit Deployment - Map: {currentMapData?.name || mapIdParam || 'N/A'}</h1>
        <div className="text-lg">
          Time Left: <span className="font-bold">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
        </div>
        <div>
          <Button href={`/map-selection?mode=${mode || 'ai'}`} variant="secondary" size="sm" className="mr-2">
            Back to Map Select
          </Button>
          <Button
            onClick={handleReady}
            variant="primary"
            size="sm"
            disabled={isCommanderMandatoryAndNotDeployed || currentCost > maxCost || timeLeft <= 0}
          >
            Ready
          </Button>
        </div>
      </header>

      <main className="flex-grow flex p-4 space-x-4 overflow-hidden">
        <aside className="w-1/4 bg-gray-700 p-4 rounded-lg shadow-lg overflow-y-auto">
          <h2 className="text-xl font-semibold mb-3 border-b pb-2 border-gray-600">Available Units</h2>
          <div className="space-y-2">
            {MOCK_UNITS.map(unit => (
              <div
                key={unit.id}
                onClick={() => handleUnitSelect(unit)}
                className={`p-3 rounded-md cursor-pointer transition-all
                            ${selectedUnit?.id === unit.id ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-600 hover:bg-gray-500'}
                            ${( (currentCost + unit.cost > maxCost && (!unit.isCommander || commanderDeployed)) || // コストオーバー (司令官配置済みなら司令官も対象)
                               (unit.isCommander && commanderDeployed)                                          // 司令官は1体まで
                             ) ? 'opacity-50 cursor-not-allowed' : ''}`}
                // 司令官未配置で、選択ユニットが司令官でない場合、かつ司令官配置コストを考慮してもコストオーバーする場合も無効化するロジックも考慮可
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{unit.icon} {unit.name}</span>
                  <span className="text-sm text-yellow-400">{unit.cost} C</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex-grow bg-gray-900 rounded-lg shadow-lg flex items-center justify-center relative p-1">
          <DeploymentHexGrid
            mapData={currentMapData}
            onHexClick={handleHexPlacement}
            deployedUnits={deployedUnits}
            selectedUnitIcon={selectedUnit?.icon}
            hexSize={26} // この値はマップの表示に合わせて調整してください
          />
        </section>

        <aside className="w-1/4 bg-gray-700 p-4 rounded-lg shadow-lg flex flex-col">
          <h2 className="text-xl font-semibold mb-3 border-b pb-2 border-gray-600">Deployment Status</h2>
          <div className="mb-4">
            <p className="text-lg">
              Cost: <span className={`font-bold ${currentCost > maxCost ? 'text-red-500' : 'text-green-400'}`}>{currentCost}</span> / {maxCost}
            </p>
            {currentCost > maxCost && <p className="text-sm text-red-400">Cost limit exceeded!</p>}
            {isCommanderMandatoryAndNotDeployed && <p className="text-sm text-yellow-400">Commander unit must be deployed!</p>}
          </div>
          <h3 className="text-lg font-semibold mb-2">Deployed Units:</h3>
          <div className="flex-grow space-y-1 overflow-y-auto pr-1">
            {deployedUnits.length === 0 && <p className="text-gray-400 text-sm">No units deployed yet.</p>}
            {deployedUnits.map((unit, index) => (
              <div key={index} className="flex justify-between items-center bg-gray-600 p-2 rounded">
                <span className="text-sm">{unit.name} ({unit.cost}C) at ({unit.position.x},{unit.position.y})</span>
                <button
                  onClick={() => handleRemoveUnit(index)}
                  className="text-xs bg-red-600 hover:bg-red-700 px-1.5 py-0.5 rounded"
                >
                  X
                </button>
              </div>
            ))}
          </div>
          <div className="mt-auto pt-4 border-t border-gray-600">
            <Button variant="danger" size="sm" className="w-full" onClick={() => setDeployedUnits([])}>
              Clear All Deployments
            </Button>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default function UnitDeploymentScreen() {
  return (
    <Suspense fallback={<div>Loading deployment screen...</div>}>
      <UnitDeploymentContent />
    </Suspense>
  );
}