// src/gameData/maps.ts
import type { MapData, HexData } from '@/types/map'; // HexData もインポート

// ヘルパー関数: 特定範囲の論理座標リストを生成 (デプロイメントエリア用)
function generateDeploymentArea(startX: number, endX: number, startY: number, endY: number): { x: number, y: number }[] {
    const area: { x: number, y: number }[] = [];
    for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
            area.push({ x, y });
        }
    }
    return area;
}

// ヘルパー関数: マップの全ヘックスデータを生成 (指定がなければ'plains'にするなど)
function generateFullHexesData(cols: number, rows: number, specificHexes: Record<string, Partial<Omit<HexData, 'q'|'r'>>> = {}): Record<string, HexData> {
    const hexes: Record<string, HexData> = {};
    for (let r = 0; r < rows; r++) {
        const rOffset = Math.floor(r / 2); // for "odd-r" or similar
        for (let qIter = -rOffset; qIter < cols - rOffset; qIter++) {
            const q = qIter; // Axial q
            // const logicalX = q + Math.floor(r / 2); // logical x (cols範囲チェックは別途)
            // if (logicalX < 0 || logicalX >= cols) continue; // マップ範囲外

            const key = `${q},${r}`;
            const terrain = specificHexes[key]?.terrain || 'plains'; // 指定がなければ平地

            // マップの論理的な境界チェック (axialToLogicalを使用)
            // このチェックは、axial座標のループ範囲が論理的な境界を正しく反映しているか依存
            // もしループが厳密な論理境界内なら不要な場合も
            const tempLogical = { x: q + Math.floor(r/2), y: r};
            if (tempLogical.x < 0 || tempLogical.x >= cols || tempLogical.y < 0 || tempLogical.y >= rows) {
                continue;
            }


            hexes[key] = {
                q,
                r,
                terrain: specificHexes[key]?.terrain || 'plains',
                ...(specificHexes[key] || {}) // 他のプロパティがあればマージ
            };
        }
    }
    return hexes;
}


export const ALL_MAPS_DATA: Record<string, MapData> = {
  map1: {
    id: 'map1',
    name: 'Crossroads',
    description: "A small map with open terrain, favoring quick engagements.",
    rows: 10,
    cols: 20,
    deploymentAreas: {
        player: generateDeploymentArea(0, 2, 0, 9), // 左側3列
        enemy: generateDeploymentArea(17, 19, 0, 9), // 右側3列 (例)
    },
    strategicPoints: [
      { id: 'map1_sp1', name: 'North Outpost', x: 7, y: 2, owner: 'neutral', timeToCapture: 10000 },
      { id: 'map1_sp2', name: 'South Checkpoint', x: 12, y: 7, owner: 'neutral', timeToCapture: 10000 },
    ],
    hexes: generateFullHexesData(20, 10, { // cols, rows
        // 特定のヘックスの地形を指定 (Axial座標 "q,r" をキーに)
        // 例: map1 (20x10 logical)
        // r=0: q=0 to 19
        // r=1: q=0 to 19 (logical x = q)
        // r=2: q=-1 to 18 (logical x = q+1)
        // ...
        // 中心付近に森を配置する例 (Axial座標で指定)
        '5,3': { terrain: 'forest' }, // Logical (5+floor(3/2)=6, 3)
        '6,3': { terrain: 'forest' }, // Logical (6+1=7, 3)
        '5,4': { terrain: 'forest' }, // Logical (5+floor(4/2)=7, 4)
        '6,4': { terrain: 'forest' }, // Logical (6+2=8, 4)
        // 道の例 (Axial座標で指定)
        '0,5': { terrain: 'road' },   // Logical (0+2=2, 5)
        '1,5': { terrain: 'road' },   // Logical (1+2=3, 5)
        '2,5': { terrain: 'road' },   // Logical (2+2=4, 5)
        '3,5': { terrain: 'road' },   // Logical (3+2=5, 5)
        '4,5': { terrain: 'road' },   // ...
        // 通行不可の山 (Axial座標で指定)
        '10,1': { terrain: 'mountain' }, // Logical (10+0=10, 1)
        '10,2': { terrain: 'mountain' }, // Logical (10+1=11, 2)
    })
  },
  map2: {
    id: 'map2',
    name: 'Forest Siege',
    description: "A medium map with dense forests offering cover and ambush opportunities.",
    rows: 15,
    cols: 25,
    deploymentAreas: {
        player: generateDeploymentArea(0, 2, 0, 14),
        enemy: generateDeploymentArea(22, 24, 0, 14),
    },
    strategicPoints: [
      { id: 'map2_sp1', name: 'Forest Clearing', x: 5, y: 5, owner: 'neutral', timeToCapture: 12000 },
      { id: 'map2_sp2', name: 'River Crossing', x: 12, y: 7, owner: 'neutral', timeToCapture: 10000 },
      { id: 'map2_sp3', name: 'Hidden Base', x: 19, y: 9, owner: 'neutral', timeToCapture: 12000 },
    ],
    hexes: generateFullHexesData(25, 15, {
        // map2 の地形指定 (例)
        '3,3': { terrain: 'forest' }, '4,3': { terrain: 'forest' }, '5,3': { terrain: 'forest' },
        '3,4': { terrain: 'forest' }, '4,4': { terrain: 'hills' },  '5,4': { terrain: 'forest' },
        '3,5': { terrain: 'forest' }, '4,5': { terrain: 'forest' }, '5,5': { terrain: 'forest' },
        '10,6': { terrain: 'water' }, '11,6': { terrain: 'water' }, '12,6': { terrain: 'road' }, // 橋のつもり
        '10,7': { terrain: 'water' }, '11,7': { terrain: 'water' }, '12,7': { terrain: 'road' },
    })
  },
  map3: {
    id: 'map3',
    name: 'Urban Warfare',
    description: "A large urban map with many chokepoints and buildings for infantry combat.",
    rows: 20,
    cols: 30,
    deploymentAreas: {
        player: generateDeploymentArea(0, 2, 0, 19),
        enemy: generateDeploymentArea(27, 29, 0, 19),
    },
    strategicPoints: [
      { id: 'map3_sp1', name: 'City Center', x: 6, y: 4, owner: 'neutral', timeToCapture: 15000 },
      { id: 'map3_sp2', name: 'Market Square', x: 15, y: 10, owner: 'neutral', timeToCapture: 10000 },
      { id: 'map3_sp3', name: 'Industrial Zone', x: 23, y: 15, owner: 'neutral', timeToCapture: 15000 },
      { id: 'map3_sp4', name: 'Residential District', x: 10, y: 18, owner: 'neutral', timeToCapture: 12000 },
      { id: 'map3_sp5', name: 'Park Entrance', x: 20, y: 2, owner: 'neutral', timeToCapture: 12000 },
    ],
    hexes: generateFullHexesData(30, 20, {
        // map3 の地形指定 (例: 市街地と道路)
        '5,5': { terrain: 'city' }, '6,5': { terrain: 'city' }, '5,6': { terrain: 'city' }, '6,6': { terrain: 'city' },
        '7,5': { terrain: 'road' }, '7,6': { terrain: 'road' }, '7,7': { terrain: 'road' },
        '14,9': { terrain: 'road' }, '15,9': { terrain: 'road' }, '16,9': { terrain: 'road' },
        '14,10': { terrain: 'road' }, '16,10': { terrain: 'road' },
        '14,11': { terrain: 'road' }, '15,11': { terrain: 'road' }, '16,11': { terrain: 'road' },
    })
  },
};

export const MAP_OPTIONS = Object.values(ALL_MAPS_DATA).map(map => ({
    id: map.id,
    name: map.name,
    description: map.description || "No description available.",
    sizeLabel: `${map.cols}x${map.rows}`,
    strategicPointsCount: map.strategicPoints?.length || 0,
}));