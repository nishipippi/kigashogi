// src/components/game/GameplayHexGrid.tsx
"use client";

import React from 'react';
import type { MapData, StrategicPoint } from '@/types/map'; // StrategicPoint 型をインポート
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import { getHexCorners, hexToPixel, logicalToAxial } from '@/lib/hexUtils'; // logicalToAxial もインポート
import { UNITS_MAP } from '@/gameData/units';

interface GameplayHexGridProps {
  mapData: MapData | null;
  hexSize?: number;
  placedUnits: PlacedUnit[];
  onHexClick?: (q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit, event?: React.MouseEvent<SVGGElement>) => void;
  selectedUnitInstanceId?: string | null;
  attackingPairs?: { attackerId: string, targetId: string, weaponType: 'HE' | 'AP' }[];
}

const GameplayHexGrid: React.FC<GameplayHexGridProps> = ({
  mapData,
  hexSize = 28, // デフォルト値を設定 (GameplayContent で指定した値が優先される)
  placedUnits,
  onHexClick,
  selectedUnitInstanceId,
  attackingPairs = [],
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

  const getTerrainColor = (logicalX: number, logicalY: number) => {
    // TODO: mapData.tiles[logicalY][logicalX].terrainType に基づいて色を返す
    return 'rgba(107, 114, 128, 0.2)'; // Default plain
  };

  return (
    <div className="w-full h-full overflow-auto bg-gray-600 p-1 rounded-md flex items-center justify-center">
      {mapData && hexesToDraw.length > 0 ? (
        <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
          <defs>
            <marker id="arrowhead-player" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,2 L0,4 z" fill="hsl(180, 100%, 60%)" />
            </marker>
            <marker id="arrowhead-enemy" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,2 L0,4 z" fill="hsl(0, 100%, 60%)" />
            </marker>
          </defs>
          <g transform={`translate(${groupTranslateX}, ${groupTranslateY})`}>
            {hexesToDraw.map(({ q, r, logicalX, logicalY, center, corners }) => {
              const hexKey = `${q}-${r}`;
              const unitOnHex = placedUnits.find(
                u => u.position.x === logicalX && u.position.y === logicalY
              );
              const unitDef = unitOnHex ? UNITS_MAP.get(unitOnHex.unitId) : null;

              let directionLine = null;
              if (unitOnHex && unitOnHex.orientation !== undefined) {
                // ゲーム内の orientation は 0度=右、反時計回りに増加 (0-359度) と仮定
                const angleRad = unitOnHex.orientation * (Math.PI / 180);
                const lineLength = hexSize * 0.4; // 線の長さを調整
                const x1 = center.x;
                const y1 = center.y;
                const x2 = center.x + lineLength * Math.cos(angleRad);
                const y2 = center.y + lineLength * Math.sin(angleRad); // SVGのY軸は下向きなのでsinはそのまま

                directionLine = (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={unitOnHex.owner === 'player' ? "hsl(180, 100%, 70%)" : "hsl(0, 100%, 70%)"}
                    strokeWidth="2" // 線の太さ
                    pointerEvents="none"
                    markerEnd={unitOnHex.owner === 'player' ? "url(#arrowhead-player)" : "url(#arrowhead-enemy)"}
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
                    stroke="rgba(55, 65, 81, 0.6)"
                    strokeWidth="1"
                    className="group-hover:fill-opacity-50 transition-opacity"
                  />
                  {unitOnHex && unitDef && (
                    <g className={unitOnHex.justHit ? 'animate-pulse-quick' : ''}>
                      <text
                        x={center.x}
                        y={center.y}
                        fontSize={hexSize * 0.55}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={
                            unitOnHex.justHit ? "yellow" : // 被弾時は黄色 (目立つように)
                            (unitOnHex.owner === 'player' ? "rgb(165, 243, 252)" : "rgb(250, 160, 220)")
                        }
                        stroke={selectedUnitInstanceId === unitOnHex.instanceId ? "yellow" : "black"}
                        strokeWidth={selectedUnitInstanceId === unitOnHex.instanceId ? 1.5 : 0.5}
                        pointerEvents="none"
                        className="font-semibold"
                      >
                        {unitDef.icon || unitDef.name.substring(0,1)}
                      </text>
                      {directionLine}
                       {unitDef.stats.hp > 0 && unitOnHex.currentHp !== undefined && (
                         <rect
                            x={center.x - hexSize * 0.4}
                            y={center.y + hexSize * 0.32} // HPバーの位置を少し調整
                            width={hexSize * 0.8 * (unitOnHex.currentHp / unitDef.stats.hp)}
                            height={hexSize * 0.12} // HPバーの太さを少し調整
                            fill={
                                unitOnHex.currentHp / unitDef.stats.hp > 0.6 ? 'rgba(74, 222, 128, 0.9)' : // green-400
                                unitOnHex.currentHp / unitDef.stats.hp > 0.3 ? 'rgba(250, 204, 21, 0.9)' :  // yellow-400
                                'rgba(239, 68, 68, 0.9)'   // red-500
                            }
                            stroke="rgba(0,0,0,0.7)"
                            strokeWidth="0.5"
                            rx="1" // 角を少し丸める
                            pointerEvents="none"
                        />
                       )}
                    </g>
                  )}
                </g>
              );
            })}

            {/* 戦略拠点の描画 */}
            {mapData.strategicPoints?.map(sp => {
              const spAxial = logicalToAxial(sp.x, sp.y);
              const center = hexToPixel(spAxial.q, spAxial.r, hexSize);
              let spColor = "rgba(150, 150, 150, 0.7)"; // Neutral: grey
              if (sp.owner === 'player') spColor = "rgba(59, 130, 246, 0.7)"; // Player: blue
              else if (sp.owner === 'enemy') spColor = "rgba(239, 68, 68, 0.7)"; // Enemy: red

              return (
                <g key={sp.id} transform={`translate(${center.x}, ${center.y})`} pointerEvents="none"> {/* SP自体はクリック対象外にする */}
                  <circle
                    r={hexSize * 0.3} // サイズ調整
                    fill={spColor}
                    stroke="rgba(255, 255, 255, 0.9)"
                    strokeWidth="1.5"
                  />
                  <text
                    fontSize={hexSize * 0.28} // サイズ調整
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="rgba(255, 255, 255, 0.9)"
                    fontWeight="bold"
                  >
                    SP
                  </text>
                </g>
              );
            })}

            {/* 攻撃エフェクトの描画 */}
            {attackingPairs.map(pair => {
              const attacker = placedUnits.find(u => u.instanceId === pair.attackerId);
              const target = placedUnits.find(u => u.instanceId === pair.targetId);

              if (attacker && target) {
                const attackerAxial = logicalToAxial(attacker.position.x, attacker.position.y);
                const targetAxial = logicalToAxial(target.position.x, target.position.y);
                const attackerCenterPx = hexToPixel(attackerAxial.q, attackerAxial.r, hexSize);
                const targetCenterPx = hexToPixel(targetAxial.q, targetAxial.r, hexSize);
                const lineColor = pair.weaponType === 'AP' ? "rgba(255, 50, 50, 0.9)" : "rgba(255, 180, 50, 0.9)";
                const effectKey = `attack-${attacker.instanceId}-${target.instanceId}-${Date.now()}`; // キーをユニークに

                return (
                  <line
                    key={effectKey}
                    x1={attackerCenterPx.x}
                    y1={attackerCenterPx.y}
                    x2={targetCenterPx.x}
                    y2={targetCenterPx.y}
                    stroke={lineColor}
                    strokeWidth="3.5"
                    strokeDasharray="5 3"
                    pointerEvents="none"
                  />
                );
              }
              return null;
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