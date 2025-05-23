// src/lib/visibilityUtils.ts
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import { UNITS_MAP } from '@/gameData/units';
import { hexDistance, logicalToAxial } from './hexUtils'; // hexDistance, logicalToAxial が必要

/**
 * 特定のユニットがターゲットユニットを発見できるか判定する
 * 地形効果と攻撃ペナルティは今回x1.0として簡略化
 * @param observer 観測者ユニット
 * @param target ターゲットユニット
 * @returns 発見できればtrue
 */
export function canObserveTarget(observer: PlacedUnit, target: PlacedUnit): boolean {
  if (observer.owner === target.owner) return true; // 味方ユニットは常に見える

  const observerDef = UNITS_MAP.get(observer.unitId);
  const targetDef = UNITS_MAP.get(target.unitId);

  if (!observerDef || !targetDef) return false; // ユニット定義が見つからない

  // 実効被発見距離 = (相手基礎被発見距離 * 地形隠蔽 * 攻撃ペナルティ) / (自軍視界倍率 * 自軍地形視界ボーナス)
  // 今回の簡略化: 実効被発見距離 = 相手基礎被発見距離 / 自軍視界倍率
  const baseDetectionRange = targetDef.stats.baseDetectionRange;
  const sightMultiplier = observerDef.stats.sightMultiplier;

  if (sightMultiplier <= 0) return false; // 視界倍率0以下なら何も見えない

  const effectiveDetectionDistance = baseDetectionRange / sightMultiplier;

  const observerAxial = logicalToAxial(observer.position.x, observer.position.y);
  const targetAxial = logicalToAxial(target.position.x, target.position.y);
  const distance = hexDistance(observerAxial.q, observerAxial.r, targetAxial.q, targetAxial.r);

  return distance <= effectiveDetectionDistance;
}