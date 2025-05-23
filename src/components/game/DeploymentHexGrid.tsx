// src/components/game/DeploymentHexGrid.tsx
"use client";

import React from 'react';
import type { MapData } from '@/types/map';
import type { DeployedUnit } from '@/app/unit-deployment/page';
import { getHexCorners, hexToPixel, getHexWidth, getHexHeight } from '@/lib/hexUtils';

interface DeploymentHexGridProps {
  mapData: MapData | null;
  hexSize?: number;
  onHexClick: (q: number, r: number, logicalX: number, logicalY: number) => void;
  deployedUnits: DeployedUnit[];
  selectedUnitIcon?: string | null;
}

const DeploymentHexGrid: React.FC<DeploymentHexGridProps> = ({
  mapData,
  hexSize = 28,
  onHexClick,
  deployedUnits,
  selectedUnitIcon,
}) => {
  if (!mapData) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading map data...</div>;
  }

  const { rows: logicalRows, cols: logicalCols, deploymentArea } = mapData;

  // SVG全体のサイズとオフセットを計算するための準備
  let minPxX = Infinity;
  let maxPxX = -Infinity;
  let minPxY = Infinity;
  let maxPxY = -Infinity;

  const hexesToDraw: { q: number; r: number; logicalX: number; logicalY: number; center: { x: number; y: number }; corners: string }[] = [];

  // どの(q, r)の範囲を描画するかを決定する
  // "odd-r"オフセットレイアウトをアキシャル座標でエミュレートする場合、
  // logicalX = q + floor(r/2)
  // logicalY = r
  // これから q = logicalX - floor(r/2)
  for (let r = 0; r < logicalRows; r++) {
    for (let qOffset = 0; qOffset < logicalCols; qOffset++) {
      // logicalX が qOffset になるように q を計算
      const q = qOffset - Math.floor(r / 2);

      const logicalX = q + Math.floor(r / 2); // 再計算して確認 (これはqOffsetになるはず)
      const logicalY = r;

      // mapData の論理的な範囲を超えるものは描画しない
      if (logicalX < 0 || logicalX >= logicalCols || logicalY < 0 || logicalY >= logicalRows) {
        continue;
      }

      const center = hexToPixel(q, r, hexSize);
      const corners = getHexCorners(center.x, center.y, hexSize);
      hexesToDraw.push({ q, r, logicalX, logicalY, center, corners });

      // SVGの描画範囲を計算
      const cornerPoints = corners.split(' ').map(pair => pair.split(',').map(Number));
      cornerPoints.forEach(point => {
        minPxX = Math.min(minPxX, point[0]);
        maxPxX = Math.max(maxPxX, point[0]);
        minPxY = Math.min(minPxY, point[1]);
        maxPxY = Math.max(maxPxY, point[1]);
      });
    }
  }

  const svgPadding = hexSize * 0.5; // SVG境界のパディング
  const svgContentWidth = maxPxX - minPxX;
  const svgContentHeight = maxPxY - minPxY;
  const svgWidth = svgContentWidth + svgPadding * 2;
  const svgHeight = svgContentHeight + svgPadding * 2;

  // SVG内部の<g>要素のオフセット。描画内容が(0,0)から始まるように調整
  const groupTranslateX = -minPxX + svgPadding;
  const groupTranslateY = -minPxY + svgPadding;


  const isHexDeployable = (logicalX: number, logicalY: number): boolean => {
    return (
      logicalX >= deploymentArea.startX &&
      logicalX <= deploymentArea.endX &&
      logicalY >= deploymentArea.startY &&
      logicalY <= deploymentArea.endY
    );
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
              const hexKey = `${q}-${r}`; // アキシャル座標をキーに
              const deployedUnitOnHex = deployedUnits.find(
                u => u.position.x === logicalX && u.position.y === logicalY
              );

              return (
                <g
                  key={hexKey}
                  onClick={() => onHexClick(q, r, logicalX, logicalY)}
                  className="cursor-pointer group"
                >
                  <polygon
                    points={corners}
                    fill={
                      deployedUnitOnHex
                        ? 'rgba(75, 85, 99, 0.8)'
                        : isDeployable
                        ? 'rgba(52, 211, 153, 0.4)'
                        : 'rgba(107, 114, 128, 0.4)'
                    }
                    stroke="rgba(30, 41, 59, 0.7)"
                    strokeWidth="1"
                    className={`transition-colors duration-100 ${
                        isDeployable && !deployedUnitOnHex ? 'group-hover:fill-green-500 group-hover:fill-opacity-60' : ''
                    }`}
                  />
                  {deployedUnitOnHex && (
                    <text
                      x={center.x}
                      y={center.y}
                      fontSize={hexSize * 0.5}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      pointerEvents="none"
                      className="font-bold"
                    >
                      {deployedUnitOnHex.unitId.substring(0, 1).toUpperCase()}
                    </text>
                  )}
                  {isDeployable && !deployedUnitOnHex && selectedUnitIcon && (
                    <text
                      x={center.x}
                      y={center.y}
                      fontSize={hexSize * 0.4}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="rgba(255, 255, 255, 0.4)"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      pointerEvents="none"
                    >
                      {selectedUnitIcon}
                    </text>
                  )}
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