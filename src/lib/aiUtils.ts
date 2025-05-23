// src/lib/aiUtils.ts
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import type { MapData, StrategicPoint } from '@/types/map';
import { UNITS_MAP } from '@/gameData/units';
import { hexDistance, logicalToAxial } from './hexUtils'; // 必要なヘルパーをインポート

// AIの行動の型 (例)
export interface AIAction {
  type: 'PRODUCE' | 'MOVE' | 'ATTACK' | 'IDLE';
  targetUnitId?: string; // 生産するユニットID (PRODUCE時)
  targetPosition?: { x: number; y: number }; // 移動目標座標 (MOVE時)
  attackTargetInstanceId?: string; // 攻撃対象のinstanceId (ATTACK時)
}

/**
 * AI司令官ユニットの次の行動を決定する (主に生産)
 */
export function decideCommanderAIAction(
  commander: PlacedUnit,
  commanderDef: UnitData,
  allUnits: PlacedUnit[],
  playerResources: number, // AI側のリソース (今回はプレイヤーのリソースを仮で使うが、将来的にはAI専用リソース)
  mapData: MapData | null
): AIAction {
  // すでに生産キューがある場合は何もしない (IDLE)
  if (commander.productionQueue) {
    return { type: 'IDLE' };
  }

  // 生産可能なユニットのリスト (司令官以外)
  const producibleUnits = Array.from(UNITS_MAP.values()).filter(u => !u.isCommander && u.cost <= playerResources);

  if (producibleUnits.length > 0) {
    // 簡単なロジック: ランダムに1体選んで生産
    const unitToProduce = producibleUnits[Math.floor(Math.random() * producibleUnits.length)];
    if (playerResources >= unitToProduce.cost) {
      console.log(`AI Commander ${commander.instanceId} decides to produce ${unitToProduce.name}`);
      return { type: 'PRODUCE', targetUnitId: unitToProduce.id };
    }
  }

  return { type: 'IDLE' };
}

/**
 * AI戦闘ユニットの次の行動を決定する (移動・攻撃)
 */
export function decideCombatAIAction(
  aiUnit: PlacedUnit,
  aiUnitDef: UnitData,
  allUnits: PlacedUnit[],
  mapData: MapData | null
): AIAction {
  const playerUnits = allUnits.filter(u => u.owner === 'player' && u.status !== 'destroyed');
  const enemyUnits = allUnits.filter(u => u.owner === 'enemy' && u.status !== 'destroyed'); // AI自身の他のユニット

  // 1. 攻撃可能な敵が射程内にいれば攻撃
  for (const playerUnit of playerUnits) {
    const playerUnitDef = UNITS_MAP.get(playerUnit.unitId);
    if (!playerUnitDef) continue;

    const distance = hexDistance(
      logicalToAxial(aiUnit.position.x, aiUnit.position.y).q,
      logicalToAxial(aiUnit.position.x, aiUnit.position.y).r,
      logicalToAxial(playerUnit.position.x, playerUnit.position.y).q,
      logicalToAxial(playerUnit.position.x, playerUnit.position.y).r
    );

    let canAttack = false;
    if (aiUnitDef.stats.apWeapon && distance <= aiUnitDef.stats.apWeapon.range && playerUnitDef.stats.armor.front > 0) {
      canAttack = true;
    } else if (aiUnitDef.stats.heWeapon && distance <= aiUnitDef.stats.heWeapon.range) {
      canAttack = true;
    } else if (aiUnitDef.stats.apWeapon && distance <= aiUnitDef.stats.apWeapon.range) { // APしかなくても装甲0相手に使う
        canAttack = true;
    }


    if (canAttack) {
      // 攻撃対象がすでに設定されていれば何もしない (連続攻撃中)
      if (aiUnit.attackTargetInstanceId === playerUnit.instanceId &&
          (aiUnit.status?.startsWith('attacking_') || aiUnit.status?.startsWith('reloading_') || aiUnit.status === 'aiming')) {
        return { type: 'IDLE' };
      }
      console.log(`AI Unit ${aiUnit.name} decides to ATTACK ${playerUnit.name}`);
      return { type: 'ATTACK', attackTargetInstanceId: playerUnit.instanceId };
    }
  }

  // 2. 近くに敵がいれば、そちらへ移動
  if (playerUnits.length > 0) {
    let closestPlayerUnit: PlacedUnit | null = null;
    let minDistance = Infinity;

    for (const playerUnit of playerUnits) {
      const distance = hexDistance(
        logicalToAxial(aiUnit.position.x, aiUnit.position.y).q,
        logicalToAxial(aiUnit.position.x, aiUnit.position.y).r,
        logicalToAxial(playerUnit.position.x, playerUnit.position.y).q,
        logicalToAxial(playerUnit.position.x, playerUnit.position.y).r
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestPlayerUnit = playerUnit;
      }
    }

    if (closestPlayerUnit) {
      // 移動目標が設定されておらず、かつ現在の位置が目標と異なる場合のみ移動指示
      if (!aiUnit.moveTargetPosition ||
          (aiUnit.moveTargetPosition.x !== closestPlayerUnit.position.x || aiUnit.moveTargetPosition.y !== closestPlayerUnit.position.y)) {
          if (aiUnit.status !== 'moving' && aiUnit.status !== 'turning') { // 移動中でなければ
            console.log(`AI Unit ${aiUnit.name} decides to MOVE towards ${closestPlayerUnit.name}`);
            return { type: 'MOVE', targetPosition: closestPlayerUnit.position };
          }
      }
    }
  }

  // 3. (発展) 未占領または敵の戦略拠点へ移動
  if (mapData?.strategicPoints) {
    const nonEnemyStrategicPoints = mapData.strategicPoints.filter(sp => sp.owner !== 'enemy');
    if (nonEnemyStrategicPoints.length > 0) {
        let closestSP: StrategicPoint | null = null;
        let minDistanceSP = Infinity;
        for (const sp of nonEnemyStrategicPoints) {
            const distance = hexDistance(
                logicalToAxial(aiUnit.position.x, aiUnit.position.y).q,
                logicalToAxial(aiUnit.position.x, aiUnit.position.y).r,
                sp.x, // StrategicPointの座標は既にAxialかもしれないしLogicalかもしれないので注意。MapDataの定義に依存。ここではLogicalと仮定。
                sp.y
            );
            if (distance < minDistanceSP) {
                minDistanceSP = distance;
                closestSP = sp;
            }
        }
        if (closestSP) {
            if (!aiUnit.moveTargetPosition ||
                (aiUnit.moveTargetPosition.x !== closestSP.x || aiUnit.moveTargetPosition.y !== closestSP.y)) {
                if (aiUnit.status !== 'moving' && aiUnit.status !== 'turning') {
                    console.log(`AI Unit ${aiUnit.name} decides to MOVE towards Strategic Point ${closestSP.id}`);
                    return { type: 'MOVE', targetPosition: { x: closestSP.x, y: closestSP.y }};
                }
            }
        }
    }
  }


  return { type: 'IDLE' };
}