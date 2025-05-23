// src/lib/aiUtils.ts
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import type { MapData, StrategicPoint } from '@/types/map';
import { UNITS_MAP, ALL_UNITS } from '@/gameData/units';
import { hexDistance, logicalToAxial, axialToLogical, findPathAStar } from '@/lib/hexUtils';
import { hasLineOfSight } from '@/lib/battleUtils'; // Assuming this is correctly implemented

export interface AIAction {
  type: 'PRODUCE' | 'MOVE' | 'ATTACK' | 'CAPTURE' | 'IDLE';
  targetUnitId?: string; // For PRODUCE
  targetPosition?: { x: number; y: number }; // For MOVE or CAPTURE
  attackTargetInstanceId?: string; // For ATTACK
  priority: number; // Higher is more important
}

// Simple global build order for AI commander (can be expanded)
const aiBuildOrder: string[] = [
  'rifle_infantry',
  'rifle_infantry',
  'recon_infantry',
  'ifv', //歩兵戦闘車
  'rifle_infantry',
  'main_battle_tank',
  // ... more units
];
let globalAIBuildOrderIndex = 0;

export function resetGlobalAIBuildOrderIndex() {
  globalAIBuildOrderIndex = 0;
}


function findNearestEnemy(aiUnit: PlacedUnit, allUnits: PlacedUnit[], mapData: MapData | null): PlacedUnit | null {
  let nearestEnemy: PlacedUnit | null = null;
  let minDistance = Infinity;

  const aiUnitAxial = logicalToAxial(aiUnit.position.x, aiUnit.position.y);

  for (const unit of allUnits) {
    if (unit.owner === 'player' && unit.status !== 'destroyed') {
      // Basic visibility check for AI (AI doesn't use Fog of War for now for simplicity)
      // A more advanced AI would use its own units' vision.
      // For now, let's assume AI has "cheating" vision or relies on last known positions.
      const unitAxial = logicalToAxial(unit.position.x, unit.position.y);
      const distance = hexDistance(aiUnitAxial.q, aiUnitAxial.r, unitAxial.q, unitAxial.r);

      // Check if AI unit can actually target this enemy based on weapon types
      const aiUnitDef = UNITS_MAP.get(aiUnit.unitId);
      const enemyDef = UNITS_MAP.get(unit.unitId);
      if (!aiUnitDef || !enemyDef) continue;

      const enemyHasArmor = enemyDef.stats.armor.front > 0 || enemyDef.stats.armor.side > 0 || enemyDef.stats.armor.back > 0 || enemyDef.stats.armor.top > 0;
      let canEngage = false;
      if (aiUnitDef.stats.apWeapon && enemyHasArmor && distance <= aiUnitDef.stats.apWeapon.range) canEngage = true;
      if (!canEngage && aiUnitDef.stats.heWeapon && distance <= aiUnitDef.stats.heWeapon.range) canEngage = true;
      // If out of direct engagement range but could move towards, still consider it.
      if (!canEngage && (aiUnitDef.stats.apWeapon || aiUnitDef.stats.heWeapon)) canEngage = true; // Looser check for "potential" target


      if (canEngage && distance < minDistance) {
        minDistance = distance;
        nearestEnemy = unit;
      }
    }
  }
  return nearestEnemy;
}

function findNearestUncapturedStrategicPoint(aiUnit: PlacedUnit, mapData: MapData | null): StrategicPoint | null {
  if (!mapData || !mapData.strategicPoints) return null;

  let nearestSP: StrategicPoint | null = null;
  let minDistance = Infinity;
  const aiUnitAxial = logicalToAxial(aiUnit.position.x, aiUnit.position.y);

  for (const sp of mapData.strategicPoints) {
    if (sp.owner !== 'enemy') { // Not owned by AI
      const spAxial = logicalToAxial(sp.x, sp.y);
      const distance = hexDistance(aiUnitAxial.q, aiUnitAxial.r, spAxial.q, spAxial.r);
      if (distance < minDistance) {
        minDistance = distance;
        nearestSP = sp;
      }
    }
  }
  return nearestSP;
}


export function decideCommanderAIAction(
  commander: PlacedUnit,
  commanderDef: UnitData,
  allUnitsOnMap: PlacedUnit[],
  currentResources: number,
  mapData: MapData | null,
  gameTime: number // gameTime in seconds
): AIAction | null {
  // 1. Production
  if (!commander.productionQueue) {
    if (globalAIBuildOrderIndex < aiBuildOrder.length) {
      const unitToProduceId = aiBuildOrder[globalAIBuildOrderIndex];
      const unitToProduceDef = UNITS_MAP.get(unitToProduceId);
      if (unitToProduceDef && currentResources >= unitToProduceDef.cost) {
        globalAIBuildOrderIndex++;
        return { type: 'PRODUCE', targetUnitId: unitToProduceId, priority: 90 };
      }
    } else {
      // Build order finished, maybe produce based on needs or fallback
      // For now, try to build rifle infantry if affordable
      const rifleDef = UNITS_MAP.get('rifle_infantry');
      if (rifleDef && currentResources >= rifleDef.cost) {
        return { type: 'PRODUCE', targetUnitId: 'rifle_infantry', priority: 30 };
      }
    }
  }

  // 2. Commander's own movement/safety (very basic)
  // If enemies are very close, try to move away (not implemented yet, commander is weak)
  // For now, commander stays put or moves to a strategic point if nothing else to do.

  const nearestEnemy = findNearestEnemy(commander, allUnitsOnMap, mapData);
  if (nearestEnemy) {
      const distanceToEnemy = hexDistance(
          logicalToAxial(commander.position.x, commander.position.y).q, logicalToAxial(commander.position.x, commander.position.y).r,
          logicalToAxial(nearestEnemy.position.x, nearestEnemy.position.y).q, logicalToAxial(nearestEnemy.position.x, nearestEnemy.position.y).r
      );
      if (distanceToEnemy < 3 && commander.status !== 'moving' && commander.status !== 'turning') { // If enemy is too close
          // Try to move to a "safer" spot, e.g., a nearby friendly unit or away from enemy
          // This is a placeholder for more complex retreat/reposition logic
          const mapCenter = mapData ? {x: Math.floor(mapData.cols / 2), y: Math.floor(mapData.rows / 2)} : commander.position;
          const dx = commander.position.x - nearestEnemy.position.x;
          const dy = commander.position.y - nearestEnemy.position.y;
          let fleeToX = commander.position.x + Math.sign(dx) * 2; // Move 2 hexes away
          let fleeToY = commander.position.y + Math.sign(dy) * 2;

          // Basic bounds check (very rough)
          if(mapData){
            fleeToX = Math.max(0, Math.min(mapData.cols -1, fleeToX));
            fleeToY = Math.max(0, Math.min(mapData.rows -1, fleeToY));
          }

          // console.log(`AI Commander ${commander.name} fleeing from ${nearestEnemy.name} to (${fleeToX}, ${fleeToY})`);
          return { type: 'MOVE', targetPosition: { x: fleeToX, y: fleeToY }, priority: 80 };
      }
  }


  // 3. If idle and many resources, and build order is long done, maybe move to a SP
  if (commander.status === 'idle' && currentResources > 300 && globalAIBuildOrderIndex >= aiBuildOrder.length) {
    const nearestSP = findNearestUncapturedStrategicPoint(commander, mapData);
    if (nearestSP) {
      return { type: 'MOVE', targetPosition: { x: nearestSP.x, y: nearestSP.y }, priority: 20 };
    }
  }

  return { type: 'IDLE', priority: 10 };
}

export function decideCombatAIAction(
  aiUnit: PlacedUnit,
  aiUnitDef: UnitData,
  allUnitsOnMap: PlacedUnit[],
  mapData: MapData | null
): AIAction | null {
  if (aiUnit.status === 'moving' || aiUnit.status === 'turning' || aiUnit.status?.startsWith('reloading_') || aiUnit.status?.startsWith('attacking_')) {
    // If already busy with a primary action, let it continue for a bit
    // Exception: if current attack target is destroyed, or move target reached and no new order.
    if(aiUnit.attackTargetInstanceId){
        const currentTarget = allUnitsOnMap.find(u => u.instanceId === aiUnit.attackTargetInstanceId);
        if(!currentTarget || currentTarget.status === 'destroyed'){
            // Current target gone, need new decision
        } else {
            return null; // Continue current attack/reload cycle
        }
    } else if (aiUnit.status === 'moving' || aiUnit.status === 'turning') {
        return null; // Continue moving/turning
    }
  }


  // 1. Attack nearby enemies
  const nearestEnemy = findNearestEnemy(aiUnit, allUnitsOnMap, mapData);
  if (nearestEnemy) {
    const distance = hexDistance(
      logicalToAxial(aiUnit.position.x, aiUnit.position.y).q, logicalToAxial(aiUnit.position.x, aiUnit.position.y).r,
      logicalToAxial(nearestEnemy.position.x, nearestEnemy.position.y).q, logicalToAxial(nearestEnemy.position.x, nearestEnemy.position.y).r
    );

    // Determine if AI can engage this target with any weapon
    let canEngageNow = false;
    let weaponRange = 0;
    const enemyDef = UNITS_MAP.get(nearestEnemy.unitId);
    if (enemyDef) {
        const enemyHasArmor = enemyDef.stats.armor.front > 0 || enemyDef.stats.armor.side > 0 || enemyDef.stats.armor.back > 0 || enemyDef.stats.armor.top > 0;
        if (aiUnitDef.stats.apWeapon && enemyHasArmor && distance <= aiUnitDef.stats.apWeapon.range) {
            canEngageNow = true; weaponRange = aiUnitDef.stats.apWeapon.range;
        }
        if (!canEngageNow && aiUnitDef.stats.heWeapon && distance <= aiUnitDef.stats.heWeapon.range) { // Check HE if AP not chosen or not suitable
            canEngageNow = true; weaponRange = aiUnitDef.stats.heWeapon.range;
        }
         // If still not engageable now, but has AP weapon and target is not armored (bad use of AP but AI might do it)
        if (!canEngageNow && aiUnitDef.stats.apWeapon && distance <= aiUnitDef.stats.apWeapon.range) {
            canEngageNow = true; weaponRange = aiUnitDef.stats.apWeapon.range;
        }
    }


    if (canEngageNow && mapData && hasLineOfSight(aiUnit, nearestEnemy, mapData, allUnitsOnMap)) {
      return { type: 'ATTACK', attackTargetInstanceId: nearestEnemy.instanceId, priority: 100 };
    } else if (nearestEnemy.status !== 'destroyed') {
      // Cannot attack now (out of range or no LoS), so move towards it.
      // The "No path found" log suggests that moving directly to enemy's hex might be the issue
      // if A* cannot path to an occupied hex.
      // A better AI would path to an *adjacent* hex that allows attack.
      // For now, we keep the simple "move to target" which gameplay loop will handle.
      return { type: 'MOVE', targetPosition: { x: nearestEnemy.position.x, y: nearestEnemy.position.y }, priority: 70 };
    }
  }

  // 2. Capture strategic points (if not in combat)
  // Only non-commander combat units will try to capture for now
  if (!aiUnitDef.isCommander) {
    const nearestSP = findNearestUncapturedStrategicPoint(aiUnit, mapData);
    if (nearestSP) {
      const distanceToSP = hexDistance(
        logicalToAxial(aiUnit.position.x, aiUnit.position.y).q, logicalToAxial(aiUnit.position.x, aiUnit.position.y).r,
        logicalToAxial(nearestSP.x, nearestSP.y).q, logicalToAxial(nearestSP.x, nearestSP.y).r
      );
      if (distanceToSP === 0) { // Already on the point
        // If it's neutral or player-owned, AI should be capturing.
        // The main game loop handles capture progress, AI just needs to be on the hex.
        // So, if on SP and it's not enemy owned, consider it a CAPTURE (or hold) action.
        if (nearestSP.owner !== 'enemy') {
             return { type: 'CAPTURE', targetPosition: {x: nearestSP.x, y: nearestSP.y }, priority: 60 }; // Effectively 'hold position to capture'
        }
      } else {
        // Move to the strategic point
        return { type: 'MOVE', targetPosition: { x: nearestSP.x, y: nearestSP.y }, priority: 50 };
      }
    }
  }

  // 3. Default: Idle or some other low-priority action (e.g., regroup, patrol - not implemented)
  return { type: 'IDLE', priority: 10 };
}