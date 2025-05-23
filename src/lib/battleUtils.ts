// src/lib/battleUtils.ts
import type { UnitData, UnitWeaponStats } from '@/types/unit';
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import type { MapData } from '@/types/map';

/**
 * 射線 (Line of Sight) が通っているか判定する。
 * 現状は非常にシンプルで、ユニットによる遮蔽は考慮せず常にtrueを返す。
 * 将来的には、ここに地形や他のユニットによる遮蔽判定ロジックを実装。
 * @param attacker 攻撃ユニット
 * @param target 防御ユニット
 * @param mapData マップデータ (将来の地形判定用)
 * @param allUnitsOnMap 全ユニットリスト (将来のユニット遮蔽判定用)
 * @returns 射線が通っていればtrue
 */
export function hasLineOfSight(
  attacker: PlacedUnit,
  target: PlacedUnit,
  mapData: MapData | null, // 現在は未使用
  allUnitsOnMap: PlacedUnit[] // 現在は未使用
): boolean {
  // KigaShogiの仕様: ユニット間に他のユニットがいても射線は遮られない。
  // KigaShogiの仕様: 森林・市街地の視界/射線遮蔽: 当該ヘックスの向こう側は見えず、射線も通りません。
  // KigaShogiの仕様: 丘陵/高台の射線: 丘陵/高台ヘックス自体は、その向こう側への射線を遮ります。
  // 上記の仕様を実装するには、attackerとtarget間のヘックスライン上の地形情報を検査する必要がある。
  // ここではMVPとして、常にtrueを返す。
  return true;
}

interface DamageOutput {
  damageDealt: number;
  didPenetrate: boolean; // AP攻撃で貫通したか
  // effects?: string[]; // 将来的なエフェクト情報用 (例: 'ricochet', 'penetration')
}

/**
 * ダメージを計算する
 * @param attackerUnitDef 攻撃側のユニット定義
 * @param weaponType 'HE' または 'AP'
 * @param targetUnitDef 防御側のユニット定義
 * @param attackerOrientation 攻撃者の向き (0-359度)
 * @param targetOrientation 防御者の向き (0-359度)
 * @param targetPosition 防御者の論理座標 {x, y}
 * @param attackerPosition 攻撃者の論理座標 {x, y}
 * @returns 計算されたダメージと貫通情報
 */
export function calculateDamage(
  attackerUnitDef: UnitData,
  weaponType: 'HE' | 'AP',
  targetUnitDef: UnitData,
  attackerOrientation: number,
  targetOrientation: number,
  targetPosition: { x: number; y: number },
  attackerPosition: { x: number; y: number }
): DamageOutput {
  let damageDealt = 0;
  let didPenetrate = false;

  const weaponStats: UnitWeaponStats | undefined =
    weaponType === 'HE' ? attackerUnitDef.stats.heWeapon : attackerUnitDef.stats.apWeapon;

  if (!weaponStats) {
    return { damageDealt: 0, didPenetrate: false }; // 該当武器なし
  }

  if (weaponType === 'HE') {
    // HEパワー:
    // KigaShogi仕様: 対象が装甲を持たないユニット: 最終ダメージ = HEパワー
    // KigaShogi仕様: 対象が装甲を持つユニット: ダメージなし (AP攻撃のみ有効)

    // 自走砲のHE攻撃は装甲ユニットの天面装甲に対して効果を持つ特別ルール
    if (attackerUnitDef.id === 'self_propelled_artillery' && targetUnitDef.stats.armor.top !== undefined) {
      // KigaShogi要件定義補足資料:
      // "自走砲のHE範囲攻撃において、着弾範囲内の装甲ユニットに対し、天面装甲で判定する微小ダメージ
      // （例：AP1相当の固定ダメージ、ただし天面装甲値で軽減/無効化可能）が発生する"
      // ここでは簡易的に、HEパワーの一定割合を天面装甲で軽減する形で実装。
      // 例: HEパワーの20%を基礎ダメージとし、天面装甲で軽減。最低0ダメージ。
      // (自走砲のHEは着弾まで2秒、範囲攻撃という仕様もあるので、直接攻撃のこの関数とは別に処理が必要かも)
      // 今回は直接攻撃のダメージ計算なので、もし自走砲が直接HEで狙った場合を想定
      const baseImpactDamage = Math.floor(weaponStats.power * 0.2); // 例: HEパワーの20%
      damageDealt = Math.max(0, baseImpactDamage - targetUnitDef.stats.armor.top);
      didPenetrate = damageDealt > 0; // ダメージがあれば貫通とみなす
      return { damageDealt, didPenetrate };
    }

    // 通常のHE攻撃
    const targetTotalArmor =
      targetUnitDef.stats.armor.front +
      targetUnitDef.stats.armor.side +
      targetUnitDef.stats.armor.back +
      targetUnitDef.stats.armor.top;

    if (targetTotalArmor === 0) { // 装甲を持たないユニット (例: 歩兵、司令官)
      damageDealt = weaponStats.power;
      didPenetrate = true; // HEが効果あり＝貫通とみなす
    } else {
      // 装甲を持つユニットにはHEは基本的に無効
      damageDealt = 0;
      didPenetrate = false;
    }
  } else if (weaponType === 'AP') {
    // APパワー:
    // KigaShogi仕様: 装甲貫通判定: APパワー vs 対象の被弾部位の装甲値
    // KigaShogi仕様: 貫通した場合: 最終ダメージ = APパワー - 装甲値 (最低ダメージ1)
    // KigaShogi仕様: 非貫通の場合 (跳弾): 最終ダメージ = 1

    let targetArmorAtHitLocation: number;

    // 攻撃者から見たターゲットの相対角度を計算 (0度がターゲットの真後ろ、180度がターゲットの真正面になるように調整)
    const dx = targetPosition.x - attackerPosition.x;
    const dy = targetPosition.y - attackerPosition.y;
    const angleFromAttackerToTargetRad = Math.atan2(dy, dx);
    let angleFromAttackerToTargetDeg = (angleFromAttackerToTargetRad * 180 / Math.PI + 360) % 360; // 0-359度

    // ターゲットの向きを基準とした、攻撃が来る方向 (0度がターゲットの正面から、180度が背面から)
    // ターゲットの向き (targetOrientation) は、例えば0度が右、90度が上を示すと仮定。
    // angleFromAttackerToTargetDeg は、例えば攻撃者がターゲットの左にいる場合、約180度になる。
    // ターゲットが右(0度)を向いている時に左(180度)から攻撃されると、正面被弾。
    // ターゲットが上(90度)を向いている時に左(180度)から攻撃されると、左側面被弾。
    
    let impactDirectionRelativeToTargetDeg = (angleFromAttackerToTargetDeg - targetOrientation + 360 + 180) % 360;
    // +180 しているのは、攻撃が来る方向をターゲットの正面(0度)基準で表現するため。
    // 例えば、targetOrientation=0 (右向き)、angleFromAttackerToTargetDeg=180 (左から攻撃) の場合、
    // (180 - 0 + 180) % 360 = 0 => 正面からの攻撃と判定したい。

    // 0-180度に正規化 (左右対称なので、絶対値で判断)
    if (impactDirectionRelativeToTargetDeg > 180) {
        impactDirectionRelativeToTargetDeg = 360 - impactDirectionRelativeToTargetDeg;
    }
    // これで impactDirectionRelativeToTargetDeg は 0度(正面) ～ 180度(背面) の範囲になる。

    // 被弾部位の判定 (角度の閾値は調整可能)
    if (impactDirectionRelativeToTargetDeg <= 60) { // 正面 +/-60度
      targetArmorAtHitLocation = targetUnitDef.stats.armor.front;
      // console.log(`Hit Front Armor: ${targetArmorAtHitLocation} (Impact Angle: ${impactDirectionRelativeToTargetDeg.toFixed(1)})`);
    } else if (impactDirectionRelativeToTargetDeg <= 120) { // 側面 +/-60度から+/-120度
      targetArmorAtHitLocation = targetUnitDef.stats.armor.side;
      // console.log(`Hit Side Armor: ${targetArmorAtHitLocation} (Impact Angle: ${impactDirectionRelativeToTargetDeg.toFixed(1)})`);
    } else { // 背面 +/-120度から180度
      targetArmorAtHitLocation = targetUnitDef.stats.armor.back;
      // console.log(`Hit Back Armor: ${targetArmorAtHitLocation} (Impact Angle: ${impactDirectionRelativeToTargetDeg.toFixed(1)})`);
    }
    // 天面装甲は、自走砲の曲射や航空攻撃など、特別な攻撃種別でのみ考慮される想定。
    // 直接射撃のAP弾では通常、天面には当たらない。

    if (weaponStats.power > targetArmorAtHitLocation) { // 貫通
      damageDealt = Math.max(1, weaponStats.power - targetArmorAtHitLocation);
      didPenetrate = true;
    } else { // 非貫通 (跳弾)
      damageDealt = 1; // KigaShogi仕様: 非貫通時は1ダメージ
      didPenetrate = false;
    }
  }
  return { damageDealt, didPenetrate };
}