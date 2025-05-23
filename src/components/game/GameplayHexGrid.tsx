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
  onHexClick?: (q: number, r: number, logicalX: number, logicalY: number, unitOnHex?: PlacedUnit, event?: React.MouseEvent<SVGGElement>) => void; // ユニット選択・移動指示用, event追加
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

  // SVG全体のサイズとオフセットを計算するための準備
  let minPxX = Infinity;
  let maxPxX = -Infinity;
  let minPxY = Infinity;
  let maxPxY = -Infinity;

  const hexesToDraw: { q: number; r: number; logicalX: number; logicalY: number; center: { x: number; y: number }; corners: string }[] = [];

  // どの(q, r)の範囲を描画するかを決定する
  for (let r = 0; r < logicalRows; r++) {
    for (let qOffset = 0; qOffset < logicalCols; qOffset++) {
      // logicalX が qOffset になるように q を計算
      const q = qOffset - Math.floor(r / 2);

      const logicalX = q + Math.floor(r / 2);
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
    //    if (terrain === 'forest') return 'rgba(34, 139, 34, 0.3)';
    //    if (terrain === 'mountain') return 'rgba(139, 69, 19, 0.4)';
    // }
    return 'rgba(107, 114, 128, 0.2)'; // Default plain
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
              const hexKey = `${q}-${r}`; // アキシャル座標をキーに
              const unitOnHex = placedUnits.find(
                u => Math.round(u.position.x) === logicalX && Math.round(u.position.y) === logicalY // 移動中のため四捨五入で比較
              );
              const unitDef = unitOnHex ? UNITS_MAP.get(unitOnHex.unitId) : null;

              // ユニットの向きを描画するための線 (0-5 の整数を想定)
              let directionLine = null;
              if (unitOnHex && unitOnHex.orientation !== undefined && unitDef) {
                // orientation が 0 (上), 1 (右上), ..., 5 (左上) と仮定
                // 各方向の角度（0度が右、時計回り）
                // 0: 尖った頂点が上なので、-90度 or 270度
                // 1: -30度 or 330度
                // 2: 30度
                // 3: 90度
                // 4: 150度
                // 5: 210度
                // または、orientationを0-359度の角度として直接扱う
                const angleOffset = -90; // 0の向きを真上にするためのオフセット
                const angleRad = (unitOnHex.orientation * 60 + angleOffset) * (Math.PI / 180);
                const lineLength = hexSize * 0.4;
                const x2 = center.x + lineLength * Math.cos(angleRad);
                const y2 = center.y + lineLength * Math.sin(angleRad);
                directionLine = (
                  <line
                    x1={center.x}
                    y1={center.y}
                    x2={x2}
                    y2={y2}
                    stroke={unitOnHex.owner === 'player' ? "cyan" : "magenta"}
                    strokeWidth="2" // 太さを調整
                    pointerEvents="none"
                  />
                );
              }

              return (
                <g
                  key={hexKey}
                  onClick={(event) => onHexClick?.(q, r, logicalX, logicalY, unitOnHex, event)}
                  onContextMenu={(event) => { // 右クリックイベント
                    event.preventDefault(); // ブラウザのデフォルトコンテキストメニューを抑制
                    onHexClick?.(q, r, logicalX, logicalY, unitOnHex, event);
                  }}
                  className="cursor-pointer group"
                >
                  <polygon
                    points={corners}
                    fill={getTerrainColor(logicalX, logicalY)}
                    stroke="rgba(55, 65, 81, 0.6)"
                    strokeWidth="1"
                    className="group-hover:fill-opacity-50 transition-opacity" // ホバー時の透過度変更
                  />
                  {unitOnHex && unitDef && (
                    <g> {/* ユニット関連の描画をグループ化 */}
                      <text
                        x={center.x}
                        y={center.y}
                        fontSize={hexSize * 0.55} // アイコンサイズ調整
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={unitOnHex.owner === 'player' ? "rgb(165, 243, 252)" : "rgb(250, 160, 220)"}
                        stroke={selectedUnitInstanceId === unitOnHex.instanceId ? "yellow" : "black"} // 選択中ユニットの枠線
                        strokeWidth={selectedUnitInstanceId === unitOnHex.instanceId ? 1.5 : 0.5}
                        pointerEvents="none"
                        className="font-semibold select-none" // テキスト選択不可に
                      >
                        {unitDef.icon || unitDef.name.substring(0,1).toUpperCase()}
                      </text>
                      {directionLine}
                      {/* HPバー */}
                      {unitDef.stats.hp > 0 && ( // HPが0より大きい場合のみバー表示
                        <rect
                            x={center.x - hexSize * 0.4} // 中央寄せ
                            y={center.y + hexSize * 0.3} // アイコンの下に配置
                            width={hexSize * 0.8 * (unitOnHex.currentHp / unitDef.stats.hp)}
                            height={hexSize * 0.1} // バーの太さ
                            fill={
                                unitOnHex.currentHp / unitDef.stats.hp > 0.6 ? 'rgb(74, 222, 128)' : // green-400
                                unitOnHex.currentHp / unitDef.stats.hp > 0.3 ? 'rgb(250, 204, 21)' : // yellow-400
                                'rgb(248, 113, 113)'  // red-400
                            }
                            stroke="rgba(0,0,0,0.5)"
                            strokeWidth="0.5"
                            rx="1" // 角を少し丸める
                            ry="1"
                            pointerEvents="none"
                        />
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