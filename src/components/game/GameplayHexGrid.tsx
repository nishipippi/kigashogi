// src/components/game/GameplayHexGrid.tsx
"use client";

import React from 'react';
import type { MapData } from '@/types/map';
import type { PlacedUnit } from '@/stores/gameSettingsStore'; // ゲームプレイ中のユニット型
import { getHexCorners, hexToPixel } from '@/lib/hexUtils';
import { UNITS_MAP } from '@/gameData/units'; // ユニット定義の参照用

interface GameplayHexGridProps {
  mapData: MapData | null;
  hexSize?: number; // ヘックスのサイズ（中心から頂点までの距離）
  placedUnits: PlacedUnit[];
  onHexClick?: (q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit, event?: React.MouseEvent<SVGGElement>) => void;
  selectedUnitInstanceId?: string | null; // 選択中ユニットのインスタンスID
}

const GameplayHexGrid: React.FC<GameplayHexGridProps> = ({
  mapData,
  hexSize = 28, // デフォルトのヘックスサイズ
  placedUnits,
  onHexClick,
  selectedUnitInstanceId,
}) => {
  if (!mapData) {
    return <div className="flex items-center justify-center h-full text-gray-400">Rendering Map...</div>;
  }

  const { rows: logicalRows, cols: logicalCols } = mapData;

  let minPxX = Infinity;
  let maxPxX = -Infinity;
  let minPxY = Infinity;
  let maxPxY = -Infinity;

  const hexesToDraw: { q: number; r: number; logicalX: number; logicalY: number; center: { x: number; y: number }; corners: string }[] = [];

  for (let r = 0; r < logicalRows; r++) {
    for (let qOffset = 0; qOffset < logicalCols; qOffset++) {
      const q = qOffset - Math.floor(r / 2);
      const logicalX = q + Math.floor(r / 2);
      const logicalY = r;

      if (logicalX < 0 || logicalX >= logicalCols || logicalY < 0 || logicalY >= logicalRows) {
        continue;
      }

      const center = hexToPixel(q, r, hexSize);
      const corners = getHexCorners(center.x, center.y, hexSize);
      hexesToDraw.push({ q, r, logicalX, logicalY, center, corners });

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
  const svgWidth = hexesToDraw.length > 0 ? svgContentWidth + svgPadding * 2 : 200; // データがない場合は最小サイズ
  const svgHeight = hexesToDraw.length > 0 ? svgContentHeight + svgPadding * 2 : 200;

  const groupTranslateX = hexesToDraw.length > 0 ? -minPxX + svgPadding : svgPadding;
  const groupTranslateY = hexesToDraw.length > 0 ? -minPxY + svgPadding : svgPadding;

  const getTerrainColor = (logicalX: number, logicalY: number) => {
    // 将来的には mapData.tiles[logicalY][logicalX].terrainType などで判定
    // 例: if (mapData.tiles && mapData.tiles[logicalY]?.[logicalX]?.terrainType === 'forest') return 'rgba(34, 139, 34, 0.3)';
    return 'rgba(107, 114, 128, 0.2)'; // Default plain color
  };

  return (
    <div className="w-full h-full overflow-auto bg-gray-600 p-1 rounded-md flex items-center justify-center">
      {hexesToDraw.length > 0 ? (
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <g transform={`translate(${groupTranslateX}, ${groupTranslateY})`}>
            {hexesToDraw.map(({ q, r, logicalX, logicalY, center, corners }) => {
              const hexKey = `${q}-${r}`; // Use axial coords for key as they are unique for grid cells
              const unitOnHex = placedUnits.find(
                u => u.position.x === logicalX && u.position.y === logicalY
              );
              const unitDef = unitOnHex ? UNITS_MAP.get(unitOnHex.unitId) : null;

              let directionLine = null;
              if (unitOnHex && unitOnHex.orientation !== undefined && unitDef) {
                // 0度をSVGの上方向 (Y軸負方向) とする場合の調整
                // 数学座標系 (0度がX軸正方向) からSVG座標系への変換を考慮
                // (orientation - 90) で0度を上にする
                const angleRad = (unitOnHex.orientation - 90) * (Math.PI / 180);
                const lineLength = hexSize * 0.4; // 線の長さ
                const x2 = center.x + lineLength * Math.cos(angleRad);
                const y2 = center.y + lineLength * Math.sin(angleRad);
                directionLine = (
                  <line
                    x1={center.x}
                    y1={center.y}
                    x2={x2}
                    y2={y2}
                    stroke={unitOnHex.owner === 'player' ? "cyan" : "magenta"}
                    strokeWidth="2"
                    pointerEvents="none"
                  />
                );
              }

              return (
                <g
                  key={hexKey}
                  onClick={(event) => onHexClick?.(q, r, logicalX, logicalY, unitOnHex, event)}
                  onContextMenu={(event) => onHexClick?.(q, r, logicalX, logicalY, unitOnHex, event)}
                  className="cursor-pointer group"
                >
                  <polygon
                    points={corners}
                    fill={getTerrainColor(logicalX, logicalY)}
                    stroke="rgba(55, 65, 81, 0.6)" // Grid line color
                    strokeWidth="1"
                    className="group-hover:fill-opacity-50 transition-opacity" // Simple hover effect
                  />
                  {unitOnHex && unitDef && (
                    <g>
                      {/* Unit Icon/Text */}
                      <text
                        x={center.x}
                        y={center.y - hexSize * 0.1} // HPバーを考慮して少し上に
                        fontSize={hexSize * 0.50} // 少し小さくしてHPバーのスペース確保
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={unitOnHex.owner === 'player' ? "rgb(165, 243, 252)" : "rgb(250, 160, 220)"}
                        stroke={selectedUnitInstanceId === unitOnHex.instanceId ? "yellow" : "black"}
                        strokeWidth={selectedUnitInstanceId === unitOnHex.instanceId ? 1.5 : 0.5}
                        pointerEvents="none"
                        className="font-semibold select-none" // テキスト選択不可に
                      >
                        {unitDef.icon || unitDef.name.substring(0, 1).toUpperCase()}
                      </text>
                      {/* Direction Line */}
                      {directionLine}
                      {/* HP Bar */}
                      {unitDef.stats.hp > 0 && (
                        <g pointerEvents="none">
                          <rect // HPバー背景
                            x={center.x - hexSize * 0.4}
                            y={center.y + hexSize * 0.25} // アイコンの下に配置
                            width={hexSize * 0.8}
                            height={hexSize * 0.12}
                            fill="rgba(0,0,0,0.5)"
                            rx="1" // 角を少し丸める
                          />
                          <rect // 実際のHP
                            x={center.x - hexSize * 0.4}
                            y={center.y + hexSize * 0.25}
                            width={Math.max(0, hexSize * 0.8 * (unitOnHex.currentHp / unitDef.stats.hp))}
                            height={hexSize * 0.12}
                            fill={
                              unitOnHex.currentHp / unitDef.stats.hp > 0.6 ? 'rgb(74, 222, 128)' : // green-400
                              unitOnHex.currentHp / unitDef.stats.hp > 0.3 ? 'rgb(250, 204, 21)' :  // yellow-400
                              'rgb(248, 113, 113)' // red-400
                            }
                            rx="1"
                          />
                        </g>
                      )}
                    </g>
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

export default GameplayHexGrid;