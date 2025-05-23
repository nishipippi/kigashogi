// src/components/game/GameplayHexGrid.tsx
"use client";

import React from 'react';
import type { MapData, StrategicPoint } from '@/types/map'; // StrategicPoint をインポート
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import { getHexCorners, hexToPixel, logicalToAxial, getHexWidth, getHexHeight } from '@/lib/hexUtils';
import { UNITS_MAP } from '@/gameData/units';

interface GameplayHexGridProps {
  mapData: MapData | null;
  hexSize?: number;
  placedUnits: PlacedUnit[]; // 表示すべき全ユニット (自軍、発見済み敵軍、最終確認位置の敵軍)
  onHexClick?: (q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit, event?: React.MouseEvent<SVGGElement>) => void;
  selectedUnitInstanceId?: string | null;
  attackingPairs?: { attackerId: string, targetId: string, weaponType: 'HE' | 'AP' }[];
  visibleEnemyInstanceIds?: Set<string>; // 視界による半透明表示に使用する場合
}

const GameplayHexGrid: React.FC<GameplayHexGridProps> = ({
  mapData,
  hexSize = 26, // デフォルト値を設定 (GameplayContentでの指定と合わせる)
  placedUnits,
  onHexClick,
  selectedUnitInstanceId,
  attackingPairs = [],
  // visibleEnemyInstanceIds = new Set(),
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
  const svgWidth = svgContentWidth > 0 ? svgContentWidth + svgPadding * 2 : hexSize * 5; // 最小幅確保
  const svgHeight = svgContentHeight > 0 ? svgContentHeight + svgPadding * 2 : hexSize * 5; // 最小高さ確保
  const groupTranslateX = svgContentWidth > 0 ? -minPxX + svgPadding : hexSize;
  const groupTranslateY = svgContentHeight > 0 ? -minPxY + svgPadding : hexSize;

  const getTerrainColor = (logicalX: number, logicalY: number) => {
    // TODO: mapData.tiles から地形情報を取得して色分け
    return 'rgba(107, 114, 128, 0.2)'; // Default plain
  };

  return (
    <div className="w-full h-full overflow-auto bg-gray-600 p-1 rounded-md flex items-center justify-center">
      {mapData && hexesToDraw.length > 0 ? (
        <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
          <defs>
            <marker id="arrowhead-player" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,2 L0,4 z" fill="hsl(180, 100%, 70%)" />
            </marker>
            <marker id="arrowhead-enemy" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,2 L0,4 z" fill="hsl(0, 100%, 70%)" />
            </marker>
          </defs>
          <g transform={`translate(${groupTranslateX}, ${groupTranslateY})`}>
            {hexesToDraw.map(({ q, r, logicalX, logicalY, center, corners }) => {
              const hexKey = `${q}-${r}`;
              const unitOnHex = placedUnits.find(
                u => u.position.x === logicalX && u.position.y === logicalY && u.status !== 'destroyed'
              );
              const unitDef = unitOnHex ? UNITS_MAP.get(unitOnHex.unitId) : null;

              let directionLine = null;
              if (unitOnHex && unitOnHex.orientation !== undefined && unitDef) {
                  // ゲーム内の orientation は 0度=右、反時計回りに増加 (0-359度) と仮定
                  const angleRad = unitOnHex.orientation * (Math.PI / 180);
                  const lineLength = hexSize * 0.45;
                  const x1 = center.x;
                  const y1 = center.y;
                  const x2 = center.x + lineLength * Math.cos(angleRad);
                  const y2 = center.y + lineLength * Math.sin(angleRad); // SVG Y軸は下向き

                  directionLine = (
                      <line
                          x1={x1} y1={y1} x2={x2} y2={y2}
                          stroke={unitOnHex.owner === 'player' ? "hsl(180, 100%, 70%)" : "hsl(0, 100%, 70%)"}
                          strokeWidth="2" // 線の太さ調整
                          pointerEvents="none"
                          markerEnd={unitOnHex.owner === 'player' ? "url(#arrowhead-player)" : "url(#arrowhead-enemy)"}
                      />
                  );
              }

              // 最終確認位置のユニットの半透明表示判定 (簡易版: justHitでない敵ユニットで、現在時刻との差がない場合)
              // より正確には、GameplayContentから「現在視認できている敵ユニットIDリスト」を渡して判定する
              const isLastSeen = unitOnHex && unitOnHex.owner === 'enemy' && unitOnHex.hitTimestamp === 0 && !unitOnHex.justHit;


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
                    <g opacity={isLastSeen ? 0.5 : (unitOnHex.justHit ? 0.7 : 1)} > {/* 被弾時や最終確認時にopacity調整 */}
                      <text
                        x={center.x}
                        y={center.y}
                        fontSize={hexSize * 0.55}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={
                            unitOnHex.justHit && unitOnHex.owner === 'player' ? "orange" :
                            unitOnHex.justHit && unitOnHex.owner === 'enemy' ? "yellow" :
                            (unitOnHex.owner === 'player' ? "rgb(165, 243, 252)" : "rgb(250, 160, 220)")
                        }
                        stroke={selectedUnitInstanceId === unitOnHex.instanceId ? "yellow" : "black"}
                        strokeWidth={selectedUnitInstanceId === unitOnHex.instanceId ? 1.5 : 0.5}
                        pointerEvents="none"
                        className="font-semibold"
                      >
                        {unitDef.icon || unitDef.name.substring(0,1).toUpperCase()}
                      </text>
                      {directionLine}
                      {unitOnHex.currentHp > 0 && unitDef.stats.hp > 0 && ( // HPバー
                           <rect
                                x={center.x - hexSize * 0.4}
                                y={center.y + hexSize * 0.32} // HPバーの位置調整
                                width={hexSize * 0.8 * (unitOnHex.currentHp / unitDef.stats.hp)}
                                height={hexSize * 0.12} // HPバーの高さ調整
                                fill={unitOnHex.currentHp / unitDef.stats.hp > 0.6 ? 'green' : unitOnHex.currentHp / unitDef.stats.hp > 0.3 ? 'orange' : 'red'}
                                stroke="rgba(0,0,0,0.5)"
                                strokeWidth="0.5"
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
              let spColor = "grey";
              if (sp.owner === 'player') spColor = "blue";
              else if (sp.owner === 'enemy') spColor = "red";

              return (
                <g key={sp.id} transform={`translate(${center.x}, ${center.y})`} pointerEvents="none">
                  <circle
                    r={hexSize * 0.35}
                    fill={spColor}
                    stroke="white"
                    strokeWidth="1.5"
                    opacity="0.6"
                  />
                  <text
                    fontSize={hexSize * 0.3}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="white"
                    fontWeight="bold"
                  >
                    SP
                  </text>
                  {/* 占領進捗ゲージ */}
                  {sp.captureProgress !== undefined && sp.captureProgress > 0 && sp.captureProgress < 100 && (
                    <g>
                      <rect
                        x={-hexSize * 0.3} y={hexSize * 0.15}
                        width={hexSize * 0.6} height={hexSize * 0.1}
                        fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5"
                      />
                      <rect
                        x={-hexSize * 0.3} y={hexSize * 0.15}
                        width={(hexSize * 0.6 * sp.captureProgress) / 100} height={hexSize * 0.1}
                        fill={sp.capturingPlayer === 'player' ? "blue" : (sp.capturingPlayer === 'enemy' ? "red" : "transparent")}
                      />
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
                const attackerAxial = logicalToAxial(attacker.position.x, attacker.position.y);
                const targetAxial = logicalToAxial(target.position.x, target.position.y);
                const attackerCenterPx = hexToPixel(attackerAxial.q, attackerAxial.r, hexSize);
                const targetCenterPx = hexToPixel(targetAxial.q, targetAxial.r, hexSize);
                const lineColor = pair.weaponType === 'AP' ? "rgba(255, 100, 100, 0.8)" : "rgba(255, 165, 0, 0.8)";
                return (
                  <line
                    key={`attack-${attacker.instanceId}-${target.instanceId}`}
                    x1={attackerCenterPx.x} y1={attackerCenterPx.y}
                    x2={targetCenterPx.x} y2={targetCenterPx.y}
                    stroke={lineColor} strokeWidth="3" strokeDasharray="4 2" pointerEvents="none"
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