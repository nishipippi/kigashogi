import React from 'react';
import { useGameSettingsStore, type PlacedUnit } from '@/stores/gameSettingsStore';
import { UNITS_MAP } from '@/gameData/units';

interface UnitInfoPanelProps {
  detailedSelectedUnitInfo: PlacedUnit | null;
}

const UnitInfoPanel: React.FC<UnitInfoPanelProps> = ({ detailedSelectedUnitInfo }) => {
  const allUnitsOnMap = useGameSettingsStore(state => state.allUnitsOnMap);

  return (
    <>
      <h2 className="text-lg font-semibold border-b border-gray-700 pb-2">Unit Information</h2>
      {detailedSelectedUnitInfo && UNITS_MAP.has(detailedSelectedUnitInfo.unitId) ? (
        (() => {
          const unitDef = UNITS_MAP.get(detailedSelectedUnitInfo.unitId)!;
          return (
            <div className="text-sm space-y-1">
              <p className="text-base"><span className="font-medium">{unitDef.icon} {unitDef.name}</span></p>
              <p>ID: <span className="text-xs text-gray-400">{detailedSelectedUnitInfo.instanceId.slice(-6)}</span></p>
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
              <p>Pos: ({detailedSelectedUnitInfo.position.x.toFixed(1)}, {detailedSelectedUnitInfo.position.y.toFixed(1)}) Orient: {detailedSelectedUnitInfo.orientation.toFixed(0)}°</p>
              {detailedSelectedUnitInfo.status && <p className="capitalize">Status: <span className="text-yellow-300">{detailedSelectedUnitInfo.status.replace(/_/g, ' ')}</span></p>}
              {detailedSelectedUnitInfo.isTurning && detailedSelectedUnitInfo.targetOrientation !== undefined && <p className="text-yellow-400">Turning to {detailedSelectedUnitInfo.targetOrientation.toFixed(0)}°</p>}
              {detailedSelectedUnitInfo.isMoving && detailedSelectedUnitInfo.moveTargetPosition && <p className="text-green-400">Moving to ({detailedSelectedUnitInfo.moveTargetPosition.x.toFixed(1)},{detailedSelectedUnitInfo.moveTargetPosition.y.toFixed(1)})</p>}
              {detailedSelectedUnitInfo.attackTargetInstanceId &&
                (() => {
                    const target = allUnitsOnMap.find(u=>u.instanceId === detailedSelectedUnitInfo.attackTargetInstanceId);
                    return <p className="text-red-400">Targeting: {target?.name || 'Unknown'} ({target?.instanceId.slice(-4)})</p>;
                })()
              }
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
    </>
  );
};

export default UnitInfoPanel;
