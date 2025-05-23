// src/components/game/GameplayHexGrid.tsx
"use client";

import React from 'react';
import type { MapData } from '@/types/map';
import type { PlacedUnit } from '@/stores/gameSettingsStore'; // ゲームプレイ中のユニット型
import { getHexCorners, hexToPixel, logicalToAxial } from '@/lib/hexUtils'; // logicalToAxial もインポート
import { UNITS_MAP } from '@/gameData/units';

interface GameplayHexGridProps {
  mapData: MapData | null;
  hexSize?: number;
  placedUnits: PlacedUnit[];
  onHexClick?: (q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit, event?: React.MouseEvent<SVGGElement>) => void;
  selectedUnitInstanceId?: string | null;
  attackingPairs?: { attackerId: string, targetId: string, weaponType: 'HE' | 'AP' }[]; // 攻撃中のペア情報
}

const GameplayHexGrid: React.FC<GameplayHexGridProps> = ({
  mapData,
  hexSize = 28,
  placedUnits,
  onHexClick,
  selectedUnitInstanceId,
  attackingPairs = [], // デフォルトは空配列
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
  const svgWidth = hexesToDraw.length > 0 ? svgContentWidth + svgPadding * 2 : 200; // データがない場合の最小幅
  const svgHeight = hexesToDraw.length > 0 ? svgContentHeight + svgPadding * 2 : 200; // データがない場合の最小高
  const groupTranslateX = hexesToDraw.length > 0 ? -minPxX + svgPadding : svgPadding;
  const groupTranslateY = hexesToDraw.length > 0 ? -minPxY + svgPadding : svgPadding;

  const getTerrainColor = (logicalX: number, logicalY: number) => {
    // TODO: Implement terrain type based coloring from mapData.tiles
    return 'rgba(120, 134, 128, 0.2)'; // Default plain color (少し濃くした)
  };

  return (
    <div className="w-full h-full overflow-auto bg-gray-600 p-1 rounded-md flex items-center justify-center">
      {hexesToDraw.length > 0 ? (
        <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
          <g transform={`translate(${groupTranslateX}, ${groupTranslateY})`}>
            {hexesToDraw.map(({ q, r, logicalX, logicalY, center, corners }) => {
              const hexKey = `${q}-${r}`; // アキシャル座標をキーに
              const unitOnHex = placedUnits.find(
                u => u.position.x === logicalX && u.position.y === logicalY
              );
              const unitDef = unitOnHex ? UNITS_MAP.get(unitOnHex.unitId) : null;

              let directionLine = null;
              if (unitOnHex && unitOnHex.orientation !== undefined) {
                const angleRad = (unitOnHex.orientation - 90) * (Math.PI / 180); // 0度が真上を想定
                const lineLength = hexSize * 0.4;
                const x2 = center.x + lineLength * Math.cos(angleRad);
                const y2 = center.y + lineLength * Math.sin(angleRad);
                directionLine = <line x1={center.x} y1={center.y} x2={x2} y2={y2} stroke={unitOnHex.owner === 'player' ? "cyan" : "magenta"} strokeWidth="2" pointerEvents="none" />;
              }

              return (
                <g
                  key={hexKey}
                  onClick={(event) => onHexClick?.(q, r, logicalX, logicalY, unitOnHex, event)}
                  onContextMenu={(event) => onHexClick?.(q, r, logicalX, logicalY, unitOnHex, event)} // 右クリックも同じハンドラへ
                  className="cursor-pointer group"
                >
                  <polygon
                    points={corners}
                    fill={getTerrainColor(logicalX, logicalY)}
                    stroke="rgba(55, 65, 81, 0.7)"
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
                        fill={unitOnHex.owner === 'player' ? "rgb(165, 243, 252)" : "rgb(250, 160, 220)"}
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
                            y={center.y + hexSize * 0.3}
                            width={Math.max(0, hexSize * 0.8 * (unitOnHex.currentHp / unitDef.stats.hp))}
                            height={hexSize * 0.1}
                            fill={
                                unitOnHex.currentHp / unitDef.stats.hp > 0.6 ? 'green' :
                                unitOnHex.currentHp / unitDef.stats.hp > 0.3 ? 'yellow' : 'red'
                            }
                            stroke="black"
                            strokeWidth="0.5"
                            pointerEvents="none"
                        />
                      )}
                    </g>
                  )}
                </g>
              );
            })}

            {/* 攻撃エフェクトの描画 */}
            {attackingPairs.map(pair => {
              const attacker = placedUnits.find(u => u.instanceId === pair.attackerId);
              const target = placedUnits.find(u => u.instanceId === pair.targetId);

              if (attacker && target) {
                // アキシャル座標を取得
                const attackerAxial = logicalToAxial(attacker.position.x, attacker.position.y);
                const targetAxial = logicalToAxial(target.position.x, target.position.y);

                // ピクセル座標に変換
                const attackerCenterPx = hexToPixel(attackerAxial.q, attackerAxial.r, hexSize);
                const targetCenterPx = hexToPixel(targetAxial.q, targetAxial.r, hexSize);

                const lineColor = pair.weaponType === 'AP' ? "rgba(255, 50, 50, 0.9)" : "rgba(255, 180, 50, 0.9)";
                const effectKey = `attack-${attacker.instanceId}-${target.instanceId}-${Date.now()}`; // ユニークキー

                return (
                  <line
                    key={effectKey}
                    x1={attackerCenterPx.x}
                    y1={attackerCenterPx.y}
                    x2={targetCenterPx.x}
                    y2={targetCenterPx.y}
                    stroke={lineColor}
                    strokeWidth="3"
                    strokeDasharray="5 3"
                    pointerEvents="none"
                    // SVG <animate> を使うか、CSS で制御するか、Reactの状態管理で短時間表示する
                    // ここでは GameplayContent 側で attackingPairs のリストを短時間で更新することを想定
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