// src/lib/aiUtils.ts
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import type { UnitData, UnitClassificationType } from '@/types/unit'; // UnitClassificationType をインポート
import type { MapData, StrategicPoint } from '@/types/map';
import { UNITS_MAP, ALL_UNITS } from '@/gameData/units'; // ALL_UNITS もインポート
import { hexDistance, logicalToAxial } from './hexUtils';

export interface AIAction {
  type: 'PRODUCE' | 'MOVE' | 'ATTACK' | 'IDLE';
  targetUnitId?: string;
  targetPosition?: { x: number; y: number };
  attackTargetInstanceId?: string;
}

// AIの戦略フェーズ (例) - 現在は未使用だが将来の拡張用
type AIStrategyPhase = 'EARLY_EXPANSION' | 'MID_GAME_CONSOLIDATION' | 'LATE_GAME_OFFENSIVE';

// 簡単な初期ビルドオーダーの例 (ユニットIDの配列)
const aiInitialBuildOrder: string[] = ['recon_infantry', 'rifle_infantry', 'rifle_infantry', 'support_infantry', 'anti_tank_infantry'];
// ★★★ 注意: このグローバル変数は複数のAI司令官やゲームリセットに対応していません ★★★
// ★★★ 将来的にはAIの状態として司令官ユニット自身に持たせるか、AIコントローラーで管理する必要があります ★★★
let globalAICurrentBuildOrderIndex = 0; // ゲーム開始時やAI司令官生成時にリセットが必要

/**
 * グローバルなビルドオーダーインデックスをリセットする関数 (ゲーム開始時などに呼び出す)
 */
export function resetGlobalAIBuildOrderIndex(): void {
    globalAICurrentBuildOrderIndex = 0;
}


/**
 * AI司令官ユニットの次の行動を決定する (主に生産)
 * @param commander AI司令官ユニット
 * @param commanderDef AI司令官のユニット定義
 * @param allUnits マップ上の全ユニット
 * @param aiResources AIの現在のリソース
 * @param mapData 現在のマップデータ
 * @param gameTimeElapsed ゲーム経過時間 (秒)
 * @returns AIの行動
 */
export function decideCommanderAIAction(
  commander: PlacedUnit,
  commanderDef: UnitData,
  allUnits: PlacedUnit[],
  aiResources: number,
  mapData: MapData | null,
  gameTimeElapsed: number
): AIAction {
  // 既に何かを生産中なら何もしない
  if (commander.productionQueue) {
    return { type: 'IDLE' };
  }

  const aiUnits = allUnits.filter(u => u.owner === 'enemy' && u.status !== 'destroyed');
  const aiUnitCounts: Record<string, number> = {};
  aiUnits.forEach(u => {
    aiUnitCounts[u.unitId] = (aiUnitCounts[u.unitId] || 0) + 1;
  });

  let unitIdToProduce: string | null = null;

  // 1. 初期ビルドオーダーの実行 (例: ゲーム開始から5分 = 300秒以内)
  //    かつ、ビルドオーダーがまだ残っている場合
  if (gameTimeElapsed < 300 && globalAICurrentBuildOrderIndex < aiInitialBuildOrder.length) {
    const nextUnitInBuild = aiInitialBuildOrder[globalAICurrentBuildOrderIndex];
    const unitDef = UNITS_MAP.get(nextUnitInBuild);
    if (unitDef && aiResources >= unitDef.cost) {
      unitIdToProduce = nextUnitInBuild;
      // globalAICurrentBuildOrderIndex++; // 生産決定後にインクリメントするのでここではしない
    } else if (unitDef && aiResources < unitDef.cost) {
      // ビルドオーダーのユニットを作るリソースがない場合は待機 (IDLE)
      return { type: 'IDLE' };
    } else {
      // ビルドオーダーのユニットIDが無効ならスキップ (フォールスルーして次のロジックへ)
      console.warn(`AI Build Order: Invalid unit ID ${nextUnitInBuild} or unit not in UNITS_MAP. Skipping.`);
      globalAICurrentBuildOrderIndex++; // スキップして次へ
    }
  }

  // 2. 通常の生産ロジック (初期ビルドオーダー後、またはビルドオーダーで生産できない場合)
  if (!unitIdToProduce) {
    const producibleUnits = ALL_UNITS.filter( // ALL_UNITS から検索
      u => !u.isCommander && u.cost <= aiResources
    );

    if (producibleUnits.length > 0) {
      // 簡単な役割ベースの生産優先度 (例)
      const numRifle = aiUnitCounts['rifle_infantry'] || 0;
      const numAntiTank = aiUnitCounts['anti_tank_infantry'] || 0;
      const numRecon = aiUnitCounts['recon_infantry'] || 0;
      const numMBT = aiUnitCounts['main_battle_tank'] || 0;

      // 優先順位: 偵察 -> ライフル歩兵 -> 対戦車 -> 戦車 -> その他安価なもの
      if (numRecon < 1 && UNITS_MAP.has('recon_infantry') && aiResources >= (UNITS_MAP.get('recon_infantry')?.cost || Infinity)) {
        unitIdToProduce = 'recon_infantry';
      } else if (numRifle < 5 && UNITS_MAP.has('rifle_infantry') && aiResources >= (UNITS_MAP.get('rifle_infantry')?.cost || Infinity)) {
        unitIdToProduce = 'rifle_infantry';
      } else if (numAntiTank < 2 && UNITS_MAP.has('anti_tank_infantry') && aiResources >= (UNITS_MAP.get('anti_tank_infantry')?.cost || Infinity)) {
        unitIdToProduce = 'anti_tank_infantry';
      } else if (numMBT < 1 && UNITS_MAP.has('main_battle_tank') && aiResources >= (UNITS_MAP.get('main_battle_tank')?.cost || Infinity)) {
        unitIdToProduce = 'main_battle_tank';
      } else {
        // 上記以外で生産可能なものがあれば、コストの低い順にソートして一番安いのを試す
        const affordableAndProducible = producibleUnits.filter(u => u.cost <= aiResources);
        if (affordableAndProducible.length > 0) {
          affordableAndProducible.sort((a, b) => a.cost - b.cost);
          unitIdToProduce = affordableAndProducible[0].id;
        }
      }
    }
  }

  if (unitIdToProduce) {
    // 初期ビルドオーダーで生産する場合、インデックスを進める
    if (gameTimeElapsed < 300 && globalAICurrentBuildOrderIndex < aiInitialBuildOrder.length && aiInitialBuildOrder[globalAICurrentBuildOrderIndex] === unitIdToProduce) {
        globalAICurrentBuildOrderIndex++;
    }
    // console.log(`AI Commander ${commander.instanceId} DECIDES to produce ${unitIdToProduce}. BuildIndex: ${globalAICurrentBuildOrderIndex}`);
    return { type: 'PRODUCE', targetUnitId: unitIdToProduce };
  }

  return { type: 'IDLE' };
}


/**
 * AI戦闘ユニットの次の行動を決定する (移動・攻撃)
 * @param aiUnit AI戦闘ユニット
 * @param aiUnitDef AI戦闘ユニットの定義
 * @param allUnits マップ上の全ユニット
 * @param mapData 現在のマップデータ
 * @returns AIの行動
 */
export function decideCombatAIAction(
  aiUnit: PlacedUnit,
  aiUnitDef: UnitData,
  allUnits: PlacedUnit[],
  mapData: MapData | null
): AIAction {
  const playerUnits = allUnits.filter(u => u.owner === 'player' && u.status !== 'destroyed');
  // const aiOwnUnits = allUnits.filter(u => u.owner === 'enemy' && u.status !== 'destroyed');

  // 0. 既に何らかの攻撃関連行動中なら、基本的には継続
  if (aiUnit.attackTargetInstanceId &&
      (aiUnit.status === 'aiming' || aiUnit.status?.startsWith('attacking_') || aiUnit.status?.startsWith('reloading_'))) {
    // ただし、ターゲットが存在しなくなったらリセットすべき (これは gameplay/page.tsx 側で処理されている想定)
    return { type: 'IDLE' };
  }
  // 移動中・旋回中も基本的には現在のタスクを優先
  if (aiUnit.isMoving || aiUnit.isTurning) {
    // TODO: 移動中に非常に優先度の高い脅威（例：司令官が攻撃されている）が現れたら、
    // 現在の移動をキャンセルして新しい行動をとるロジックも将来的にはあり得る。
    // MVPでは現在の移動/旋回を完了させる。
    return { type: 'IDLE' };
  }


  // 1. 攻撃可能な敵が射程内にいれば攻撃 (最も優先)
  let bestAttackTarget: PlacedUnit | null = null;
  let minTargetHpForAttack = Infinity; // よりHPの低い敵を優先

  for (const playerUnit of playerUnits) {
    const playerUnitDef = UNITS_MAP.get(playerUnit.unitId);
    if (!playerUnitDef) continue;

    const distance = hexDistance(
      logicalToAxial(aiUnit.position.x, aiUnit.position.y).q,
      logicalToAxial(aiUnit.position.x, aiUnit.position.y).r,
      logicalToAxial(playerUnit.position.x, playerUnit.position.y).q,
      logicalToAxial(playerUnit.position.x, playerUnit.position.y).r
    );

    // 武器選択ロジック (より詳細化可能)
    let canAttack = false;
    const targetHasArmor = playerUnitDef.stats.armor.front > 0 || playerUnitDef.stats.armor.side > 0 || playerUnitDef.stats.armor.back > 0 || playerUnitDef.stats.armor.top > 0;

    if (aiUnitDef.stats.apWeapon && distance <= aiUnitDef.stats.apWeapon.range && targetHasArmor) {
      canAttack = true;
    } else if (aiUnitDef.stats.heWeapon && distance <= aiUnitDef.stats.heWeapon.range) {
      canAttack = true;
    } else if (aiUnitDef.stats.apWeapon && distance <= aiUnitDef.stats.apWeapon.range && !targetHasArmor) { // APしかなくても非装甲を攻撃
      canAttack = true;
    }

    if (canAttack) {
      // 司令官ユニットを最優先で狙う (HPに関わらず)
      if (playerUnitDef.isCommander) {
        bestAttackTarget = playerUnit;
        break; // 司令官を見つけたら他は探さない
      }
      if (playerUnit.currentHp < minTargetHpForAttack) {
        minTargetHpForAttack = playerUnit.currentHp;
        bestAttackTarget = playerUnit;
      } else if (!bestAttackTarget) { // 最初に見つかった攻撃可能なユニット
        bestAttackTarget = playerUnit;
      }
    }
  }

  if (bestAttackTarget) {
    // console.log(`AI Unit ${aiUnit.name} (${aiUnit.instanceId.slice(-4)}) DECIDES to ATTACK ${bestAttackTarget.name} (${bestAttackTarget.instanceId.slice(-4)})`);
    return { type: 'ATTACK', attackTargetInstanceId: bestAttackTarget.instanceId };
  }


  // 2. 移動目標の決定 (攻撃対象が射程内にいない場合)
  // 2.1 優先度1: 中立または敵プレイヤーが確保中の戦略拠点
  if (mapData?.strategicPoints) {
    const relevantStrategicPoints = mapData.strategicPoints.filter(
      sp => sp.owner === 'neutral' || sp.owner === 'player'
    );

    if (relevantStrategicPoints.length > 0) {
      let closestRelevantSP: StrategicPoint | null = null;
      let minDistanceToSP = Infinity;

      for (const sp of relevantStrategicPoints) {
        const spAxial = logicalToAxial(sp.x, sp.y); // SPの座標は論理座標と仮定
        const distance = hexDistance(
          logicalToAxial(aiUnit.position.x, aiUnit.position.y).q,
          logicalToAxial(aiUnit.position.x, aiUnit.position.y).r,
          spAxial.q,
          spAxial.r
        );
        if (distance < minDistanceToSP) {
          minDistanceToSP = distance;
          closestRelevantSP = sp;
        }
      }

      if (closestRelevantSP) {
        // 現在の移動目標がこのSPでなければ、移動指示
        if (!aiUnit.moveTargetPosition ||
            (aiUnit.moveTargetPosition.x !== closestRelevantSP.x || aiUnit.moveTargetPosition.y !== closestRelevantSP.y)) {
          // console.log(`AI Unit ${aiUnit.name} (${aiUnit.instanceId.slice(-4)}) DECIDES to MOVE towards SP ${closestRelevantSP.name}`);
          return { type: 'MOVE', targetPosition: { x: closestRelevantSP.x, y: closestRelevantSP.y } };
        }
        // すでにこのSPに向かっているならIDLE (移動は継続される)
        return { type: 'IDLE' };
      }
    }
  }

  // 2.2 優先度2: 最も近い敵プレイヤーユニット (視界内にいる、または最後に確認された位置へ)
  if (playerUnits.length > 0) { // playerUnits は現在視認可能な敵
    let closestVisiblePlayerUnit: PlacedUnit | null = null;
    let minDistanceToVisiblePlayer = Infinity;

    for (const playerUnit of playerUnits) {
      const distance = hexDistance(
        logicalToAxial(aiUnit.position.x, aiUnit.position.y).q,
        logicalToAxial(aiUnit.position.x, aiUnit.position.y).r,
        logicalToAxial(playerUnit.position.x, playerUnit.position.y).q,
        logicalToAxial(playerUnit.position.x, playerUnit.position.y).r
      );
      if (distance < minDistanceToVisiblePlayer) {
        minDistanceToVisiblePlayer = distance;
        closestVisiblePlayerUnit = playerUnit;
      }
    }

    if (closestVisiblePlayerUnit) {
      if (!aiUnit.moveTargetPosition ||
          (aiUnit.moveTargetPosition.x !== closestVisiblePlayerUnit.position.x || aiUnit.moveTargetPosition.y !== closestVisiblePlayerUnit.position.y)) {
        // console.log(`AI Unit ${aiUnit.name} (${aiUnit.instanceId.slice(-4)}) DECIDES to MOVE towards visible enemy ${closestVisiblePlayerUnit.name}`);
        return { type: 'MOVE', targetPosition: closestVisiblePlayerUnit.position };
      }
      return { type: 'IDLE' };
    }
    // TODO: 視界外の最後に確認された敵ユニット(lastSeenEnemyUnits)への移動も検討
  }

  // 3. 何もすることがなければIDLE (またはマップ中央へ移動、パトロールなど)
  // console.log(`AI Unit ${aiUnit.name} (${aiUnit.instanceId.slice(-4)}) has no specific target, stays IDLE or could patrol.`);
  return { type: 'IDLE' };
}