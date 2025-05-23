// src/app/unit-deployment/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { useGameSettingsStore, type PlacedUnit } from '@/stores/gameSettingsStore'; // PlacedUnit 型もインポート
import type { UnitData } from '@/types/unit';
import { ALL_UNITS, UNITS_MAP } from '@/gameData/units'; // ALL_UNITS と UNITS_MAP をインポート
import DeploymentHexGrid from '@/components/game/DeploymentHexGrid';
import { ALL_MAPS_DATA } from '@/gameData/maps'; // ALL_MAPS_DATA はここから
import type { MapData } from '@/types/map';      // MapData 型はここから

// DeployedUnit 型 (初期配置画面内でのユニット情報)
export interface DeployedUnit {
  unitId: string; // ユニット種別のID
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
  const [deployedUnits, setDeployedUnits] = useState<DeployedUnit[]>([]);
  const [currentCost, setCurrentCost] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [commanderDeployed, setCommanderDeployed] = useState(false);

  useEffect(() => {
    if (mapIdParam && ALL_MAPS_DATA[mapIdParam]) {
      setCurrentMapData(ALL_MAPS_DATA[mapIdParam]);
    } else {
      console.warn(`Map with id "${mapIdParam}" not found.`);
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
    setCommanderDeployed(deployedUnits.some(unit => {
        const unitDef = UNITS_MAP.get(unit.unitId);
        return unitDef?.isCommander || false;
    }));
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
      // selectedUnit が司令官ユニットかどうかを UNITS_MAP から取得してチェック
      const selectedUnitDef = UNITS_MAP.get(selectedUnit.id);
      if (selectedUnitDef?.isCommander && commanderDeployed) {
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
    // 司令官ユニットが配置されているか再確認
    const isActualCommanderDeployed = deployedUnits.some(depUnit => {
        const unitDef = UNITS_MAP.get(depUnit.unitId);
        return unitDef?.isCommander || false;
    });

    if (!isActualCommanderDeployed) {
      alert("司令官ユニットを配置してください！");
      return;
    }

    // deployedUnits (DeployedUnit[]) を PlacedUnit[] に変換
    const finalDeployment: PlacedUnit[] = deployedUnits.map((depUnit, index) => {
      const unitDef = UNITS_MAP.get(depUnit.unitId);
      // ゲーム内で一意なインスタンスIDを生成 (例: unitType_index_random)
      // より堅牢なID生成方法も検討可能 (例: uuid)
      const instanceId = `${depUnit.unitId}_${index}_${Math.random().toString(16).slice(2, 7)}`;
      return {
        // ...depUnit, // DeployedUnitのプロパティを展開
        instanceId: instanceId, // ユニークなインスタンスID
        unitId: depUnit.unitId,
        name: depUnit.name, // nameはunitDefから取る方が正確かも
        cost: depUnit.cost, // costもunitDefから取る方が正確かも
        position: depUnit.position,
        currentHp: unitDef?.stats.hp || 0,
        owner: 'player',
        orientation: 0, // 初期向き (例: 北向き)
      };
    });

    setInitialDeployment(finalDeployment);

    console.log("Ready! Saving deployment to store:", finalDeployment);
    router.push(`/loading?mapId=${mapIdParam}&mode=${mode}`);
  };

  // isCommanderMandatoryAndNotDeployed の判定も UNITS_MAP を使う
  const isCommanderRequired = ALL_UNITS.some(u => u.isCommander);
  const isActualCommanderDeployedCheck = deployedUnits.some(depUnit => {
      const unitDef = UNITS_MAP.get(depUnit.unitId);
      return unitDef?.isCommander || false;
  });
  const canProceed = isCommanderRequired ? isActualCommanderDeployedCheck : true;


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
            disabled={!canProceed || currentCost > maxCost || timeLeft <= 0}
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
              const unitDef = UNITS_MAP.get(unit.id); // isCommanderチェックのために取得
              const isUnitDisabled =
                (currentCost + unit.cost > maxCost && (!unitDef?.isCommander || commanderDeployed)) ||
                (unitDef?.isCommander && commanderDeployed);

              return (
                <div
                  key={unit.id}
                  onClick={() => {
                    if (!isUnitDisabled) {
                      handleUnitSelect(unit);
                    }
                  }}
                  className={`p-3 rounded-md transition-all
                              ${selectedUnit?.id === unit.id ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-600 hover:bg-gray-500'}
                              ${isUnitDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  style={isUnitDisabled ? { pointerEvents: 'none' } : {}}
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
            {isCommanderRequired && !isActualCommanderDeployedCheck && <p className="text-sm text-yellow-400">Commander unit must be deployed!</p>}
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