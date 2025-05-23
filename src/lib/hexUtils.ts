// src/lib/hexUtils.ts
import type { MapData, HexData, TerrainType } from '@/types/map'; // TerrainType もインポート
import { TERRAIN_MOVE_COSTS } from '@/types/map'; // 地形コスト定義をインポート
import type { PlacedUnit } from '@/stores/gameSettingsStore'; // PlacedUnitをインポート

/**
 * ヘックスの中心座標から、ポインティトップヘックスの6つの頂点座標を計算する
 * @param centerX ヘックスの中心X座標
 * @param centerY ヘックスの中心Y座標
 * @param size ヘックスのサイズ（中心から頂点までの距離）
 * @returns 頂点座標の文字列 (SVGのpoints属性用)
 */
export function getHexCorners(centerX: number, centerY: number, size: number): string {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angleRad = Math.PI / 180 * (60 * i + 30);
    points.push({
      x: centerX + size * Math.cos(angleRad),
      y: centerY + size * Math.sin(angleRad),
    });
  }
  return points.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
}

/**
 * ヘックスのグリッド座標 (q, r) - アキシャル座標系 - からピクセル座標 (x, y) へ変換
 * ポインティトップヘックス用
 * @param q 列 (アキシャル座標)
 * @param r 行 (アキシャル座標)
 * @param hexSize ヘックスのサイズ
 * @returns ピクセル座標 { x: number, y: number }
 */
export function hexToPixel(q: number, r: number, hexSize: number): { x: number; y: number } {
  const x = hexSize * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
  const y = hexSize * (3 / 2 * r);
  return { x, y };
}

export function getHexWidth(hexSize: number): number {
  return Math.sqrt(3) * hexSize;
}
export function getHexHeight(hexSize: number): number {
  return 2 * hexSize;
}

// --- 座標変換と距離計算のためのヘルパー ---

// Axial座標の型 (ローカルで使用する場合はエクスポート不要なことも)
interface AxialPoint { q: number; r: number; }
// Cube座標の型
interface Cube { x: number; y: number; z: number; }

// アキシャル座標をキューブ座標に変換
function axialToCube(q: number, r: number): Cube {
  const x = q;
  const z = r;
  const y = -x - z;
  return { x, y, z };
}

// キューブ座標をアキシャル座標に変換
function cubeToAxial(cube: Cube): AxialPoint { // 戻り値の型をAxialPointに
  const q = cube.x;
  const r = cube.z;
  return { q, r };
}

// 2つのキューブ座標間の距離を計算
function cubeDistance(a: Cube, b: Cube): number {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) / 2;
}

// 2つのキューブ座標間を線形補間
function cubeLerp(a: Cube, b: Cube, t: number): Cube {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

// 浮動小数点のキューブ座標を最も近い整数キューブ座標に丸める
function cubeRound(fracCube: Cube): Cube {
  let rX = Math.round(fracCube.x);
  let rY = Math.round(fracCube.y);
  let rZ = Math.round(fracCube.z);

  const xDiff = Math.abs(rX - fracCube.x);
  const yDiff = Math.abs(rY - fracCube.y);
  const zDiff = Math.abs(rZ - fracCube.z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rX = -rY - rZ;
  } else if (yDiff > zDiff) {
    rY = -rX - rZ;
  } else {
    rZ = -rX - rY;
  }
  return { x: rX, y: rY, z: rZ };
}

/**
 * 2つのヘックス間の距離を計算する (アキシャル座標入力)
 * @param q1 ヘックス1のq座標
 * @param r1 ヘックス1のr座標
 * @param q2 ヘックス2のq座標
 * @param r2 ヘックス2のr座標
 * @returns 距離 (ヘックス数)
 */
export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  const a = axialToCube(q1, r1);
  const b = axialToCube(q2, r2);
  return cubeDistance(a, b);
}

/**
 * 2つのヘックス間を直線で結ぶヘックスのリストを生成する (Axial座標)
 * start地点とend地点を含む。
 * @param startAxial 開始ヘックスのAxial座標
 * @param endAxial   終了ヘックスのAxial座標
 * @returns 経路上のヘックスのAxial座標の配列
 */
export function getAxialLine(startAxial: AxialPoint, endAxial: AxialPoint): AxialPoint[] {
  const N = hexDistance(startAxial.q, startAxial.r, endAxial.q, endAxial.r);
  if (N === 0) return [startAxial];

  const results: AxialPoint[] = [];
  const startCube = axialToCube(startAxial.q, startAxial.r);
  const endCube = axialToCube(endAxial.q, endAxial.r);

  for (let i = 0; i <= N; i++) {
    const t = N === 0 ? 0.0 : i / N;
    const interpolatedCube = cubeLerp(startCube, endCube, t);
    const roundedCube = cubeRound(interpolatedCube);
    results.push(cubeToAxial(roundedCube));
  }
  // 重複する可能性のあるヘックスを除去
  const uniqueResults: AxialPoint[] = [];
  const seen = new Set<string>();
  for (const hex of results) {
    const key = `${hex.q},${hex.r}`;
    if (!seen.has(key)) {
      uniqueResults.push(hex);
      seen.add(key);
    }
  }
  return uniqueResults;
}


/**
 * 2つのヘックス間を直線で結ぶヘックスのリストを生成する
 * (アキシャル座標入力、出力は論理座標のリスト {x, y})
 * start地点は含まず、end地点は含む。
 * @param startAxialQ 開始ヘックスのq座標
 * @param startAxialR 開始ヘックスのr座標
 * @param endAxialQ   終了ヘックスのq座標
 * @param endAxialR   終了ヘックスのr座標
 * @returns 経路上のヘックスの論理座標 {x, y} の配列
 */
export function getHexLinePath(
  startAxialQ: number, startAxialR: number,
  endAxialQ: number, endAxialR: number
): { x: number; y: number }[] { // 出力は論理座標
  const axialLine = getAxialLine({ q: startAxialQ, r: startAxialR }, { q: endAxialQ, r: endAxialR });
  // axialLine は始点と終点を含む。ここでは始点を除くパスが期待されているのでslice(1)
  // ただし、元の getHexLinePath の挙動 (i=1からループ) を見ると、
  // startとendが同じ場合、N=0となり空配列を返していた。
  // getAxialLineはN=0の場合、[startAxial]を返す。
  if (axialLine.length <= 1) return []; // スタートとエンドが同じか隣接なら、パスは不要 (または1点のみ)

  return axialLine.slice(1).map(axial => axialToLogical(axial.q, axial.r));
}

/**
 * 論理座標 (オフセット風のx,y) をアキシャル座標 (q,r) に変換する
 * "pointy top" で "odd-r" オフセットレイアウトを想定した論理座標からの変換
 * logicalX = q + floor(r/2)
 * logicalY = r
 * @param logicalX 論理X座標
 * @param logicalY 論理Y座標
 * @returns アキシャル座標 { q: number, r: number }
 */
export function logicalToAxial(logicalX: number, logicalY: number): AxialPoint { // 戻り値の型をAxialPointに
  const r = logicalY;
  const q = logicalX - Math.floor(r / 2); // "odd-r" pointy top
  return { q, r };
}

/**
 * アキシャル座標 (q,r) を論理座標 (オフセット風のx,y) に変換する
 * "pointy top" で "odd-r" オフセットレイアウトを想定
 * @param q アキシャルq座標
 * @param r アキシャルr座標
 * @returns 論理座標 { x: number, y: number }
 */
export function axialToLogical(q: number, r: number): { x: number; y: number } {
  const x = q + Math.floor(r / 2); // "odd-r" pointy top
  const y = r;
  return { x, y };
}


// --- A* 経路探索 ---
interface AStarNode {
  pos: AxialPoint;
  g: number; // スタートからの実際のコスト
  h: number; // ゴールまでの推定コスト (ヒューリスティック)
  f: number; // g + h
  parent: AStarNode | null;
}

const AXIAL_DIRECTIONS: AxialPoint[] = [
  { q: +1, r: 0 }, { q: +1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: +1 }, { q: 0, r: +1 },
];

function getHexDataFromMap(mapData: MapData, pos: AxialPoint): HexData | null {
  // MapDataのhexesのキーが "q,r" 形式であることを前提とする
  return mapData.hexes[`${pos.q},${pos.r}`] || null;
}

/**
 * A* 経路探索アルゴリズム (ヘックスグリッド版)
 * @param startAxial スタート地点 (Axial座標)
 * @param goalAxial ゴール地点 (Axial座標)
 * @param mapData マップデータ (地形情報を含む)
 * @param allUnitsOnMap 現在マップ上にいる全ユニット (衝突判定用)
 * @param movingUnitInstanceId 現在移動しようとしているユニットのID (自分自身との衝突を避けるため)
 * @returns ゴールまでの経路ヘックスリスト (AxialPoint[])。経路が見つからなければ空配列。
 *          リストの最初の要素はスタートの次のヘックス、最後の要素はゴール。
 */
export function findPathAStar(
  startAxial: AxialPoint,
  goalAxial: AxialPoint,
  mapData: MapData | null,
  allUnitsOnMap: PlacedUnit[], // PlacedUnitの型定義をインポートする必要がある
  movingUnitInstanceId: string
): AxialPoint[] {
  if (!mapData || !mapData.hexes) {
    console.warn("findPathAStar: mapData or mapData.hexes is null.");
    return [];
  }

  const openSet = new Map<string, AStarNode>(); // "q,r" -> Node
  const closedSet = new Set<string>(); // "q,r" をキーとする

  const startNode: AStarNode = {
    pos: startAxial,
    g: 0,
    h: hexDistance(startAxial.q, startAxial.r, goalAxial.q, goalAxial.r),
    f: hexDistance(startAxial.q, startAxial.r, goalAxial.q, goalAxial.r),
    parent: null,
  };
  openSet.set(`${startAxial.q},${startAxial.r}`, startNode);

  while (openSet.size > 0) {
    let currentNode: AStarNode | null = null;
    let currentKey = "";
    for (const [key, node] of openSet) {
      if (!currentNode || node.f < currentNode.f || (node.f === currentNode.f && node.h < currentNode.h)) {
        currentNode = node;
        currentKey = key;
      }
    }

    if (!currentNode) {
        // console.log("A* Error: No current node found in openSet, but openSet was not empty.");
        break; // 経路なし
    }


    // ゴールに到達
    if (currentNode.pos.q === goalAxial.q && currentNode.pos.r === goalAxial.r) {
      const path: AxialPoint[] = [];
      let temp: AStarNode | null = currentNode;
      while (temp && temp.parent) { // temp.parent をチェックしてスタートノード自体は含めない
        path.push(temp.pos);
        temp = temp.parent;
      }
      return path.reverse(); // スタートの次からゴールの経路
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    for (const dir of AXIAL_DIRECTIONS) {
      const neighborPos: AxialPoint = {
        q: currentNode.pos.q + dir.q,
        r: currentNode.pos.r + dir.r,
      };
      const neighborKey = `${neighborPos.q},${neighborPos.r}`;

      if (closedSet.has(neighborKey)) continue;

      const neighborHexData = getHexDataFromMap(mapData, neighborPos);
      if (!neighborHexData) continue; // マップ範囲外 (hexesに定義がなければ)

      const terrainCost = TERRAIN_MOVE_COSTS[neighborHexData.terrain];
      if (terrainCost === Infinity) continue; // 通行不可地形

      // 他のユニットによる衝突判定 (ゴール地点は占有されていても経路探索の対象とする)
      let isOccupiedByOtherUnit = false;
      if (!(neighborPos.q === goalAxial.q && neighborPos.r === goalAxial.r)) {
        for (const unit of allUnitsOnMap) {
          if (unit.instanceId === movingUnitInstanceId || unit.status === 'destroyed') continue;
          // PlacedUnitのpositionは論理座標なので、Axialに変換して比較
          const unitAxialPos = logicalToAxial(unit.position.x, unit.position.y);
          if (unitAxialPos.q === neighborPos.q && unitAxialPos.r === neighborPos.r) {
            isOccupiedByOtherUnit = true;
            break;
          }
        }
      }
      if (isOccupiedByOtherUnit) continue; // 他のユニットがいる場合は通行不可 (MVP)

      const gScore = currentNode.g + terrainCost; // 地形コストを加算
      let neighborNode = openSet.get(neighborKey);

      if (!neighborNode || gScore < neighborNode.g) {
        if (!neighborNode) {
          neighborNode = {
            pos: neighborPos,
            g: gScore,
            h: hexDistance(neighborPos.q, neighborPos.r, goalAxial.q, goalAxial.r),
            f: 0, // 後で計算
            parent: currentNode,
          };
        } else {
          neighborNode.g = gScore;
          neighborNode.parent = currentNode;
        }
        neighborNode.f = neighborNode.g + neighborNode.h;
        openSet.set(neighborKey, neighborNode);
      }
    }
  }
  // console.log(`A*: No path found from (${startAxial.q},${startAxial.r}) to (${goalAxial.q},${goalAxial.r})`);
  return []; // 経路が見つからなかった場合
}