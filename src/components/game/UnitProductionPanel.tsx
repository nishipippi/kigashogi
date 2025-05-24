import React from 'react';
import Button from '@/components/ui/Button';
import { useGameSettingsStore, type PlacedUnit } from '@/stores/gameSettingsStore';
import { ALL_UNITS, UNITS_MAP } from '@/gameData/units';

interface UnitProductionPanelProps {
  detailedSelectedUnitInfo: PlacedUnit | null;
  onStartProductionRequest: (producerCommanderId: string, unitToProduceId: string) => void;
}

const UnitProductionPanel: React.FC<UnitProductionPanelProps> = ({ detailedSelectedUnitInfo, onStartProductionRequest }) => {
  const playerResources = useGameSettingsStore(state => state.playerResources);
  const gameOverMessage = useGameSettingsStore(state => state.gameOverMessage);

  if (!detailedSelectedUnitInfo || !UNITS_MAP.get(detailedSelectedUnitInfo.unitId)?.isCommander || detailedSelectedUnitInfo.owner !== 'player') {
    return null;
  }

  return (
    <>
      <h2 className="text-lg font-semibold border-b border-gray-700 pb-2 pt-4">Unit Production</h2>
      {detailedSelectedUnitInfo.productionQueue && detailedSelectedUnitInfo.productionQueue.length > 0 && (
        <div className="text-sm p-2 bg-gray-700 rounded mb-4">
          <p className="font-semibold mb-1">Production Queue:</p>
          {detailedSelectedUnitInfo.productionQueue.map((item, idx) => (
            <div key={idx} className={`mb-2 ${idx === 0 ? 'border-b border-gray-600 pb-2' : ''}`}>
              <p>
                {idx === 0 ? 'Producing:' : 'Queued:'} {UNITS_MAP.get(item.unitIdToProduce)?.name}
                <span className="ml-2 text-xs text-gray-400">({UNITS_MAP.get(item.unitIdToProduce)?.cost}C)</span>
              </p>
              {idx === 0 && (
                <>
                  <p>Time Left: {(item.timeLeftMs / 1000).toFixed(1)}s</p>
                  <div className="w-full bg-gray-600 rounded-full h-2.5 my-1">
                    <div
                      className="bg-blue-500 h-2.5 rounded-full"
                      style={{ width: `${100 - (item.timeLeftMs / item.originalProductionTimeMs) * 100}%` }}
                    ></div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2 text-sm">
        {ALL_UNITS.filter(u => !u.isCommander && u.id !== 'special_forces').map(unitToProduce => (
          <div key={unitToProduce.id} className="p-2 bg-gray-700 hover:bg-gray-600 rounded flex justify-between items-center">
            <div>
              <span>{unitToProduce.icon} {unitToProduce.name}</span>
              <span className="ml-2 text-xs text-yellow-400">({unitToProduce.cost}C)</span>
              <span className="ml-2 text-xs text-gray-400">[{unitToProduce.productionTime}s]</span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => detailedSelectedUnitInfo && onStartProductionRequest(detailedSelectedUnitInfo.instanceId, unitToProduce.id)}
              disabled={playerResources < unitToProduce.cost || !!gameOverMessage}
            >
              Build
            </Button>
          </div>
        ))}
      </div>
    </>
  );
};

export default UnitProductionPanel;
