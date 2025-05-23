// src/lib/battleUtils.ts
// ... (hasLineOfSight の下に追加)
import type { UnitData, UnitWeaponStats, UnitArmor } from '@/types/unit';
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
interface DamageOutput {
  damageDealt: number;
  didPenetrate: boolean; // AP攻撃で貫通したか
}

/**
 * ダメージを計算する
 * @param attackerUnitDef 攻撃側のユニット定義
 * @param weaponType 'HE' または 'AP'
 * @param targetUnitDef 防御側のユニット定義
 * @param targetArmorValue 防御側の被弾部位の装甲値 (AP攻撃時のみ使用)
 * @returns 計算されたダメージと貫通情報
 */
export function calculateDamage(
  attackerUnitDef: UnitData,
  weaponType: 'HE' | 'AP',
  targetUnitDef: UnitData, // 防御ユニットの基本定義
  // targetCurrentArmor: UnitArmor, // 将来的に部位ごとの装甲を考慮する場合
  // hitLocation: 'front' | 'side' | 'back' | 'top' // 将来的に被弾部位を考慮する場合
): DamageOutput {
  let damageDealt = 0;
  let didPenetrate = false;

  const weaponStats: UnitWeaponStats | undefined =
    weaponType === 'HE' ? attackerUnitDef.stats.heWeapon : attackerUnitDef.stats.apWeapon;

  if (!weaponStats) {
    return { damageDealt: 0, didPenetrate: false }; // 該当武器なし
  }

  if (weaponType === 'HE') {
    // HEパワー: 対象が装甲を持たないユニット: 最終ダメージ = HEパワー
    // HEパワー: 対象が装甲を持つユニット: ダメージなし (AP攻撃のみ有効)
    // ここでは単純化し、全ユニットの装甲値の合計が0より大きいかで判定
    const targetTotalArmor = Object.values(targetUnitDef.stats.armor).reduce((sum, val) => sum + val, 0);
    if (targetTotalArmor === 0) { // 装甲を持たないとみなす (例: 歩兵)
      damageDealt = weaponStats.power;
    } else {
      damageDealt = 0; // 装甲ユニットにはHEは基本無効 (自走砲の天面は別途考慮)
    }
    didPenetrate = targetTotalArmor === 0; // HEが効いた＝貫通した、とみなす
  } else if (weaponType === 'AP') {
    // APパワー:
    // 装甲貫通判定: APパワー vs 対象の被弾部位の装甲値
    // 貫通した場合: 最終ダメージ = APパワー - 装甲値 (最低ダメージ1)
    // 非貫通の場合 (跳弾): 最終ダメージ = 1 (エフェクトで強調)

    // 今回は被弾部位を簡略化し、正面装甲(front)で判定
    const targetArmorAtHitLocation = targetUnitDef.stats.armor.front;

    if (weaponStats.power > targetArmorAtHitLocation) { // 貫通
      damageDealt = Math.max(1, weaponStats.power - targetArmorAtHitLocation);
      didPenetrate = true;
    } else { // 非貫通 (跳弾)
      damageDealt = 1;
      didPenetrate = false;
    }
  }
  return { damageDealt, didPenetrate };
}