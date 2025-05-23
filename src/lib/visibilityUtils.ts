// src/lib/visibilityUtils.ts
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import type { UnitData } from '@/types/unit';
import { UNITS_MAP } from '@/gameData/units';
import { hexDistance, logicalToAxial, getHexLinePath, axialToLogical } from './hexUtils'; // getHexLinePath, axialToLogical を追加インポート
import type { MapData } from '@/types/map'; // MapData をインポート
import { TERRAIN_MOVE_COSTS } from '@/types/map'; // 地形タイプ判定のため (例: 森林なら隠蔽など)

/**
 * 特定のユニットがターゲットユニットを発見できるか判定する
 * @param observer 観測者ユニット
 * @param target ターゲットユニット
 * @param mapData 現在のマップデータ (地形による視界遮蔽のため)
 * @param allUnitsOnMap マップ上の全ユニット (他のユニットによる視界遮蔽のため)
 * @returns 発見できればtrue
 */
export function canObserveTarget(
  observer: PlacedUnit,
  target: PlacedUnit,
  mapData: MapData | null,
  allUnitsOnMap: PlacedUnit[]
): boolean {
  if (observer.owner === target.owner && observer.instanceId !== target.instanceId) {
    // 基本的に味方は見えるが、Fog of Warの概念として自ユニットの視界範囲外の味方は見えない、とする場合もある。
    // RTSの一般的な仕様として、味方ユニットは位置が常にわかることが多いのでtrueで良いでしょう。
    return true;
  }
  if (observer.instanceId === target.instanceId) return true; // 自分自身は常に見える

  const observerDef = UNITS_MAP.get(observer.unitId);
  const targetDef = UNITS_MAP.get(target.unitId);

  if (!observerDef || !targetDef) return false;

  // 1. 距離に基づく基本的な発見判定
  const baseDetectionRange = targetDef.stats.baseDetectionRange;
  const sightMultiplier = observerDef.stats.sightMultiplier;

  if (sightMultiplier <= 0) return false;

  // TODO: 地形効果と攻撃ペナルティを考慮した修正式をここに実装
  // KigaShogi要件定義補足資料 8. 情報戦システム (視界と隠蔽)
  // 実効被発見距離 = (相手基礎被発見距離 * 地形隠蔽係数 * 攻撃ペナルティ係数) / (自軍視界倍率 * 自軍地形視界ボーナス係数)

  // MVPの簡略化 (地形効果、攻撃ペナルティはx1.0とする)
  let terrainConcealmentBonus = 1.0; // ターゲットがいる地形の隠蔽ボーナス
  let observerSightBonus = 1.0;      // 観測者がいる地形の視界ボーナス
  let attackPenaltyMultiplier = 1.0; // ターゲットが攻撃中のペナルティ

  // ターゲットの地形隠蔽ボーナス (例)
  if (mapData && mapData.hexes) {
    const targetAxial = logicalToAxial(target.position.x, target.position.y);
    const targetHexKey = `${targetAxial.q},${targetAxial.r}`;
    const targetHexData = mapData.hexes[targetHexKey];
    if (targetHexData) {
      if (targetHexData.terrain === 'forest') terrainConcealmentBonus = 1.5; // 森は発見されにくい
      else if (targetHexData.terrain === 'city') terrainConcealmentBonus = 2.0; // 市街地はさらに発見されにくい
      else if (targetHexData.terrain === 'hills') terrainConcealmentBonus = 0.8; // 丘は発見されやすい
    }
  }

  // 観測者の地形視界ボーナス (例)
  if (mapData && mapData.hexes) {
    const observerAxial = logicalToAxial(observer.position.x, observer.position.y);
    const observerHexKey = `${observerAxial.q},${observerAxial.r}`;
    const observerHexData = mapData.hexes[observerHexKey];
    if (observerHexData && observerHexData.terrain === 'hills') {
      observerSightBonus = 1.2; // 丘は視界が良い
    }
  }

  // ターゲットの攻撃ペナルティ (例: 攻撃アニメーション中などを示す `status` を参照)
  if (target.status?.startsWith('attacking_') || target.status?.startsWith('reloading_')) {
    attackPenaltyMultiplier = 2.0; // 攻撃中は2倍見つかりやすい
  }

  const effectiveDetectionRange =
    (baseDetectionRange * terrainConcealmentBonus * attackPenaltyMultiplier) /
    (sightMultiplier * observerSightBonus);

  const observerAxialPos = logicalToAxial(observer.position.x, observer.position.y);
  const targetAxialPos = logicalToAxial(target.position.x, target.position.y);
  const distance = hexDistance(observerAxialPos.q, observerAxialPos.r, targetAxialPos.q, targetAxialPos.r);

  if (distance > effectiveDetectionRange) {
    return false; // 距離的に発見できない
  }

  // 2. 射線 (LoS) 判定 (地形や他のユニットによる遮蔽)
  // KigaShogi要件定義: 森林・市街地は向こう側が見えない。丘陵/高台は稜線越え不可。
  // hasLineOfSight を別途実装し、ここで呼び出すのが望ましい。
  // MVPでは、LoS判定は省略し、距離だけで判断。将来的には以下のような処理。

  /*
  if (mapData && mapData.hexes) {
    const linePathAxial = getHexLinePath(observerAxialPos.q, observerAxialPos.r, targetAxialPos.q, targetAxialPos.r)
                            .map(logPos => logicalToAxial(logPos.x, logPos.y)); // getHexLinePathが論理座標を返すのでAxialに再変換

    for (const pathNodeAxial of linePathAxial) {
      // スタートとゴール自身は遮蔽物として評価しない
      if ((pathNodeAxial.q === observerAxialPos.q && pathNodeAxial.r === observerAxialPos.r) ||
          (pathNodeAxial.q === targetAxialPos.q && pathNodeAxial.r === targetAxialPos.r)) {
        continue;
      }

      const hexKey = `${pathNodeAxial.q},${pathNodeAxial.r}`;
      const hexData = mapData.hexes[hexKey];
      if (hexData) {
        if (hexData.terrain === 'forest' || hexData.terrain === 'city' || hexData.terrain === 'mountain') {
          // 厳密には、隣接ヘックス同士は見える、などのルールも考慮
          return false; // 視線を遮る地形で遮蔽
        }
        // 丘陵の稜線越え判定はより複雑 (高低差と中間のヘックスを考慮)
      }

      // 他のユニットによる遮蔽 (大型ユニットのみなど、ルールによる)
      // for (const otherUnit of allUnitsOnMap) {
      //   if (otherUnit.instanceId === observer.instanceId || otherUnit.instanceId === target.instanceId) continue;
      //   const otherUnitAxial = logicalToAxial(otherUnit.position.x, otherUnit.position.y);
      //   if (otherUnitAxial.q === pathNodeAxial.q && otherUnitAxial.r === pathNodeAxial.r) {
      //     // ユニットサイズや透明度なども考慮
      //     return false; // 他のユニットで遮蔽
      //   }
      // }
    }
  }
  */

  return true; // 距離内で、かつLoSが通れば発見可能
}