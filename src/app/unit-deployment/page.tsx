// src/app/unit-deployment/page.tsx
"use client";

import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { useGameSettingsStore } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import { ALL_UNITS, UNITS_MAP } from '@/gameData/units';
import DeploymentHexGrid from '@/components/game/DeploymentHexGrid';
import { ALL_MAPS_DATA } from '@/gameData/maps';
import type { MapData } from '@/types/map';

export interface InitialDeployedUnitConfig {
  unitId: string;
  name: string;
  cost: number;
  position: { x: number; y: number }; // 論理座標
}

function UnitDeploymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapIdParam = searchParams.get('mapId');
  const mode = searchParams.get('mode'); 

  const maxCost = useGameSettingsStore(state => state.initialCost);
  // setCurrentMapData を setMapDataInStore という名前で取得
  const { setInitialDeployment, setSelectedMapId, setCurrentMapData: setMapDataInStore } = useGameSettingsStore();

  const [currentMapData, setCurrentMapDataState] = useState<MapData | null>(null); // Renamed to avoid conflict with store action
  const [selectedUnit, setSelectedUnit] = useState<UnitData | null>(null);
  const [deployedUnits, setDeployedUnits] = useState<InitialDeployedUnitConfig[]>([]);
  const [currentCost, setCurrentCost] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [commanderDeployed, setCommanderDeployed] = useState(false);

  useEffect(() => {
    if (mapIdParam && ALL_MAPS_DATA[mapIdParam]) {
      // Create a deep copy to avoid mutating the original ALL_MAPS_DATA
      const mapDataCopy = JSON.parse(JSON.stringify(ALL_MAPS_DATA[mapIdParam]));
      
      setCurrentMapDataState(mapDataCopy); // Set local state for UI rendering
      setSelectedMapId(mapIdParam);   // Set selected map ID in store
      setMapDataInStore(mapDataCopy); // <--- MODIFIED: Set the full map data in the store
    } else {
      console.warn(`Map with id "${mapIdParam}" not found. Using default or showing error.`);
      setCurrentMapDataState(null);
      setSelectedMapId(null);
      setMapDataInStore(null); // <--- MODIFIED: Also clear map data in store if map not found
    }
  }, [mapIdParam, setSelectedMapId, setMapDataInStore]); // Add setMapDataInStore to dependency array

  // useEffect for timer (unchanged)
  useEffect(() => {
    if (timeLeft <= 0 && commanderDeployed) { 
        handleReady();
        return;
    }
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prevTime => prevTime - 1);
    }, 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, commanderDeployed]); 

  // useEffect for currentCost and commanderDeployed (unchanged)
  useEffect(() => {
    const totalCost = deployedUnits.reduce((sum, unit) => sum + unit.cost, 0);
    setCurrentCost(totalCost);
    const commanderUnitDef = ALL_UNITS.find(u => u.isCommander);
    if (commanderUnitDef) {
        setCommanderDeployed(deployedUnits.some(unit => unit.unitId === commanderUnitDef.id));
    } else {
        setCommanderDeployed(true); 
    }
  }, [deployedUnits]);

  const handleUnitSelect = (unit: UnitData) => {
    setSelectedUnit(unit);
  };

  const handleHexPlacement = (q: number, r: number, logicalX: number, logicalY: number) => {
    if (!currentMapData) return; // Use local currentMapData for checks here

    const isDeployableTile = currentMapData.deploymentAreas.player.some(
        coord => coord.x === logicalX && coord.y === logicalY
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

      const newDeployedUnit: InitialDeployedUnitConfig = {
        unitId: selectedUnit.id,
        name: selectedUnit.name,
        cost: selectedUnit.cost,
        position: { x: logicalX, y: logicalY },
      };
      setDeployedUnits(prev => [...prev, newDeployedUnit]);
      setSelectedUnit(null); 
    } else {
        const unitOnHex = deployedUnits.find(u => u.position.x === logicalX && u.position.y === logicalY);
        if (unitOnHex) {
            console.log("Clicked on deployed unit:", unitOnHex);
        }
    }
  };

  const handleRemoveUnit = (unitToRemove: InitialDeployedUnitConfig) => {
    setDeployedUnits(prev => prev.filter(unit => unit !== unitToRemove));
  };

  const handleReady = () => {
    const commanderUnitDef = ALL_UNITS.find(u => u.isCommander);
    if (commanderUnitDef && !commanderDeployed) {
      alert("司令官ユニットを配置してください！");
      return;
    }
    if (currentCost > maxCost) {
        alert("コスト上限を超えています！配置を見直してください。");
        return;
    }
    
    // setInitialDeployment is called here. By this point, setMapDataInStore 
    // in the useEffect should have populated currentMapDataState in the store.
    setInitialDeployment(deployedUnits, UNITS_MAP); 
    console.log("Ready! Saving deployment config to store:", deployedUnits);
    router.push(`/loading?mapId=${mapIdParam}&mode=${mode || 'ai'}`);
  };

  const commanderMandatoryAndNotDeployedLogic = () => {
    const commanderUnitDef = ALL_UNITS.find(u => u.isCommander);
    return commanderUnitDef ? !commanderDeployed : false;
  };
  const commanderMandatoryNotDeployed = commanderMandatoryAndNotDeployedLogic();


  return (
    <div className="flex flex-col h-screen bg-gray-800 text-white">
      <header className="p-4 bg-gray-900 shadow-md flex justify-between items-center">
        {/* Header content (unchanged) */}
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
            disabled={commanderMandatoryNotDeployed || currentCost > maxCost || (timeLeft <= 0 && !commanderDeployed)}
          >
            Ready
          </Button>
        </div>
      </header>

      <main className="flex-grow flex p-4 space-x-4 overflow-hidden">
        <aside className="w-1/4 bg-gray-700 p-4 rounded-lg shadow-lg overflow-y-auto">
          {/* Available Units (unchanged) */}
          <h2 className="text-xl font-semibold mb-3 border-b pb-2 border-gray-600">Available Units</h2>
          <div className="space-y-2">
            {ALL_UNITS.map(unit => {
              const isCurrentlySelected = selectedUnit?.id === unit.id;
              const canAfford = currentCost + unit.cost <= maxCost || isCurrentlySelected; 
              const commanderRuleOK = !(unit.isCommander && commanderDeployed && !isCurrentlySelected);
              const isSelectable = canAfford && commanderRuleOK;

              return (
                <div
                  key={unit.id}
                  onClick={() => {
                      if (isSelectable) {
                          handleUnitSelect(unit);
                      } else if (unit.isCommander && commanderDeployed && !isCurrentlySelected){
                          alert("Commander is already deployed.");
                      } else if (!canAfford && !isCurrentlySelected){
                          alert("Cannot afford this unit.");
                      }
                  }}
                  className={`p-3 rounded-md transition-all
                              ${isCurrentlySelected ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-600 hover:bg-gray-500'}
                              ${!isSelectable && !isCurrentlySelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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
          {/* DeploymentHexGrid (unchanged, uses local currentMapData) */}
          {currentMapData ? (
            <DeploymentHexGrid
              mapData={currentMapData}
              onHexClick={handleHexPlacement}
              deployedUnits={deployedUnits}
              selectedUnitIcon={selectedUnit?.icon}
              hexSize={26} 
            />
          ) : (
            <div className="text-gray-400">Select a map first.</div>
          )}
        </section>

        <aside className="w-1/4 bg-gray-700 p-4 rounded-lg shadow-lg flex flex-col">
          {/* Deployment Status (unchanged) */}
          <h2 className="text-xl font-semibold mb-3 border-b pb-2 border-gray-600">Deployment Status</h2>
          <div className="mb-4">
            <p className="text-lg">
              Cost: <span className={`font-bold ${currentCost > maxCost ? 'text-red-500' : 'text-green-400'}`}>{currentCost}</span> / {maxCost}
            </p>
            {currentCost > maxCost && <p className="text-sm text-red-400">Cost limit exceeded!</p>}
            {commanderMandatoryNotDeployed && <p className="text-sm text-yellow-400">Commander unit must be deployed!</p>}
          </div>
          <h3 className="text-lg font-semibold mb-2">Deployed Units: ({deployedUnits.length})</h3>
          <div className="flex-grow space-y-1 overflow-y-auto pr-1">
            {deployedUnits.length === 0 && <p className="text-gray-400 text-sm">No units deployed yet.</p>}
            {deployedUnits.map((unit, index) => ( 
              <div key={`${unit.unitId}-${unit.position.x}-${unit.position.y}-${index}`} className="flex justify-between items-center bg-gray-600 p-2 rounded">
                <span className="text-sm">{UNITS_MAP.get(unit.unitId)?.icon} {unit.name} ({unit.cost}C) at ({unit.position.x},{unit.position.y})</span>
                <button
                  onClick={() => handleRemoveUnit(unit)} 
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
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-gray-900 text-white">Loading deployment screen...</div>}>
      <UnitDeploymentContent />
    </Suspense>
  );
}