// src/lib/mapGenerator.ts
import type { MapData, HexData, TerrainType } from '@/types/map';
import { TERRAIN_MOVE_COSTS } from '@/types/map'; // 通行不可判定などに使用
import { axialToLogical, logicalToAxial } from './hexUtils'; // 座標変換が必要な場合

// 各地形タイプの出現確率の重み (合計が1でなくても良い、相対的な重み)
// 例: 平地が出やすく、山や水は出にくい
const TERRAIN_WEIGHTS: Record<TerrainType, number> = {
  plains: 10,
  forest: 3,
  hills: 2,
  road: 0, // 道路はランダム生成ではなく、後から追加する方が自然かも
  city: 0, // 同上
  water: 1,
  mountain: 0.5,
  swamp: 1,
};

// 通行可能な地形タイプのみをランダム生成の対象とする (オプション)
const GENERATABLE_TERRAINS = (Object.keys(TERRAIN_WEIGHTS) as TerrainType[]).filter(
  type => TERRAIN_WEIGHTS[type] > 0 && TERRAIN_MOVE_COSTS[type] !== Infinity
);

// 重み付きでランダムに地形タイプを選択する関数
function getRandomTerrainTypeWeighted(): TerrainType {
  const weightedTerrains: TerrainType[] = [];
  for (const terrain of GENERATABLE_TERRAINS) {
    const weight = TERRAIN_WEIGHTS[terrain] || 0;
    for (let i = 0; i < weight * 10; i++) { // 重みを整数倍して配列に追加
      weightedTerrains.push(terrain);
    }
  }
  if (weightedTerrains.length === 0) return 'plains'; // フォールバック
  return weightedTerrains[Math.floor(Math.random() * weightedTerrains.length)];
}


/**
 * 指定されたマップデータにランダムな地形情報を生成して割り当てる
 * @param baseMapData 基本的なマップ設定 (rows, cols など) を持つ MapData オブジェクト
 * @returns 地形情報が追加された MapData オブジェクト
 */
export function generateRandomMapHexes(baseMapData: Omit<MapData, 'hexes'>): Record<string, HexData> {
  const newHexes: Record<string, HexData> = {};
  const { rows, cols } = baseMapData;

  for (let r = 0; r < rows; r++) {
    const rOffset = Math.floor(r / 2); // "odd-r" pointy top
    for (let qIter = -rOffset; qIter < cols - rOffset; qIter++) {
      const q = qIter;
      // const logical = axialToLogical(q, r); // 論理座標も必要なら

      // マップの境界チェック (厳密にはマップ形状によるが、ここでは矩形と仮定)
      // axialToLogicalで論理座標に変換してからcols, rowsで判定するのがより正確
      const logicalCoords = axialToLogical(q, r);
      if (logicalCoords.x < 0 || logicalCoords.x >= cols || logicalCoords.y < 0 || logicalCoords.y >= rows) {
          // continue; // マップ範囲外のヘックスは生成しない
      }
      // ただし、cols, rows が論理座標系での最大範囲を示している場合、
      // このループの qIter の範囲設定でほぼカバーされるはず。
      // 厳密なマップ形状データがあればそれに基づくべき。

      const terrainType = getRandomTerrainTypeWeighted();
      newHexes[`${q},${r}`] = { q, r, terrain: terrainType };
    }
  }
  return newHexes;
}

/**
 * 与えられたマップデータに、ランダム生成されたhexes情報を追加または上書きする
 * @param map MapDataオブジェクト
 * @returns 更新されたMapDataオブジェクト
 */
export function randomizeMapTerrain(map: MapData): MapData {
    const randomHexes = generateRandomMapHexes(map);
    return {
        ...map,
        hexes: randomHexes,
    };
}