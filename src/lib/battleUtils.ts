// src/lib/battleUtils.ts
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import type { MapData } from '@/types/map'; // 将来的に地形情報を利用するため

/**
 * 射線 (Line of Sight) が通っているか判定する。
 * 現状は非常にシンプルで、ユニットによる遮蔽は考慮せず常にtrueを返す。
 * @param attacker 攻撃ユニット
 * @param target 防御ユニット
 * @param mapData マップデータ (将来の地形判定用)
 * @param allUnitsOnMap 全ユニットリスト (将来のユニット遮蔽判定用)
 * @returns 射線が通っていればtrue
 */
export function hasLineOfSight(
  attacker: PlacedUnit,
  target: PlacedUnit,
  mapData: MapData | null, // 未使用
  allUnitsOnMap: PlacedUnit[] // 未使用
): boolean {
  // 今回の要件: ユニット間に他のユニットがいても射線は遮られない
  // 将来的には、ここに地形や他のユニットによる遮蔽判定ロジックを実装
  return true;
}