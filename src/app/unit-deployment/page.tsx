// src/app/unit-deployment/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { useGameSettingsStore } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import { ALL_UNITS, UNITS_MAP } from '@/gameData/units'; // UNITS_MAP もインポート
import DeploymentHexGrid from '@/components/game/DeploymentHexGrid';
import { ALL_MAPS_DATA } from '@/gameData/maps'; // ALL_MAPS_DATA はここから
import type { MapData } from '@/types/map';      // MapData 型はここから

// 初期配置画面で扱うユニット設定の型
export interface InitialDeployedUnitConfig {
  unitId: string; // ユニット種別ID
  name: string;
  cost: number;
  position: { x: number; y: number }; // 論理座標 (ヘックスグリッドのlogicalX, logicalY)
}

function UnitDeploymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapIdParam = searchParams.get('mapId');
  const mode = searchParams.get('mode');

  const maxCost = useGameSettingsStore(state => state.initialCost);
  const { setInitialDeployment } = useGameSettingsStore(); // アクションを取得

  const [currentMapData, setCurrentMapData] = useState<MapData | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitData | null>(null);
  // deployedUnits の型を InitialDeployedUnitConfig[] に変更
  const [deployedUnits, setDeployedUnits] = useState<InitialDeployedUnitConfig[]>([]);
  const [currentCost, setCurrentCost] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120); // 仮の制限時間: 2分
  const [commanderDeployed, setCommanderDeployed] = useState(false);

  useEffect(() => {
    if (mapIdParam && ALL_MAPS_DATA[mapIdParam]) {
      setCurrentMapData(ALL_MAPS_DATA[mapIdParam]);
    } else {
      console.warn(`Map with id "${mapIdParam}" not found. Using default or showing error.`);
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
    // ALL_UNITS を参照して司令官ユニットの ID を特定する方がより堅牢
    const commanderUnitDef = ALL_UNITS.find(u => u.isCommander);
    if (commanderUnitDef) {
        setCommanderDeployed(deployedUnits.some(unit => unit.unitId === commanderUnitDef.id));
    } else {
        setCommanderDeployed(false); // 司令官ユニットが定義されていなければ常にfalse
    }
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

      const newDeployedUnit: InitialDeployedUnitConfig = { // 型を InitialDeployedUnitConfig に
        unitId: selectedUnit.id,
        name: selectedUnit.name, // selectedUnit から取得
        cost: selectedUnit.cost, // selectedUnit から取得
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
    const commanderUnitDef = ALL_UNITS.find(u => u.isCommander);
    if (commanderUnitDef && !commanderDeployed) {
      alert("司令官ユニットを配置してください！");
      return;
    }
    // deployedUnits (InitialDeployedUnitConfig[]) と UNITS_MAP をストアに渡す
    setInitialDeployment(deployedUnits, UNITS_MAP);

    console.log("Ready! Saving deployment config to store:", deployedUnits);
    router.push(`/loading?mapId=${mapIdParam}&mode=${mode}`);
  };

  const isCommanderMandatoryAndNotDeployedLogic = () => {
    const commanderUnitDef = ALL_UNITS.find(u => u.isCommander);
    return commanderUnitDef ? !commanderDeployed : false; // 司令官定義がなければ必須ではない
  };
  const commanderMandatoryNotDeployed = isCommanderMandatoryAndNotDeployedLogic();


  return (
    <div className="flex flex-col h-screen bg-gray-800 text-white">
      <header className="p-4 bg-gray-900 shadow-md flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Unit Deployment - Map: {currentMapData?.name || mapIdParam || 'N/A'}</h1>
        <div className="text-lg">
          Time Left: <span className="font-bold">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
        </div>
        <div>
          <Button href={`/map-selection?mode=${mode}`} variant="secondary" size="sm" className="mr-2">
            Back to Map Select
          </Button>
          <Button
            onClick={handleReady}
            variant="primary"
            size="sm"
            disabled={commanderMandatoryNotDeployed || currentCost > maxCost || timeLeft <= 0}
          >
            Ready
          </Button>
        </div>
      </header>

      <main className="flex-grow flex p-4 space-x-4 overflow-hidden">
        <aside className="w-1/4 bg-gray-700 p-4 rounded-lg shadow-lg overflow-y-auto">
          <h2 className="text-xl font-semibold mb-3 border-b pb-2 border-gray-600">Available Units</h2>
          <div className="space-y-2">
            {ALL_UNITS.map(unit => {
              const isSelectable = !((currentCost + unit.cost > maxCost && (!unit.isCommander || commanderDeployed)) || (unit.isCommander && commanderDeployed));
              return (
                <div
                  key={unit.id}
                  onClick={() => {
                      if (isSelectable) {
                          handleUnitSelect(unit);
                      }
                  }}
                  className={`p-3 rounded-md transition-all
                              ${selectedUnit?.id === unit.id ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-600 hover:bg-gray-500'}
                              ${!isSelectable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  style={!isSelectable ? { pointerEvents: 'none' } : {}}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{unit.icon} {unit.name}</span>
                    <span className="text-sm text-yellow-400">{unit.cost} C</span>
                  </div>
                  <p className="text-xs text-gray-300 truncate mt-1">{unit.role || unit.description}</p>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="flex-grow bg-gray-900 rounded-lg shadow-lg flex items-center justify-center relative p-1">
          <DeploymentHexGrid
            mapData={currentMapData}
            onHexClick={handleHexPlacement}
            deployedUnits={deployedUnits}
            selectedUnitIcon={selectedUnit?.icon}
            hexSize={22}
          />
        </section>

        <aside className="w-1/4 bg-gray-700 p-4 rounded-lg shadow-lg flex flex-col">
          <h2 className="text-xl font-semibold mb-3 border-b pb-2 border-gray-600">Deployment Status</h2>
          <div className="mb-4">
            <p className="text-lg">
              Cost: <span className={`font-bold ${currentCost > maxCost ? 'text-red-500' : 'text-green-400'}`}>{currentCost}</span> / {maxCost}
            </p>
            {currentCost > maxCost && <p className="text-sm text-red-400">Cost limit exceeded!</p>}
            {commanderMandatoryNotDeployed && <p className="text-sm text-yellow-400">Commander unit must be deployed!</p>}
          </div>
          <h3 className="text-lg font-semibold mb-2">Deployed Units:</h3>
          <div className="flex-grow space-y-1 overflow-y-auto pr-1">
            {deployedUnits.length === 0 && <p className="text-gray-400 text-sm">No units deployed yet.</p>}
            {deployedUnits.map((unit, index) => (
              <div key={index} className="flex justify-between items-center bg-gray-600 p-2 rounded">
                {/* unit.name は InitialDeployedUnitConfig に含まれている */}
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