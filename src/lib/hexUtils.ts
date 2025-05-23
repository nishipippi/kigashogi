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

interface Cube { x: number; y: number; z: number; }

function axialToCube(q: number, r: number): Cube {
  const x = q;
  const z = r;
  const y = -x - z;
  return { x, y, z };
}

function cubeToAxial(cube: Cube): { q: number; r: number } {
  const q = cube.x;
  const r = cube.z;
  return { q, r };
}

function cubeDistance(a: Cube, b: Cube): number {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) / 2;
}

function cubeLerp(a: Cube, b: Cube, t: number): Cube {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

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

export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  const a = axialToCube(q1, r1);
  const b = axialToCube(q2, r2);
  return cubeDistance(a, b);
}

export function getHexLinePath(
  startAxialQ: number, startAxialR: number,
  endAxialQ: number, endAxialR: number
): { x: number; y: number }[] { // 出力は論理座標
  const startCube = axialToCube(startAxialQ, startAxialR);
  const endCube = axialToCube(endAxialQ, endAxialR);
  const N = cubeDistance(startCube, endCube);

  if (N === 0) return [];

  const path: { x: number; y: number }[] = [];
  for (let i = 1; i <= N; i++) {
    const interpolatedCube = cubeLerp(startCube, endCube, i / N);
    const roundedCube = cubeRound(interpolatedCube);
    const axialCoords = cubeToAxial(roundedCube);
    path.push(axialToLogical(axialCoords.q, axialCoords.r)); // Axialから論理座標へ変換
  }
  return path;
}

export function logicalToAxial(logicalX: number, logicalY: number): { q: number; r: number } {
  const r = logicalY;
  const q = logicalX - Math.floor(r / 2); // "odd-r" pointy top
  return { q, r };
}

export function axialToLogical(q: number, r: number): { x: number; y: number } {
  const x = q + Math.floor(r / 2); // "odd-r" pointy top
  const y = r;
  return { x, y };
}


// --- A* 経路探索 ---
interface AxialPoint { q: number; r: number; }

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
  allUnitsOnMap: PlacedUnit[],
  movingUnitInstanceId: string
): AxialPoint[] {
  if (!mapData || !mapData.hexes) return [];

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

    if (!currentNode) break; // 経路なし

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
      if (!neighborHexData) continue; // マップ範囲外

      const terrainCost = TERRAIN_MOVE_COSTS[neighborHexData.terrain];
      if (terrainCost === Infinity) continue; // 通行不可

      // 他のユニットによる衝突判定 (ゴール地点は占有されていても可とする場合がある)
      let isOccupied = false;
      if (!(neighborPos.q === goalAxial.q && neighborPos.r === goalAxial.r)) {
        for (const unit of allUnitsOnMap) {
          if (unit.instanceId === movingUnitInstanceId || unit.status === 'destroyed') continue;
          const unitAxialPos = logicalToAxial(unit.position.x, unit.position.y);
          if (unitAxialPos.q === neighborPos.q && unitAxialPos.r === neighborPos.r) {
            isOccupied = true;
            break;
          }
        }
      }
      if (isOccupied) continue; // 他のユニットがいる場合は通行不可 (MVP)

      const gScore = currentNode.g + terrainCost;
      let neighborNode = openSet.get(neighborKey);

      if (!neighborNode || gScore < neighborNode.g) {
        if (!neighborNode) {
          neighborNode = {
            pos: neighborPos,
            g: gScore,
            h: hexDistance(neighborPos.q, neighborPos.r, goalAxial.q, goalAxial.r),
            f: 0,
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
  return []; // 経路が見つからなかった場合
}