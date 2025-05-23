// src/gameData/units.ts
import type { UnitData, UnitClassificationType } from '@/types/unit'; // UnitClassificationType をインポート

export const ALL_UNITS: UnitData[] = [
  {
    id: 'rifle_infantry',
    name: 'ライフル歩兵',
    cost: 25,
    productionTime: 10,
    icon: '👤',
    role: '基本的な戦線維持、数による圧力、安価な壁',
    description: '安価なバランス役。APはあくまで自衛用でDPSは低い。コスト比で物量作戦に向く。',
    isCommander: false,
    type: 'infantry', // ★★★ type を設定 ★★★
    stats: {
      hp: 10,
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.0,
      heWeapon: { power: 3, range: 3, attackInterval: 2.0, dps: 1.5 },
      apWeapon: { power: 6, range: 1, attackInterval: 3.0, dps: 2.0 },
      sightMultiplier: 1.0,
      baseDetectionRange: 3,
    },
    // remarks: 'APはあくまで自衛用でDPSは低い。', // description と重複気味なのでコメントアウトも検討
  },
  {
    id: 'light_infantry',
    name: '軽歩兵',
    cost: 40,
    productionTime: 15,
    icon: '🏃',
    role: '高速展開、重要戦線維持',
    description: '高級歩兵。高耐久・高速かつ高いDPSを誇るが、AP攻撃不可。',
    isCommander: false,
    type: 'infantry', // ★★★ type を設定 ★★★
    stats: {
      hp: 15,
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.5,
      heWeapon: { power: 6, range: 3, attackInterval: 2.0, dps: 3.0 },
      sightMultiplier: 1.0,
      baseDetectionRange: 4,
    },
    // remarks: 'AP攻撃不可。',
  },
  {
    id: 'support_infantry',
    name: 'サポート歩兵', // (機関銃兵を想定)
    cost: 40,
    productionTime: 18,
    icon: '🛠️', // (仮: 重火器のイメージ)
    role: '対歩兵火力支援、陣地防衛',
    description: 'HE攻撃もAP攻撃も十分射程が長く高火力。ただしHPが低く、攻撃間隔もやや長めで瞬間火力型。',
    isCommander: false,
    type: 'infantry', // ★★★ type を設定 ★★★
    stats: {
      hp: 8,
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.0,
      heWeapon: { power: 6, range: 4, attackInterval: 2.0, dps: 3.0 },
      apWeapon: { power: 6, range: 4, attackInterval: 2.0, dps: 3.0 }, // 対軽装甲も期待できる
      sightMultiplier: 0.8,
      baseDetectionRange: 3,
    },
    // remarks: 'HPが低いが射程と火力が魅力。',
  },
  {
    id: 'anti_tank_infantry',
    name: '対戦車歩兵',
    cost: 40,
    productionTime: 20,
    icon: '💥',
    role: '戦車・装甲車両の待ち伏せ攻撃',
    description: '単発威力は絶大だが、リロードが非常に長い。待ち伏せで確実に初弾を当てることが重要。',
    isCommander: false,
    type: 'infantry', // ★★★ type を設定 ★★★
    stats: {
      hp: 5,
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.0,
      apWeapon: { power: 18, range: 6, attackInterval: 9.0, dps: 2.0 },
      sightMultiplier: 0.6,
      baseDetectionRange: 2,
    },
    // remarks: 'HPの低さとリロードの長さから継続戦闘能力は低い。',
  },
  {
    id: 'special_forces',
    name: '特殊部隊',
    cost: 100,
    productionTime: 30,
    icon: '🥷',
    role: '高価値目標排除、後方攪乱',
    description: 'HE/AP共にバランスの取れた高コストバランス型。AP射程は短いので接近が必要だが、DPSが高く対装甲車両でも十分強い。',
    isCommander: false,
    type: 'infantry', // ★★★ type を設定 ★★★
    stats: {
      hp: 15,
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.5,
      heWeapon: { power: 6, range: 3, attackInterval: 2.0, dps: 3.0 },
      apWeapon: { power: 8, range: 2, attackInterval: 2.0, dps: 4.0 },
      sightMultiplier: 1.5,
      baseDetectionRange: 3,
    },
  },
  {
    id: 'recon_infantry',
    name: '偵察歩兵',
    cost: 40,
    productionTime: 12,
    icon: '👀',
    role: '索敵、視界確保',
    description: '偵察機材をメインに所持し、戦闘能力はほぼ皆無。接近された場合の自衛用の短射程高火力HE武器を持つ。',
    isCommander: false,
    type: 'infantry', // ★★★ type を設定 ★★★
    stats: {
      hp: 5,
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.2,
      heWeapon: { power: 3, range: 1, attackInterval: 1.0, dps: 3.0 }, // 自衛用
      sightMultiplier: 4.0,
      baseDetectionRange: 1.5, // 自身は見つかりにくい
    },
  },
  {
    id: 'main_battle_tank',
    name: '主力戦車',
    cost: 200,
    productionTime: 50,
    icon: ' M ', // (仮アイコン、戦車の絵文字 💣 や 🚚 は微妙なので)
    role: '主力打撃、戦線突破',
    description: '高い装甲と強力な主砲を持つ。対戦車歩兵よりDPSは低いが、生存性が高く継続的にダメージを与える。',
    isCommander: false,
    type: 'vehicle_heavy', // ★★★ type を設定 ★★★
    stats: {
      hp: 40,
      armor: { front: 15, side: 10, back: 4, top: 2 },
      moveSpeed: 0.8,
      heWeapon: { name: "Coaxial MG", power: 2, range: 5, attackInterval: 1.0, dps: 2.0 }, // 同軸機銃
      apWeapon: { name: "Main Cannon", power: 12, range: 5, attackInterval: 6.0, dps: 2.0 }, // 主砲
      sightMultiplier: 0.5, // 戦車は視界が悪い
      baseDetectionRange: 6, // 大きいので発見されやすい
      turnSpeed: 60,
    },
  },
  {
    id: 'ifv', // Infantry Fighting Vehicle
    name: '歩兵戦闘車',
    cost: 80,
    productionTime: 25,
    icon: ' I ', // (仮アイコン)
    role: '歩兵支援、対軽装甲、快速展開',
    description: '機関砲による高い対ソフトターゲット・対軽装甲火力を誇る。主力戦車には歯が立たない。',
    isCommander: false,
    type: 'vehicle_light', // ★★★ type を設定 ★★★
    stats: {
      hp: 25,
      armor: { front: 4, side: 3, back: 2, top: 1 },
      moveSpeed: 1.2,
      heWeapon: { name: "Autocannon (HE)", power: 3, range: 3, attackInterval: 1.0, dps: 3.0 },
      apWeapon: { name: "Autocannon (AP)", power: 5, range: 3, attackInterval: 1.0, dps: 5.0 },
      sightMultiplier: 0.8,
      baseDetectionRange: 4,
      turnSpeed: 120,
    },
  },
  {
    id: 'sp_artillery', // Self-Propelled Artillery
    name: '自走砲',
    cost: 150,
    productionTime: 40,
    icon: ' A ', // (仮アイコン)
    role: '長距離火力支援、制圧',
    description: '射線を無視して長射程攻撃を行う。単発威力は高いがリロードが非常に長い。着弾まで2秒。',
    isCommander: false,
    type: 'support_indirect', // ★★★ type を設定 ★★★
    stats: {
      hp: 15,
      armor: { front: 1, side: 1, back: 1, top: 0 },
      moveSpeed: 0.5,
      // 自走砲のHE攻撃は特殊。rangeは最大射程、powerは範囲攻撃の中心ダメージ。
      // 実際の攻撃ロジックは GameplayContent 側で特別に処理する必要がある。
      heWeapon: { name: "Artillery Howitzer", power: 5, range: 8, attackInterval: 10.0, dps: 0.5, areaOfEffect: 1 },
      sightMultiplier: 0.8,
      baseDetectionRange: 5,
      turnSpeed: 30,
    },
    // remarks: '射線無視、着弾ラグ2秒、半径1ヘックス範囲へのHEダメージ。目標視認必要。',
  },
  {
    id: 'commander_unit',
    name: '司令官ユニット',
    cost: 300,
    productionTime: 60,
    icon: ' C ', // (仮アイコン、司令官の星 ⭐ など)
    role: '指揮、ユニット生産',
    description: 'このユニットが全滅すると敗北。隣接ヘックスでユニットを生産可能。戦闘能力は低い。',
    isCommander: true,
    type: 'commander_vehicle', // 例: 車両タイプの司令官 (歩兵タイプなら 'commander_infantry')
    stats: {
      hp: 20,
      armor: { front: 0, side: 0, back: 0, top: 0 }, // 司令官は脆弱
      moveSpeed: 1.0,
      heWeapon: { power: 1, range: 1, attackInterval: 2.0, dps: 0.5 }, // 自衛用
      sightMultiplier: 1.5,
      baseDetectionRange: 3,
    },
    // remarks: '全滅で敗北。生産も可能だが高コスト・長時間。',
  },
];

export const UNITS_MAP: Map<string, UnitData> = new Map(
  ALL_UNITS.map(unit => [unit.id, unit])
);