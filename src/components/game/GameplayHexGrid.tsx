// src/components/game/GameplayHexGrid.tsx
"use client";

"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { MapData, StrategicPoint, HexData, TerrainType } from '@/types/map';
import { useGameSettingsStore, type PlacedUnit } from '@/stores/gameSettingsStore'; // ストアをインポート
import { getHexCorners, hexToPixel, logicalToAxial, axialToLogical, getHexWidth, getHexHeight } from '@/lib/hexUtils';
import { UNITS_MAP } from '@/gameData/units';

interface BulletEffect {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  weaponType: 'HE' | 'AP';
  startTime: number;
  duration: number; // ms
}

// LastSeenUnitInfo はストアで管理するため、ここでは不要
// interface LastSeenUnitInfo extends PlacedUnit {
//     lastSeenTime: number;
//     isLastSeen?: boolean;
// }


interface GameplayHexGridProps {
  mapData: MapData | null;
  hexSize?: number;
  placedUnits: PlacedUnit[]; // LastSeenUnitInfo はストアで管理するため、ここでは PlacedUnit のみ
  onHexClick?: (q: number, r: number, logicalX: number, logicalY: number, terrain: TerrainType, unitOnHex?: PlacedUnit, event?: React.MouseEvent<SVGGElement>) => void;
  selectedUnitInstanceId?: string | null;
  attackingPairs?: { visualId: string, attackerId: string, targetId: string, weaponType: 'HE' | 'AP' }[];
  // visibleEnemyInstanceIds はストアから取得するため不要
  strategicPoints: StrategicPoint[];
}

const GameplayHexGrid: React.FC<GameplayHexGridProps> = ({
  mapData,
  hexSize = 26,
  placedUnits,
  onHexClick,
  selectedUnitInstanceId,
  attackingPairs = [],
  strategicPoints,
}) => {
  const { playerVisibilityMap, lastKnownEnemyPositions } = useGameSettingsStore(); // ストアから視界情報を取得
  const [bulletEffects, setBulletEffects] = useState<BulletEffect[]>([]);
  const animationFrameId = useRef<number | null>(null);

  // attackingPairs の変更を監視し、新しいエフェクトを追加
  useEffect(() => {
    console.log("attackingPairs updated:", attackingPairs);
    if (attackingPairs.length > 0) {
      const newEffects: BulletEffect[] = [];
      attackingPairs.forEach(pair => {
        const attacker = placedUnits.find(u => u.instanceId === pair.attackerId);
        const target = placedUnits.find(u => u.instanceId === pair.targetId);

        if (attacker && target) {
          const attackerAxial = logicalToAxial(attacker.position.x, attacker.position.y);
          const targetAxial = logicalToAxial(target.position.x, target.position.y);

          const attackerCenterPx = hexToPixel(attackerAxial.q, attackerAxial.r, hexSize);
          const targetCenterPx = hexToPixel(targetAxial.q, targetAxial.r, hexSize);

          // 既に存在するエフェクトかチェック (visualIdで判定)
          const existingEffect = bulletEffects.find(effect => effect.id === pair.visualId);
          if (!existingEffect) {
            console.log(`Adding new bullet effect: ${pair.visualId}`);
            newEffects.push({
              id: pair.visualId,
              startX: attackerCenterPx.x,
              startY: attackerCenterPx.y,
              endX: targetCenterPx.x,
              endY: targetCenterPx.y,
              weaponType: pair.weaponType,
              startTime: performance.now(),
              duration: 300, // 弾のアニメーション時間 (ms)
            });
          }
        }
      });
      setBulletEffects(prevEffects => [...prevEffects, ...newEffects]);
    }
  }, [attackingPairs, placedUnits, hexSize]); // bulletEffects を依存配列から削除

  // アニメーションループ
  const animateBullets = useCallback(() => {
    setBulletEffects(prevEffects => {
      const now = performance.now();
      const updatedEffects = prevEffects.map(effect => {
        const elapsed = now - effect.startTime;
        const progress = Math.min(elapsed / effect.duration, 1); // 0から1にクランプ

        if (progress >= 1) {
          console.log(`Bullet effect finished: ${effect.id}`);
          return null; // アニメーション終了
        }

        return { ...effect }; // 位置は描画時に計算
      }).filter(effect => effect !== null) as BulletEffect[];

      if (updatedEffects.length > 0) {
        animationFrameId.current = requestAnimationFrame(animateBullets);
      } else {
        animationFrameId.current = null;
      }
      return updatedEffects;
    });
  }, []);

  useEffect(() => {
    if (bulletEffects.length > 0 && animationFrameId.current === null) {
      console.log("Starting bullet animation loop.");
      animationFrameId.current = requestAnimationFrame(animateBullets);
    }

    return () => {
      if (animationFrameId.current) {
        console.log("Cleaning up bullet animation loop.");
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [bulletEffects, animateBullets]);

  if (!mapData) {
    return <div className="flex items-center justify-center h-full text-gray-400">Rendering Map...</div>;
  }

  const { rows: logicalRows, cols: logicalCols, hexes: mapHexesData } = mapData;
  let minPxX = Infinity, maxPxX = -Infinity, minPxY = Infinity, maxPxY = -Infinity;
  const hexesToDraw: { q: number; r: number; logicalX: number; logicalY: number; center: { x: number; y: number }; corners: string, terrain: TerrainType }[] = [];

  if (mapHexesData) {
    for (const key in mapHexesData) {
        const hexDef = mapHexesData[key];
        if (hexDef) {
            const { q, r, terrain } = hexDef;
            const logical = axialToLogical(q, r);

            const center = hexToPixel(q, r, hexSize);
            const corners = getHexCorners(center.x, center.y, hexSize);
            hexesToDraw.push({ q, r, logicalX: logical.x, logicalY: logical.y, center, corners, terrain: terrain });

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
    switch (terrainType) {
      case 'plains': return 'rgba(134, 239, 172, 0.3)';
      case 'forest': return 'rgba(34, 197, 94, 0.4)';
      case 'hills': return 'rgba(203, 213, 225, 0.4)';
      case 'road': return 'rgba(148, 163, 184, 0.5)';
      case 'city': return 'rgba(168, 162, 158, 0.5)';
      case 'water': return 'rgba(56, 189, 248, 0.4)';
      case 'mountain': return 'rgba(100, 116, 139, 0.6)';
      case 'swamp': return 'rgba(82, 82, 91, 0.5)';
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
              const hexKey = `${q},${r}`; // playerVisibilityMap のキーと一致させる
              const unitOnHex = placedUnits.find(
                u => u.position.x === logicalX && u.position.y === logicalY && u.status !== 'destroyed'
              );
              const unitDef = unitOnHex ? UNITS_MAP.get(unitOnHex.unitId) : null;

              // ユニットの視界判定
              const isUnitVisible = unitOnHex && (unitOnHex.owner === 'player' || playerVisibilityMap[hexKey]);
              // 最終確認位置の判定
              const isLastSeenPosition = !isUnitVisible && lastKnownEnemyPositions[unitOnHex?.instanceId || ''] &&
                                         lastKnownEnemyPositions[unitOnHex?.instanceId || ''].x === logicalX &&
                                         lastKnownEnemyPositions[unitOnHex?.instanceId || ''].y === logicalY;


              let directionLine = null;
              // ユニットが視界内にある場合のみ描画
              if (unitOnHex && unitOnHex.orientation !== undefined && unitDef && isUnitVisible) {
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

              return (
                <g
                  key={hexKey}
                  onClick={(event) => onHexClick?.(q, r, logicalX, logicalY, terrain, unitOnHex, event)}
                  onContextMenu={(event) => onHexClick?.(q, r, logicalX, logicalY, terrain, unitOnHex, event)}
                  className="cursor-pointer group"
                >
                  <polygon
                    points={corners}
                    fill={getTerrainColor(terrain)}
                    stroke="rgba(55, 65, 81, 0.6)"
                    strokeWidth="1"
                    className="group-hover:fill-opacity-50 transition-opacity"
                  />
                  {unitOnHex && unitDef && isUnitVisible && ( // プレイヤーユニットは常に表示、敵ユニットは視界内のみ
                    <g opacity={unitOnHex.justHit ? 0.7 : 1} >
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
                  {/* 最終確認位置のマーカー (敵ユニットが最後に視認された位置) */}
                  {isLastSeenPosition && (
                    <circle
                      cx={center.x}
                      cy={center.y}
                      r={hexSize * 0.1}
                      fill="rgba(255, 255, 0, 0.5)" // 黄色で半透明のマーカー
                      stroke="yellow"
                      strokeWidth="1"
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            })}

            {/* 戦略拠点の描画 */}
            {strategicPoints.map(sp => {
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
                    {sp.name ? sp.name.substring(0,2).toUpperCase() : 'SP'}
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

            {/* 弾のエフェクトの描画 */}
            {bulletEffects.map(effect => {
              const now = performance.now();
              const elapsed = now - effect.startTime;
              const progress = Math.min(elapsed / effect.duration, 1);

              // 弾の現在位置を補間
              const currentX = effect.startX + (effect.endX - effect.startX) * progress;
              const currentY = effect.startY + (effect.endY - effect.startY) * progress;

              const bulletColor = effect.weaponType === 'AP' ? "rgb(255, 200, 0)" : "rgb(255, 0, 0)"; // APは黄色、HEは赤

              console.log(`Drawing bullet ${effect.id} at (${currentX}, ${currentY}) with progress ${progress}`);

              return (
                <circle
                  key={effect.id}
                  cx={currentX}
                  cy={currentY}
                  r={hexSize * 0.1} // 弾のサイズ
                  fill={bulletColor}
                  opacity={1 - progress} // 進行とともに透明度を上げる
                  pointerEvents="none"
                />
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
