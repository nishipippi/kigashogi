// src/components/game/GameplayHexGrid.tsx
"use client";

import React from 'react';
import type { MapData } from '@/types/map';
import type { PlacedUnit } from '@/stores/gameSettingsStore'; // ゲームプレイ中のユニット型
import { getHexCorners, hexToPixel } from '@/lib/hexUtils';
import { UNITS_MAP } from '@/gameData/units'; // ユニット定義の参照用

interface GameplayHexGridProps {
  mapData: MapData | null;
  hexSize?: number;
  placedUnits: PlacedUnit[];
  onHexClick?: (q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit) => void; // ユニット選択用
  selectedUnitInstanceId?: string | null; // 選択中ユニットのインスタンスID
}

const GameplayHexGrid: React.FC<GameplayHexGridProps> = ({
  mapData,
  hexSize = 28,
  placedUnits,
  onHexClick,
  selectedUnitInstanceId,
}) => {
  if (!mapData) {
    return <div className="flex items-center justify-center h-full text-gray-400">Rendering Map...</div>;
  }

  const { rows: logicalRows, cols: logicalCols } = mapData;
  let minPxX = Infinity, maxPxX = -Infinity, minPxY = Infinity, maxPxY = -Infinity;
  const hexesToDraw: { q: number; r: number; logicalX: number; logicalY: number; center: { x: number; y: number }; corners: string }[] = [];

  for (let r = 0; r < logicalRows; r++) {
    for (let qOffset = 0; qOffset < logicalCols; qOffset++) {
      const q = qOffset - Math.floor(r / 2);
      const logicalX = q + Math.floor(r / 2);
      const logicalY = r;
      if (logicalX < 0 || logicalX >= logicalCols || logicalY < 0 || logicalY >= logicalRows) continue;

      const center = hexToPixel(q, r, hexSize);
      const corners = getHexCorners(center.x, center.y, hexSize);
      hexesToDraw.push({ q, r, logicalX, logicalY, center, corners });
      const cornerPoints = corners.split(' ').map(pair => pair.split(',').map(Number));
      cornerPoints.forEach(point => {
        minPxX = Math.min(minPxX, point[0]); maxPxX = Math.max(maxPxX, point[0]);
        minPxY = Math.min(minPxY, point[1]); maxPxY = Math.max(maxPxY, point[1]);
      });
    }
  }

  const svgPadding = hexSize * 0.5;
  const svgContentWidth = maxPxX - minPxX;
  const svgContentHeight = maxPxY - minPxY;
  const svgWidth = svgContentWidth + svgPadding * 2;
  const svgHeight = svgContentHeight + svgPadding * 2;
  const groupTranslateX = -minPxX + svgPadding;
  const groupTranslateY = -minPxY + svgPadding;

  // 仮の地形の色 (将来的にはMapDataから取得)
  const getTerrainColor = (logicalX: number, logicalY: number) => {
    // if (mapData.tiles && mapData.tiles[logicalY] && mapData.tiles[logicalY][logicalX]) {
    //    const terrain = mapData.tiles[logicalY][logicalX].terrainType;
    //    if (terrain === 'forest') return 'rgba(34, 139, 34, 0.3)'; // Forest example
    //    if (terrain === 'mountain') return 'rgba(139, 69, 19, 0.4)'; // Mountain example
    // }
    return 'rgba(107, 114, 128, 0.2)'; // Default plain
  };

  return (
    <div className="w-full h-full overflow-auto bg-gray-600 p-1 rounded-md flex items-center justify-center">
      {hexesToDraw.length > 0 ? (
        <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
          <g transform={`translate(${groupTranslateX}, ${groupTranslateY})`}>
            {hexesToDraw.map(({ q, r, logicalX, logicalY, center, corners }) => {
              const hexKey = `${q}-${r}`;
              const unitOnHex = placedUnits.find(
                u => u.position.x === logicalX && u.position.y === logicalY
              );
              const unitDef = unitOnHex ? UNITS_MAP.get(unitOnHex.unitId) : null;

              // ユニットの向きを描画するための線 (仮)
              let directionLine = null;
              if (unitOnHex && unitOnHex.orientation !== undefined) {
                const angleRad = (unitOnHex.orientation * 60 - 90) * (Math.PI / 180); // 0:上, 1:右上, ...
                const lineLength = hexSize * 0.4;
                const x2 = center.x + lineLength * Math.cos(angleRad);
                const y2 = center.y + lineLength * Math.sin(angleRad);
                directionLine = <line x1={center.x} y1={center.y} x2={x2} y2={y2} stroke={unitOnHex.owner === 'player' ? "cyan" : "magenta"} strokeWidth="2" pointerEvents="none" />;
              }


              return (
                <g
                  key={hexKey}
                  onClick={() => onHexClick?.(q, r, logicalX, logicalY, unitOnHex)}
                  className="cursor-pointer group"
                >
                  <polygon
                    points={corners}
                    fill={getTerrainColor(logicalX, logicalY)}
                    stroke="rgba(55, 65, 81, 0.6)" // グリッド線の色
                    strokeWidth="1"
                    className="group-hover:fill-opacity-50 transition-opacity"
                  />
                  {unitOnHex && unitDef && (
                    <g>
                      <text
                        x={center.x}
                        y={center.y}
                        fontSize={hexSize * 0.55}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={unitOnHex.owner === 'player' ? "rgb(165, 243, 252)" : "rgb(250, 160, 220)"} // Player: light cyan, Enemy: light magenta
                        stroke={selectedUnitInstanceId === unitOnHex.unitId /* TODO: instanceId */ ? "yellow" : "black"} // 選択中ユニットの枠線
                        strokeWidth={selectedUnitInstanceId === unitOnHex.unitId /* TODO: instanceId */ ? 1.5 : 0.5}
                        pointerEvents="none"
                        className="font-semibold"
                      >
                        {unitDef.icon || unitDef.name.substring(0,1)}
                      </text>
                      {directionLine}
                       {/* HPバー (簡易) */}
                       <rect
                            x={center.x - hexSize * 0.4}
                            y={center.y + hexSize * 0.3}
                            width={hexSize * 0.8 * (unitOnHex.currentHp / unitDef.stats.hp)}
                            height={hexSize * 0.1}
                            fill={unitOnHex.currentHp / unitDef.stats.hp > 0.6 ? 'green' : unitOnHex.currentHp / unitDef.stats.hp > 0.3 ? 'yellow' : 'red'}
                            stroke="black"
                            strokeWidth="0.5"
                            pointerEvents="none"
                        />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <div className="text-gray-300">No map to display.</div>
      )}
    </div>
  );
};
export default GameplayHexGrid;