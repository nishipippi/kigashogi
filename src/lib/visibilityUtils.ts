// src/lib/visibilityUtils.ts
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import type { MapData, TerrainType } from '@/types/map';
import {
  TERRAIN_CONCEALMENT_MODIFIERS,
  TERRAIN_SIGHT_MODIFIERS,
  ATTACK_DISCOVERY_PENALTY_MULTIPLIER,
  ATTACK_DISCOVERY_PENALTY_DURATION_MS // この定数は現状直接使っていませんが、将来のために残します
} from '@/types/map'; // 定数をインポート
import { UNITS_MAP } from '@/gameData/units';
import { hexDistance, logicalToAxial, getAxialLine } from './hexUtils';

/**
 * ユニットAがユニットBを視認できるか判定する
 * @param unitA 視認する側のユニット
 * @param unitB 視認される側のユニット
 * @param mapData 現在のマップデータ
 * @param allUnitsOnMap マップ上の全ユニット (今回はユニットによる遮蔽は考慮しない)
 * @param currentTime 現在のゲーム時刻 (ms) - 攻撃ペナルティ判定用
 * @returns 視認できれば true、できなければ false
 */
export function canObserveTarget(
  unitA: PlacedUnit,
  unitB: PlacedUnit,
  mapData: MapData | null,
  allUnitsOnMap: PlacedUnit[], // 現状の仕様では直接的には使用しないが、将来のユニット遮蔽のために残す
  currentTime: number // 攻撃ペナルティの時間管理に使用
): boolean {
  if (!mapData || !mapData.hexes || !unitA || !unitB || unitA.status === 'destroyed' || unitB.status === 'destroyed') {
    return false;
  }

  const unitADef = UNITS_MAP.get(unitA.unitId);
  const unitBDef = UNITS_MAP.get(unitB.unitId);

  if (!unitADef || !unitBDef) {
    return false;
  }

  const unitAPosAxial = logicalToAxial(unitA.position.x, unitA.position.y);
  const unitBPosAxial = logicalToAxial(unitB.position.x, unitB.position.y);

  // 自分自身は常に視認可能 (またはゲームルールによる)
  if (unitA.instanceId === unitB.instanceId) {
    return true;
  }

  // 1. 距離の計算
  const distance = hexDistance(unitAPosAxial.q, unitAPosAxial.r, unitBPosAxial.q, unitBPosAxial.r);

  // 2. 実効被発見距離の計算
  // 2.1 相手ユニットBの地形による隠蔽ボーナス係数
  const unitBHexKey = `${unitBPosAxial.q},${unitBPosAxial.r}`;
  const unitBHexData = mapData.hexes[unitBHexKey];
  let terrainConcealmentB = 1.0;
  if (unitBHexData) {
    const modifier = TERRAIN_CONCEALMENT_MODIFIERS[unitBHexData.terrain];
    if (typeof modifier === 'number') {
      terrainConcealmentB = modifier;
    }
    // 市街地の特例: 歩兵ユニット('infantry' type)のみ効果
    if (unitBHexData.terrain === 'city' && unitBDef.type !== 'infantry') {
      terrainConcealmentB = 1.0; // 歩兵でなければ市街地の隠蔽ボーナスなし
    }
  }

  // 2.2 攻撃による発見ペナルティ係数 (unitBが最近攻撃したか)
  let attackPenaltyB = 1.0;
  // PlacedUnit に lastAttackTimestamp (攻撃がヒットした/開始した時刻) があるとより正確
  // 今回は、unitB が攻撃関連のステータスである場合にペナルティを適用する簡易ロジック
  // (このロジックだと、攻撃準備中からずっとペナルティになる。実際の攻撃実行時からの時限式が望ましい)
  // gameplay/page.tsx の攻撃成功時に unitB.lastAttackTimestamp = currentTime; のようにセットし、
  // ここで (currentTime - unitB.lastAttackTimestamp) < ATTACK_DISCOVERY_PENALTY_DURATION_MS で判定する。
  if (unitB.attackTargetInstanceId && (unitB.status?.startsWith('attacking_') || unitB.status?.startsWith('reloading_'))) {
    // TODO: より正確な攻撃実行時刻からのペナルティ期間を判定する
    // 現状では、攻撃ステータスなら常にペナルティがかかる
    // PlacedUnitに lastAttackTimestamp があれば、それを使って ATTACK_DISCOVERY_PENALTY_DURATION_MS と比較する
    // if (unitB.lastAttackTimestamp && (currentTime - unitB.lastAttackTimestamp) < ATTACK_DISCOVERY_PENALTY_DURATION_MS) {
    //    attackPenaltyB = ATTACK_DISCOVERY_PENALTY_MULTIPLIER;
    // }
    // 今回は簡易的に、攻撃関連ステータスならペナルティ
     attackPenaltyB = ATTACK_DISCOVERY_PENALTY_MULTIPLIER;
  }


  // 2.3 自軍ユニットAの地形視界ボーナス係数
  const unitAHexKey = `${unitAPosAxial.q},${unitAPosAxial.r}`;
  const unitAHexData = mapData.hexes[unitAHexKey];
  let terrainSightA = 1.0;
  if (unitAHexData) {
    const modifier = TERRAIN_SIGHT_MODIFIERS[unitAHexData.terrain];
    if (typeof modifier === 'number') {
      terrainSightA = modifier;
    }
  }

  // 2.4 計算式 (要件定義補足資料の修正式ベース)
  // 実効被発見距離 = (相手基礎被発見距離 * 相手隠蔽ボーナス * 相手攻撃ペナルティ) / (自分視界倍率 * 自分地形視界ボーナス)
  const baseDetectionRangeB = unitBDef.stats.baseDetectionRange;
  const sightMultiplierA = unitADef.stats.sightMultiplier;

  // 0除算を避ける
  if (sightMultiplierA === 0 || terrainSightA === 0) {
    return false; // 視界能力が0なら何も見えない
  }

  const effectiveDetectionRange =
    (baseDetectionRangeB * terrainConcealmentB * attackPenaltyB) /
    (sightMultiplierA * terrainSightA);

  // 3. 視線の確認 (Line of Sight for Vision)
  // ユニットAからユニットBへの視線が地形によって遮られていないか確認
  // battleUtils の hasLineOfSight と同様のロジックだが、視界遮蔽専用のルール。
  // 今回は、ユニットによる遮蔽は考慮しない。
  function hasLineOfVision(
    observerAxial: {q: number, r: number},
    targetAxial: {q: number, r: number},
    map: MapData
  ): boolean {
    // 隣接ヘックスは常に視線が通る
    if (hexDistance(observerAxial.q, observerAxial.r, targetAxial.q, targetAxial.r) <= 1) {
      return true;
    }

    const line = getAxialLine(observerAxial, targetAxial);

    // 視線ライン上の中間ヘックス (始点と終点を除く) をチェック
    for (let i = 1; i < line.length - 1; i++) {
      const hexPos = line[i];
      const hexKey = `${hexPos.q},${hexPos.r}`;
      const hexData = map.hexes[hexKey];

      if (hexData) {
        const terrain = hexData.terrain;
        // 視界を遮る地形の定義 (例: 森林、市街地、山)
        // KigaShogi仕様: 森林・市街地の視界/射線遮蔽: 当該ヘックスの向こう側は見えず、射線も通りません。
        // KigaShogi仕様: 丘陵/高台の射線: 丘陵/高台ヘックス自体は、その向こう側への射線を遮ります。
        // 視界も同様に遮ると仮定。
        if (terrain === 'forest' || terrain === 'city' || terrain === 'mountain') {
          return false;
        }
        if (terrain === 'hills') {
          // 丘陵/高台の場合、そのヘックスが視認者とターゲットの間にあり、
          // かつ視認者とターゲットの両方がその丘陵/高台の上にいない場合、稜線越えとみなして視界を遮る。
          const observerOnThisHill = observerAxial.q === hexPos.q && observerAxial.r === hexPos.r;
          const targetOnThisHill = targetAxial.q === hexPos.q && targetAxial.r === hexPos.r;
          if (!observerOnThisHill && !targetOnThisHill) {
            return false;
          }
        }
      } else {
        // マップデータに存在しないヘックスは視界が通らないとみなす (マップ範囲外など)
        return false;
      }
    }
    return true; // 遮るものがなければ視線は通る
  }

  const lineOfVisionClear = hasLineOfVision(unitAPosAxial, unitBPosAxial, mapData);

  // 4. 発見判定
  // 距離が実効被発見距離以下であり、かつ視線が通っている場合
  const isDiscovered = distance <= effectiveDetectionRange && lineOfVisionClear;

  // デバッグ用ログ (必要に応じてコメント解除)
  // if (unitA.owner === 'player' && unitB.owner === 'enemy') {
  //   console.log(
  //     `Can ${unitADef.name} see ${unitBDef.name}? Dist:${distance.toFixed(1)}, ` +
  //     `EffDetRange:${effectiveDetectionRange.toFixed(1)} (B_Base:${baseDetectionRangeB}, B_Conceal:${terrainConcealmentB.toFixed(1)}, B_AtkPen:${attackPenaltyB.toFixed(1)} / ` +
  //     `A_Sight:${sightMultiplierA}, A_TerrSight:${terrainSightA.toFixed(1)}), ` +
  //     `LoVClear:${lineOfVisionClear} => Discovered:${isDiscovered}`
  //   );
  // }

  return isDiscovered;
}