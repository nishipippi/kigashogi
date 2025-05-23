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
    const angleRad = Math.PI / 180 * (60 * i - 30);
    points.push({
      x: centerX + size * Math.cos(angleRad),
      y: centerY + size * Math.sin(angleRad),
    });
  }
  return points.map(p => `${p.x},${p.y}`).join(' ');
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

// ヘックスの幅と高さを計算
export function getHexWidth(hexSize: number): number {
  return Math.sqrt(3) * hexSize;
}
export function getHexHeight(hexSize: number): number {
  return 2 * hexSize;
}

/**
 * 2つのヘックス間の距離を計算する (アキシャル座標)
 * @param q1 ヘックス1のq座標
 * @param r1 ヘックス1のr座標
 * @param q2 ヘックス2のq座標
 * @param r2 ヘックス2のr座標
 * @returns 距離 (ヘックス数)
 */
export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  // キューブ座標に変換して距離を計算するのが一般的
  const cq1 = q1;
  const cr1 = r1;
  const cs1 = -q1 - r1;

  const cq2 = q2;
  const cr2 = r2;
  const cs2 = -q2 - r2;

  return (Math.abs(cq1 - cq2) + Math.abs(cr1 - cr2) + Math.abs(cs1 - cs2)) / 2;
}

// 論理座標 (オフセット風) からアキシャル座標へ変換するヘルパー (必要なら)
export function logicalToAxial(logicalX: number, logicalY: number): { q: number; r: number } {
    const r = logicalY;
    const q = logicalX - Math.floor(r / 2);
    return { q, r };
}