// src/components/game/GameplayHexGrid.tsx
"use client";

import React from 'react';
import type { MapData, StrategicPoint, HexData } from '@/types/map'; // StrategicPoint, HexData をインポート
import type { PlacedUnit } from '@/stores/gameSettingsStore';
import { getHexCorners, hexToPixel, logicalToAxial, axialToLogical, getHexWidth, getHexHeight } from '@/lib/hexUtils'; // axialToLogical を追加
import { UNITS_MAP } from '@/gameData/units';

// gameplay/page.tsx から渡される LastSeenUnitInfo の型 (もしあれば)
// PlacedUnit と共通部分が多い場合は、GameplayHexGridProps の placedUnits の型を
// (PlacedUnit | LastSeenUnitInfo)[] のようにする
interface LastSeenUnitInfo extends PlacedUnit {
    lastSeenTime: number;
    isLastSeen?: boolean;
}


interface GameplayHexGridProps {
  mapData: MapData | null;
  hexSize?: number;
  placedUnits: (PlacedUnit | LastSeenUnitInfo)[]; // isLastSeen を考慮
  onHexClick?: (q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit, event?: React.MouseEvent<SVGGElement>) => void;
  selectedUnitInstanceId?: string | null;
  attackingPairs?: { attackerId: string, targetId: string, weaponType: 'HE' | 'AP' }[];
  visibleEnemyInstanceIds?: Set<string>;
  strategicPoints: StrategicPoint[]; // ★★★ この行を追加 ★★★
}

const GameplayHexGrid: React.FC<GameplayHexGridProps> = ({
  mapData,
  hexSize = 26,
  placedUnits,
  onHexClick,
  selectedUnitInstanceId,
  attackingPairs = [],
  visibleEnemyInstanceIds = new Set(), // デフォルト値を設定
  strategicPoints, // propsとして受け取る
}) => {
  if (!mapData) {
    return <div className="flex items-center justify-center h-full text-gray-400">Rendering Map...</div>;
  }

  const { rows: logicalRows, cols: logicalCols, hexes: mapHexesData } = mapData; // hexes も取得
  let minPxX = Infinity, maxPxX = -Infinity, minPxY = Infinity, maxPxY = -Infinity;
  const hexesToDraw: { q: number; r: number; logicalX: number; logicalY: number; center: { x: number; y: number }; corners: string, terrain: string }[] = [];

  // mapHexesData がある場合のみヘックスを描画
  if (mapHexesData) {
    for (const key in mapHexesData) {
        const hexDef = mapHexesData[key];
        if (hexDef) {
            const { q, r, terrain } = hexDef;
            const logical = axialToLogical(q, r); // アキシャルから論理座標へ

            // マップの rows/cols を超えるものは描画しない (オプショナル: MapData.hexes が正確なら不要)
            // if (logical.x < 0 || logical.x >= logicalCols || logical.y < 0 || logical.y >= logicalRows) continue;

            const center = hexToPixel(q, r, hexSize);
            const corners = getHexCorners(center.x, center.y, hexSize);
            hexesToDraw.push({ q, r, logicalX: logical.x, logicalY: logical.y, center, corners, terrain: terrain }); // terrain情報も追加

            const cornerPoints = corners.split(' ').map(pair => pair.split(',').map(Number));
            cornerPoints.forEach(point => {
                minPxX = Math.min(minPxX, point[0]); maxPxX = Math.max(maxPxX, point[0]);
                minPxY = Math.min(minPxY, point[1]); maxPxY = Math.max(maxPxY, point[1]);
            });
        }
    }
  }


  const svgPadding = hexSize * 0.5;
  const svgContentWidth = maxPxX - minPxX;
  const svgContentHeight = maxPxY - minPxY;
  const svgWidth = svgContentWidth > 0 ? svgContentWidth + svgPadding * 2 : hexSize * 5;
  const svgHeight = svgContentHeight > 0 ? svgContentHeight + svgPadding * 2 : hexSize * 5;
  const groupTranslateX = svgContentWidth > 0 ? -minPxX + svgPadding : hexSize;
  const groupTranslateY = svgContentHeight > 0 ? -minPxY + svgPadding : hexSize;

  const getTerrainColor = (terrainType: string) => {
    // types/map.ts の TERRAIN_COLORS のような定義を参照する
    switch (terrainType) {
      case 'plains': return 'rgba(134, 239, 172, 0.3)'; // Light green
      case 'forest': return 'rgba(34, 197, 94, 0.4)';  // Darker green
      case 'hills': return 'rgba(203, 213, 225, 0.4)'; // Light gray
      case 'road': return 'rgba(148, 163, 184, 0.5)';   // Gray
      case 'city': return 'rgba(168, 162, 158, 0.5)';   // Stone gray
      case 'water': return 'rgba(56, 189, 248, 0.4)';   // Blue
      case 'mountain': return 'rgba(100, 116, 139, 0.6)';// Dark gray
      case 'swamp': return 'rgba(82, 82, 91, 0.5)';     // Muddy
      default: return 'rgba(107, 114, 128, 0.2)';
    }
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
            {hexesToDraw.map(({ q, r, logicalX, logicalY, center, corners, terrain }) => {
              const hexKey = `${q}-${r}`;
              // PlacedUnit と LastSeenUnitInfo の型を区別するために型ガードを使用
              const unitOnHex = placedUnits.find(
                u => u.position.x === logicalX && u.position.y === logicalY && u.status !== 'destroyed'
              ) as PlacedUnit | LastSeenUnitInfo | undefined; // キャストで型を明示

              const unitDef = unitOnHex ? UNITS_MAP.get(unitOnHex.unitId) : null;

              let directionLine = null;
              if (unitOnHex && unitOnHex.orientation !== undefined && unitDef) {
                  const angleRad = unitOnHex.orientation * (Math.PI / 180);
                  const lineLength = hexSize * 0.45;
                  const x1 = center.x;
                  const y1 = center.y;
                  const x2 = center.x + lineLength * Math.cos(angleRad);
                  const y2 = center.y + lineLength * Math.sin(angleRad);
                  directionLine = (
                      <line
                          x1={x1} y1={y1} x2={x2} y2={y2}
                          stroke={unitOnHex.owner === 'player' ? "hsl(180, 100%, 70%)" : "hsl(0, 100%, 70%)"}
                          strokeWidth="2"
                          pointerEvents="none"
                          markerEnd={unitOnHex.owner === 'player' ? "url(#arrowhead-player)" : "url(#arrowhead-enemy)"}
                      />
                  );
              }

              // visibleEnemyInstanceIds を使用して、現在視認できていない敵ユニットを半透明にする
              const isActuallyVisible = unitOnHex && (unitOnHex.owner === 'player' || (visibleEnemyInstanceIds && visibleEnemyInstanceIds.has(unitOnHex.instanceId)));
              // isLastSeen は (PlacedUnit | LastSeenUnitInfo) 型のプロパティなのでアクセス可能
              const isMarkedAsLastSeen = unitOnHex && 'isLastSeen' in unitOnHex && unitOnHex.isLastSeen;


              return (
                <g
                  key={hexKey}
                  onClick={(event) => onHexClick?.(q, r, logicalX, logicalY, unitOnHex as PlacedUnit, event)} // unitOnHex を PlacedUnit にキャスト
                  onContextMenu={(event) => onHexClick?.(q, r, logicalX, logicalY, unitOnHex as PlacedUnit, event)}
                  className="cursor-pointer group"
                >
                  <polygon
                    points={corners}
                    fill={getTerrainColor(terrain)} // terrain を使用
                    stroke="rgba(55, 65, 81, 0.6)"
                    strokeWidth="1"
                    className="group-hover:fill-opacity-50 transition-opacity" // fill-opacity は Tailwind にないので注意 (CSSで定義するか、opacityクラスを使う)
                  />
                  {unitOnHex && unitDef && (
                    <g opacity={isMarkedAsLastSeen && !isActuallyVisible ? 0.4 : (unitOnHex.justHit ? 0.7 : 1)} >
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
                      {unitOnHex.currentHp > 0 && unitDef.stats.hp > 0 && (
                           <rect
                                x={center.x - hexSize * 0.4}
                                y={center.y + hexSize * 0.32}
                                width={hexSize * 0.8 * (unitOnHex.currentHp / unitDef.stats.hp)}
                                height={hexSize * 0.12}
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
            {strategicPoints.map(sp => { // propsから受け取った strategicPoints を使用
              const spAxial = logicalToAxial(sp.x, sp.y); // 戦略拠点の座標も論理座標と仮定
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
                    {sp.name ? sp.name.substring(0,2).toUpperCase() : 'SP'} {/* name があれば表示 */}
                  </text>
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
                    key={`attack-${attacker.instanceId}-${target.instanceId}-${Date.now()}`} // よりユニークなキー
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