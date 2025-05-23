// src/components/game/DeploymentHexGrid.tsx
"use client";

import React from 'react';
import type { MapData } from '@/types/map';
import type { InitialDeployedUnitConfig } from '@/stores/gameSettingsStore';
import { getHexCorners, hexToPixel, logicalToAxial, axialToLogical } from '@/lib/hexUtils';
import { UNITS_MAP } from '@/gameData/units'; // UNITS_MAP をインポート

interface DeploymentHexGridProps {
  mapData: MapData | null;
  hexSize?: number;
  onHexClick: (q: number, r: number, logicalX: number, logicalY: number) => void;
  deployedUnits: InitialDeployedUnitConfig[];
  selectedUnitIcon?: string | null;
  // deploymentOwner?: 'player' | 'enemy'; // 将来的に敵AIの配置にも使う場合
}

const DeploymentHexGrid: React.FC<DeploymentHexGridProps> = ({
  mapData,
  hexSize = 26, // デフォルト値を26に設定 (gameplay/page.tsx の呼び出し元に合わせるか、ここで調整)
  onHexClick,
  deployedUnits,
  selectedUnitIcon,
  // deploymentOwner = 'player', // デフォルトはプレイヤー
}) => {
  if (!mapData) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading map data...</div>;
  }

  const { rows: logicalRows, cols: logicalCols, deploymentAreas } = mapData;

  let minPxX = Infinity;
  let maxPxX = -Infinity;
  let minPxY = Infinity;
  let maxPxY = -Infinity;

  const hexesToDraw: { q: number; r: number; logicalX: number; logicalY: number; center: { x: number; y: number }; corners: string }[] = [];

  // マップ全体のヘックスを描画（Axial座標基準でループ）
  // 描画範囲はマップのrows/colsから推測するが、正確にはマップデータにmin/max q,rを持つ方が良い
  // ここでは、論理座標の範囲からおおよそのAxial範囲を計算する (簡易的)
  // odd-rの場合:
  // r_min = 0, r_max = logicalRows - 1
  // q_min at r=0 is 0, q_max at r=0 is logicalCols -1
  // q_min at r=logicalRows-1 is -(floor((logicalRows-1)/2)), q_max is logicalCols -1 - floor((logicalRows-1)/2)
  // より安全なのは、mapData.hexes があればそのキーからq,rの範囲を決定すること。
  // 今回はGameplayHexGridと同様のループ構造にする。

  for (let r = 0; r < logicalRows; r++) {
    const rOffset = Math.floor(r / 2); // For odd-r offset
    for (let qIter = -rOffset; qIter < logicalCols - rOffset; qIter++) {
      const q = qIter;
      const logical = axialToLogical(q, r);

      // 論理座標がマップの cols, rows の範囲外になることがあるのでチェック
      // (特にqIterのループ範囲を広く取った場合)
      // ただし、正確なマップ境界は hexes の定義に依存するべき
      if (logical.x < 0 || logical.x >= logicalCols || logical.y < 0 || logical.y >= logicalRows) {
        // continue; // マップの論理的なグリッド範囲外は描画しない (オプショナル)
      }
      // 実際に mapData.hexes に定義されているヘックスのみ描画する方が正確
      const hexKeyForCheck = `${q},${r}`;
      if (mapData.hexes && !mapData.hexes[hexKeyForCheck]) {
          // continue; // mapData.hexesに定義がなければ描画しない
      }


      const center = hexToPixel(q, r, hexSize);
      const corners = getHexCorners(center.x, center.y, hexSize);
      hexesToDraw.push({ q, r, logicalX: logical.x, logicalY: logical.y, center, corners });

      const cornerPoints = corners.split(' ').map(pair => pair.split(',').map(Number));
      cornerPoints.forEach(point => {
        minPxX = Math.min(minPxX, point[0]);
        maxPxX = Math.max(maxPxX, point[0]);
        minPxY = Math.min(minPxY, point[1]);
        maxPxY = Math.max(maxPxY, point[1]);
      });
    }
  }

  const svgPadding = hexSize * 0.5;
  const svgContentWidth = maxPxX - minPxX;
  const svgContentHeight = maxPxY - minPxY;

  // hexesToDrawが空の場合のデフォルトサイズを設定
  const svgWidth = hexesToDraw.length > 0 ? svgContentWidth + svgPadding * 2 : 300;
  const svgHeight = hexesToDraw.length > 0 ? svgContentHeight + svgPadding * 2 : 200;

  const groupTranslateX = hexesToDraw.length > 0 ? -minPxX + svgPadding : 0;
  const groupTranslateY = hexesToDraw.length > 0 ? -minPxY + svgPadding : 0;


  const isHexDeployable = (logicalX: number, logicalY: number): boolean => {
    // mapData.deploymentAreas.player (または enemy) のリストに logicalX, logicalY が含まれるかチェック
    // const areaToCheck = deploymentOwner === 'player' ? deploymentAreas.player : deploymentAreas.enemy;
    const areaToCheck = deploymentAreas.player; // MVPではプレイヤーの配置エリアのみ考慮
    if (!areaToCheck) return false;
    return areaToCheck.some(coord => coord.x === logicalX && coord.y === logicalY);
  };

  return (
    <div className="w-full h-full overflow-auto bg-gray-500 p-1 rounded-md flex items-center justify-center">
      {hexesToDraw.length > 0 ? (
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <g transform={`translate(${groupTranslateX}, ${groupTranslateY})`}>
            {hexesToDraw.map(({ q, r, logicalX, logicalY, center, corners }) => {
              const isDeployable = isHexDeployable(logicalX, logicalY);
              const hexKey = `${q}-${r}`; // キーはアキシャル座標で
              const deployedUnitOnHex = deployedUnits.find(
                u => u.position.x === logicalX && u.position.y === logicalY
              );

              return (
                <g
                  key={hexKey}
                  onClick={() => onHexClick(q, r, logicalX, logicalY)} // クリック時にはアキシャルも渡す
                  className="cursor-pointer group"
                >
                  <polygon
                    points={corners}
                    fill={
                      deployedUnitOnHex
                        ? 'rgba(75, 85, 99, 0.8)' // ユニット配置済み
                        : isDeployable
                        ? 'rgba(52, 211, 153, 0.4)' // 配置可能エリア
                        : 'rgba(107, 114, 128, 0.4)' // 配置不可エリア
                    }
                    stroke="rgba(30, 41, 59, 0.7)" // グリッド線の色
                    strokeWidth="1"
                    className={`transition-colors duration-100 ${
                        isDeployable && !deployedUnitOnHex ? 'group-hover:fill-green-500 group-hover:fill-opacity-60' : ''
                    }`}
                  />
                  {deployedUnitOnHex && (
                    <text
                      x={center.x}
                      y={center.y}
                      fontSize={hexSize * 0.6} // アイコンサイズ調整
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      pointerEvents="none"
                      className="font-bold"
                    >
                      {/* ユニット定義からアイコンを取得 */}
                      {UNITS_MAP.get(deployedUnitOnHex.unitId)?.icon || deployedUnitOnHex.unitId.substring(0,1).toUpperCase()}
                    </text>
                  )}
                  {isDeployable && !deployedUnitOnHex && selectedUnitIcon && (
                    <text
                      x={center.x}
                      y={center.y}
                      fontSize={hexSize * 0.5} // ホバーアイコンサイズ調整
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="rgba(255, 255, 255, 0.4)"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      pointerEvents="none"
                    >
                      {selectedUnitIcon}
                    </text>
                  )}
                   {/* デバッグ用座標表示 */}
                   {/*
                  <text x={center.x} y={center.y + hexSize * 0.35} fontSize={hexSize * 0.2} fill="#eee" textAnchor="middle" dominantBaseline="hanging">{`L:${logicalX},${logicalY}`}</text>
                  <text x={center.x} y={center.y + hexSize * 0.55} fontSize={hexSize * 0.2} fill="#eee" textAnchor="middle" dominantBaseline="hanging">{`A:${q},${r}`}</text>
                  */}
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <div className="text-gray-300">No map to display or map data is invalid.</div>
      )}
    </div>
  );
};

export default DeploymentHexGrid;