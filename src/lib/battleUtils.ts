// src/lib/battleUtils.ts
import type { UnitData, UnitWeaponStats } from '@/types/unit';
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import type { MapData, HexData, TerrainType } from '@/types/map'; // TerrainType, HexData をインポート
import { logicalToAxial, hexDistance, getAxialLine } from './hexUtils'; // getAxialLine をインポート

/**
 * 射線 (Line of Sight) が通っているか判定する。
 * 地形によってのみ遮られる。他のユニットは遮らない。
 * @param attacker 攻撃ユニット
 * @param target 防御ユニット
 * @param mapData マップデータ (地形判定用)
 * @param allUnitsOnMap 全ユニットリスト (現在は未使用だが、将来的な拡張のため残す)
 * @returns 射線が通っていればtrue
 */
export function hasLineOfSight(
  attacker: PlacedUnit,
  target: PlacedUnit,
  mapData: MapData | null,
  allUnitsOnMap: PlacedUnit[] // この引数は現状の仕様では直接使わないが、インターフェースとして残す
): boolean {
  if (!mapData || !mapData.hexes) {
    // console.warn("hasLineOfSight: mapData or mapData.hexes is null, assuming LoS true for now.");
    return true; // マップデータがなければ判定不可なので、仮にtrue (またはエラーハンドリング)
  }

  const attackerAxial = logicalToAxial(attacker.position.x, attacker.position.y);
  const targetAxial = logicalToAxial(target.position.x, target.position.y);

  // 自分自身をターゲットにしている場合は常に射線OK (通常はありえないが念のため)
  if (attacker.instanceId === target.instanceId) {
      return true;
  }

  // 隣接ヘックス同士は常に射線が通る
  if (hexDistance(attackerAxial.q, attackerAxial.r, targetAxial.q, targetAxial.r) <= 1) {
    return true;
  }

  const line = getAxialLine(attackerAxial, targetAxial);

  // 射線ライン上のヘックス (始点と終点を除く) をチェック
  for (let i = 1; i < line.length - 1; i++) {
    const hexPos = line[i];
    const hexKey = `${hexPos.q},${hexPos.r}`;
    const hexData = mapData.hexes[hexKey];

    if (hexData) {
      const terrain = hexData.terrain;
      // 射線を遮る地形タイプ
      const blockingTerrains: TerrainType[] = ['forest', 'city', 'mountain', 'hills']; // hillsも遮蔽リストに追加

      if (blockingTerrains.includes(terrain)) {
        // 丘(hills)の場合の特別ルール:
        // 攻撃者もターゲットもその丘ヘックス上にいない場合のみ、その丘は射線を遮る
        if (terrain === 'hills') {
          const attackerOnThisBlockingHex = attackerAxial.q === hexPos.q && attackerAxial.r === hexPos.r;
          const targetOnThisBlockingHex = targetAxial.q === hexPos.q && targetAxial.r === hexPos.r;
          if (attackerOnThisBlockingHex || targetOnThisBlockingHex) {
            // 攻撃者かターゲットがこの遮蔽ヘックス(丘)自身にいるなら、そのヘックスは遮らない
            continue;
          }
        }
        // console.log(`LoS blocked by ${terrain} at ${hexKey} for target ${target.name}`);
        return false; // 射線を遮る地形
      }
    } else {
      // マップデータに存在しないヘックスは、範囲外などとして扱われる。
      // 厳密にはラインがマップ外に出た時点で遮蔽とみなすか、マップ定義が完全である前提とする。
      // ここでは、定義外のヘックスは不明な障害物として遮蔽とみなす。
      // console.warn(`LoS check: Hex data not found for ${hexKey}, assuming blocked.`);
      return false;
    }
  }

  return true; // 遮るものがなければ射線は通る
}

interface DamageOutput {
  damageDealt: number;
  didPenetrate: boolean;
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

  if (!weaponStats || weaponStats.power <= 0) { // 武器がないか、パワーが0ならダメージなし
    return { damageDealt: 0, didPenetrate: false };
  }

  if (weaponType === 'HE') {
    // 自走砲のHE攻撃は特別ルール (要件定義補足資料)
    // これは GameplayScreen 側で範囲攻撃として処理されるべきで、
    // この calculateDamage は直接照準攻撃を想定。
    // もし自走砲が直接HEで狙うケースがあるなら、ここでも特別扱いが必要。
    // 現状の自走砲のHE DPSは0.5と低いので、直接照準での大きな効果は期待薄。
    // 天面装甲への微小ダメージは、現状の仕様では自走砲の「範囲攻撃」に限定されている。
    // この関数が「直接攻撃」のみを扱うなら、自走砲のHEも通常のHEルールで良い。
    // 一旦、通常のHEルールに従う。

    const targetTotalArmor =
      (targetUnitDef.stats.armor.front || 0) +
      (targetUnitDef.stats.armor.side || 0) +
      (targetUnitDef.stats.armor.back || 0) +
      (targetUnitDef.stats.armor.top || 0);

    if (targetTotalArmor === 0) { // 装甲を持たないユニット
      damageDealt = weaponStats.power;
      didPenetrate = true;
    } else { // 装甲を持つユニットにはHEは基本的に無効
      damageDealt = 0;
      didPenetrate = false;
    }
  } else if (weaponType === 'AP') {
    let targetArmorAtHitLocation: number;

    const dx = targetPosition.x - attackerPosition.x;
    const dy = targetPosition.y - attackerPosition.y;
    const angleFromAttackerToTargetRad = Math.atan2(dy, dx);
    const angleFromAttackerToTargetDeg = (angleFromAttackerToTargetRad * 180 / Math.PI + 360) % 360;

    let impactDirectionRelativeToTargetDeg = (angleFromAttackerToTargetDeg - targetOrientation + 360 + 180) % 360;

    if (impactDirectionRelativeToTargetDeg > 180) {
        impactDirectionRelativeToTargetDeg = 360 - impactDirectionRelativeToTargetDeg;
    }

    if (impactDirectionRelativeToTargetDeg <= 60) {
      targetArmorAtHitLocation = targetUnitDef.stats.armor.front || 0;
    } else if (impactDirectionRelativeToTargetDeg <= 120) {
      targetArmorAtHitLocation = targetUnitDef.stats.armor.side || 0;
    } else {
      targetArmorAtHitLocation = targetUnitDef.stats.armor.back || 0;
    }

    if (weaponStats.power > targetArmorAtHitLocation) {
      damageDealt = Math.max(1, weaponStats.power - targetArmorAtHitLocation);
      didPenetrate = true;
    } else {
      damageDealt = 1; // 非貫通時は1ダメージ
      didPenetrate = false;
    }
  }
  return { damageDealt, didPenetrate };
}