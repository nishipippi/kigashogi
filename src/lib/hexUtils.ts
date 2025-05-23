// src/lib/hexUtils.ts

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
    // 開始角度を調整してポインティトップにする (頂点が真上)
    // 0度を右向き、90度を上向きとする一般的な数学座標系の場合、60 * i
    // 0度を上向きとする場合、60 * i - 30 (または 60 * i + 30 や 60 * i + 90 など、基準による)
    // ここでは、Red Blob Games の記事などでよく使われる、頂点が水平線と30度の角度をなす向き（x軸に平行な辺が上下）ではなく、
    // 頂点が真上に来るようなポインティトップを想定した場合、60 * i - 30 (または +30) が一つの方法。
    // 0度 = 右, 30度 = 右上, 90度 = 上, 150度 = 左上, ...
    // ポインティトップ (頂点が上) の場合、最初の頂点は (centerX, centerY - size) に近い形
    const angleDeg = 60 * i - 30; // 最初の角が (size * cos(-30), size * sin(-30)) -> 右下方向から開始
                               // これだとフラットトップに近い。ポインティトップにするには最初の角度を調整
    // ポインティトップの場合、最初の頂点を真上(yがマイナス方向)にするなら、開始角度は -90度 or 270度
    // もしくは、60 * i のループで、各角度に -90度 (または +270度) を加える
    // Red Blob Games の Pointy Hexagon (https://www.redblobgames.com/grids/hexagons/#basics)
    // angle = PI / 180 * (60 * i + 30)
    const angleRad = Math.PI / 180 * (60 * i + 30); // Red Blob Games の Pointy Hex 準拠 (最初の角が右上30度)

    points.push({
      x: centerX + size * Math.cos(angleRad),
      y: centerY + size * Math.sin(angleRad),
    });
  }
  return points.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' '); // toFixedで精度を指定
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

// ヘックスの幅と高さを計算 (ポインティトップ)
export function getHexWidth(hexSize: number): number {
  return Math.sqrt(3) * hexSize;
}
export function getHexHeight(hexSize: number): number {
  return 2 * hexSize;
}

// --- 距離計算と経路探索のためのヘルパー ---

// キューブ座標の型
interface Cube { x: number; y: number; z: number; }

// アキシャル座標をキューブ座標に変換
function axialToCube(q: number, r: number): Cube {
    // x + y + z = 0 を満たすように
    const x = q;
    const z = r;
    const y = -x - z;
    return { x, y, z };
}

// キューブ座標をアキシャル座標に変換
function cubeToAxial(cube: Cube): { q: number; r: number } {
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
): { x: number; y: number }[] {
    const startCube = axialToCube(startAxialQ, startAxialR);
    const endCube = axialToCube(endAxialQ, endAxialR);
    const N = cubeDistance(startCube, endCube); // ステップ数

    if (N === 0) return []; // 開始と終了が同じなら空のパス

    const path: { x: number; y: number }[] = [];
    for (let i = 1; i <= N; i++) { // i=0は開始点なので、i=1から (次のヘックス)
        const interpolatedCube = cubeLerp(startCube, endCube, i / N);
        const roundedCube = cubeRound(interpolatedCube);
        const axialCoords = cubeToAxial(roundedCube);

        // アキシャル座標を論理座標 (いわゆるオフセット座標風のx,y) に変換
        // "pointy top" で "odd-r" オフセットレイアウトの場合:
        // x = q + (r - (r&1)) / 2  または x = q + floor(r/2)
        // y = r
        // 今回は x = q + floor(r/2) を採用
        const logicalX = axialCoords.q + Math.floor(axialCoords.r / 2);
        const logicalY = axialCoords.r;
        path.push({ x: logicalX, y: logicalY });
    }
    return path;
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
export function logicalToAxial(logicalX: number, logicalY: number): { q: number; r: number } {
    const r = logicalY;
    const q = logicalX - Math.floor(r / 2);
    return { q, r };
}

/**
 * アキシャル座標 (q,r) を論理座標 (オフセット風のx,y) に変換する
 * @param q アキシャルq座標
 * @param r アキシャルr座標
 * @returns 論理座標 { x: number, y: number }
 */
export function axialToLogical(q: number, r: number): { x: number; y: number } {
    const x = q + Math.floor(r / 2);
    const y = r;
    return { x, y };
}