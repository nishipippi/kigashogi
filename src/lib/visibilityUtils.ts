// src/lib/visibilityUtils.ts
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import type { MapData, TerrainType } from '@/types/map'; // TerrainType をインポート
import {
  TERRAIN_CONCEALMENT_MODIFIERS,
  TERRAIN_SIGHT_MODIFIERS,
  ATTACK_DISCOVERY_PENALTY_MULTIPLIER,
  ATTACK_DISCOVERY_PENALTY_DURATION_MS
} from '@/types/map'; // 定数をインポート (必要に応じてパスを調整)
import { UNITS_MAP } from '@/gameData/units';
import { hexDistance, logicalToAxial, getAxialLine } from './hexUtils';

/**
 * ユニットAからユニットBへの視線が通っているか判定する (地形のみ考慮)
 * @param observer 視認する側のユニット
 * @param target 視認される側のユニット
 * @param map 現在のマップデータ
 * @returns 視線が通っていれば true
 */
function hasLineOfVision(
  observer: PlacedUnit,
  target: PlacedUnit,
  map: MapData | null
): boolean {
  if (!map || !map.hexes) {
    // console.warn("hasLineOfVision: mapData or mapData.hexes is null, assuming LoV true.");
    return true; // マップデータがなければ判定不可なので、仮にtrue
  }

  const obsAxial = logicalToAxial(observer.position.x, observer.position.y);
  const tgtAxial = logicalToAxial(target.position.x, target.position.y);

  // 隣接ヘックス同士は常に視線が通る
  if (hexDistance(obsAxial.q, obsAxial.r, tgtAxial.q, tgtAxial.r) <= 1) {
    return true;
  }

  const line = getAxialLine(obsAxial, tgtAxial);

  // 視線ライン上のヘックス (始点と終点を除く) をチェック
  for (let i = 1; i < line.length - 1; i++) {
    const hexPos = line[i];
    const hexKey = `${hexPos.q},${hexPos.r}`;
    const hexData = map.hexes[hexKey];

    if (hexData) {
      const terrain = hexData.terrain;
      // 視界を遮る地形 (射線判定のルールを参考に、必要なら調整)
      // KigaShogi仕様: 森林・市街地の視界/射線遮蔽: 当該ヘックスの向こう側は見えず、射線も通りません。
      // KigaShogi仕様: 丘陵/高台の射線: 丘陵/高台ヘックス自体は、その向こう側への射線を遮ります。
      // (視界も同様と仮定)
      if (terrain === 'forest' || terrain === 'city' || terrain === 'mountain') {
        return false;
      }
      if (terrain === 'hills') {
        // 丘陵が視線を遮る条件: 攻撃者も目標もその丘陵上にいない場合。
        const obsOnThisHill = obsAxial.q === hexPos.q && obsAxial.r === hexPos.r;
        const tgtOnThisHill = tgtAxial.q === hexPos.q && tgtAxial.r === hexPos.r;
        if (!obsOnThisHill && !tgtOnThisHill) {
          return false;
        }
      }
    } else {
      // マップデータに存在しないヘックスは視界を通さないとみなす
      // console.warn(`hasLineOfVision: Hex data not found for ${hexKey}, assuming blocked.`);
      return false;
    }
  }
  return true; // 遮るものがなければ視線は通る
}


/**
 * ユニットAがユニットBを視認できるか判定する
 * @param unitA 視認する側のユニット
 * @param unitB 視認される側のユニット
 * @param mapData 現在のマップデータ
 * @param allUnitsOnMap マップ上の全ユニット (現状、ユニットによる視界遮蔽は考慮しない)
 * @param currentTime 現在のゲーム時刻 (ms) - 攻撃ペナルティ判定用
 * @returns 視認できれば true、できなければ false
 */
export function canObserveTarget(
  unitA: PlacedUnit,
  unitB: PlacedUnit,
  mapData: MapData | null,
  allUnitsOnMap: PlacedUnit[], // この引数は現状の仕様では直接使わないが、インターフェースとして残す
  currentTime: number
): boolean {
  if (!mapData || !mapData.hexes || !unitA || !unitB || unitA.status === 'destroyed' || unitB.status === 'destroyed') {
    return false;
  }

  const unitADef = UNITS_MAP.get(unitA.unitId);
  const unitBDef = UNITS_MAP.get(unitB.unitId);

  if (!unitADef || !unitBDef) {
    // console.warn(`canObserveTarget: Unit definition not found for ${unitA?.unitId} or ${unitB?.unitId}`);
    return false;
  }

  // 自分自身は常に発見済み (UI表示上はこれで良いか検討)
  if (unitA.instanceId === unitB.instanceId) return true;

  const unitAPosAxial = logicalToAxial(unitA.position.x, unitA.position.y);
  const unitBPosAxial = logicalToAxial(unitB.position.x, unitB.position.y);

  // 1. 距離の計算
  const distance = hexDistance(unitAPosAxial.q, unitAPosAxial.r, unitBPosAxial.q, unitBPosAxial.r);

  // 2. 実効被発見距離の計算
  // 2.1 相手ユニットBの地形による隠蔽ボーナス係数
  const unitBHexKey = `${unitBPosAxial.q},${unitBPosAxial.r}`;
  const unitBHexData = mapData.hexes[unitBHexKey];
  let terrainConcealmentB = 1.0;
  if (unitBHexData) {
    const baseConcealment = TERRAIN_CONCEALMENT_MODIFIERS[unitBHexData.terrain];
    if (baseConcealment !== undefined) {
        terrainConcealmentB = baseConcealment;
        // 市街地の特例: 歩兵のみ効果 (UnitDataにtypeが必要)
        if (unitBHexData.terrain === 'city' && unitBDef.type !== 'infantry') {
            terrainConcealmentB = 1.0; // 歩兵でなければ市街地の隠蔽ボーナスなし
        }
    }
  }

  // 2.2 攻撃による発見ペナルティ係数 (unitBが最近攻撃したか)
  let attackPenaltyB = 1.0;
  if (unitB.lastSuccessfulAttackTimestamp &&
      (currentTime - unitB.lastSuccessfulAttackTimestamp) < ATTACK_DISCOVERY_PENALTY_DURATION_MS) {
    attackPenaltyB = ATTACK_DISCOVERY_PENALTY_MULTIPLIER;
  }

  // 2.3 自軍ユニットAの地形視界ボーナス係数
  const unitAHexKey = `${unitAPosAxial.q},${unitAPosAxial.r}`;
  const unitAHexData = mapData.hexes[unitAHexKey];
  let terrainSightA = 1.0;
  if (unitAHexData) {
    const baseSightBonus = TERRAIN_SIGHT_MODIFIERS[unitAHexData.terrain];
    if (baseSightBonus !== undefined) {
        terrainSightA = baseSightBonus;
    }
  }

  // 2.4 計算式
  const baseDetectionRangeB = unitBDef.stats.baseDetectionRange; // UnitStatsで定義されているはず
  const sightMultiplierA = unitADef.stats.sightMultiplier;     // UnitStatsで定義されているはず

  // sightMultiplierA や baseDetectionRangeB が0またはマイナスの場合のフォールバック
  const safeSightMultiplierA = sightMultiplierA > 0 ? sightMultiplierA : 1.0;
  const safeBaseDetectionRangeB = baseDetectionRangeB > 0 ? baseDetectionRangeB : 1.0;


  const effectiveDetectionRange =
    (safeBaseDetectionRangeB * terrainConcealmentB * attackPenaltyB) /
    (safeSightMultiplierA * terrainSightA);

  // 3. 視線の確認 (Line of Sight for Vision)
  const lineOfVisionClear = hasLineOfVision(unitA, unitB, mapData);

  // 4. 発見判定
  const isDiscovered = distance <= effectiveDetectionRange && lineOfVisionClear;

  // デバッグ用ログ (必要に応じて調整)
  // if (unitA.owner === 'player' && unitB.owner === 'enemy' && distance < 15 && unitADef.name === '偵察歩兵') { // 特定ユニットの視界をデバッグ
  //   console.log(
  //     `👁️ ${unitADef.name}(${unitA.instanceId.slice(-4)}) sees ${unitBDef.name}(${unitB.instanceId.slice(-4)})? ${isDiscovered}\n`+
  //     `  Dist: ${distance.toFixed(1)}, EffDetect: ${effectiveDetectionRange.toFixed(1)}\n`+
  //     `  B: BaseDetect:${safeBaseDetectionRangeB.toFixed(1)} * TerrainConceal:${terrainConcealmentB.toFixed(1)} * AtkPen:${attackPenaltyB.toFixed(1)} = ${(safeBaseDetectionRangeB * terrainConcealmentB * attackPenaltyB).toFixed(1)}\n`+
  //     `  A: SightMult:${safeSightMultiplierA.toFixed(1)} * TerrainSight:${terrainSightA.toFixed(1)} = ${(safeSightMultiplierA * terrainSightA).toFixed(1)}\n`+
  //     `  LoV Clear: ${lineOfVisionClear}`
  //   );
  // }

  return isDiscovered;
}