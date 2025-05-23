// src/gameData/units.ts
import type { UnitData } from '@/types/unit';

export const ALL_UNITS: UnitData[] = [
  {
    id: 'rifle_infantry',
    name: 'ライフル歩兵',
    cost: 25,
    productionTime: 10, // 要件定義補足資料より
    icon: '👤',
    role: '基本的な戦線維持、数による圧力、安価な壁',
    description: '安価なバランス役。APはあくまで自衛用でDPSは低い。コスト比で物量作戦に向く。',
    isCommander: false,
    stats: {
      hp: 10,
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.0,
      heWeapon: { power: 3, range: 3, attackInterval: 2.0, dps: 1.5 },
      apWeapon: { power: 6, range: 1, attackInterval: 3.0, dps: 2.0 },
      sightMultiplier: 1.0,
      baseDetectionRange: 3,
    },
    remarks: 'APはあくまで自衛用でDPSは低い。',
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
    stats: {
      hp: 15,
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.5,
      heWeapon: { power: 6, range: 3, attackInterval: 2.0, dps: 3.0 },
      // apWeapon: undefined, // APなし
      sightMultiplier: 1.0,
      baseDetectionRange: 4,
    },
    remarks: 'AP攻撃不可。',
  },
  // --- サポート歩兵 (HP8に増加案) ---
  {
    id: 'support_infantry',
    name: 'サポート歩兵',
    cost: 40,
    productionTime: 18,
    icon: '🛠️',
    role: '対歩兵火力支援、陣地防衛',
    description: 'HE攻撃もAP攻撃も十分射程が長く高火力。ただしHPが低く、攻撃間隔もやや長めで瞬間火力型。',
    isCommander: false,
    stats: {
      hp: 8, // 補足資料での変更案
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.0,
      heWeapon: { power: 6, range: 4, attackInterval: 2.0, dps: 3.0 },
      apWeapon: { power: 6, range: 4, attackInterval: 2.0, dps: 3.0 },
      sightMultiplier: 0.8,
      baseDetectionRange: 3,
    },
    remarks: 'HPが低いが射程と火力が魅力。',
  },
  // --- 対戦車歩兵 (HP5に増加案) ---
  {
    id: 'anti_tank_infantry',
    name: '対戦車歩兵',
    cost: 40,
    productionTime: 20,
    icon: '💥',
    role: '戦車・装甲車両の待ち伏せ攻撃、対装甲戦のキーユニット',
    description: '単発威力は絶大だが、リロードが非常に長い。待ち伏せで確実に初弾を当てることが重要。',
    isCommander: false,
    stats: {
      hp: 5, // 補足資料での変更案
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.0,
      // heWeapon: undefined,
      apWeapon: { power: 18, range: 6, attackInterval: 9.0, dps: 2.0 }, // 対装甲時
      sightMultiplier: 0.6,
      baseDetectionRange: 2,
    },
    remarks: 'HPの低さとリロードの長さから継続戦闘能力は低い。',
  },
  // --- 特殊部隊 (HP15に増加案) ---
  {
    id: 'special_forces',
    name: '特殊部隊',
    cost: 100,
    productionTime: 30,
    icon: '🥷',
    role: '重要目標への浸透・破壊、敵後方攪乱、高価値目標の排除',
    description: 'HE/AP共にバランスの取れた高コストバランス型。AP射程は短いので接近が必要だが、DPSが高く対装甲車両でも十分強い。',
    isCommander: false,
    stats: {
      hp: 15, // 補足資料での変更案
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.5,
      heWeapon: { power: 6, range: 3, attackInterval: 2.0, dps: 3.0 },
      apWeapon: { power: 8, range: 2, attackInterval: 2.0, dps: 4.0 }, // 対装甲時
      sightMultiplier: 1.5,
      baseDetectionRange: 3,
    },
  },
  // --- 偵察歩兵 ---
  {
    id: 'recon_infantry',
    name: '偵察歩兵',
    cost: 40,
    productionTime: 12,
    icon: '👀',
    role: '純粋な索敵、敵陣の早期発見、視界確保',
    description: '偵察機材をメインに所持し、少人数で行動するため戦闘能力はほぼ皆無。森林での遭遇など接近した場合のみ戦闘可能な短射程高い火力HE武器。',
    isCommander: false,
    stats: {
      hp: 5,
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.2,
      heWeapon: { power: 3, range: 1, attackInterval: 1.0, dps: 3.0 },
      // apWeapon: undefined,
      sightMultiplier: 4.0,
      baseDetectionRange: 1.5,
    },
  },
  // --- 主力戦車 (HP40、移動速度0.8に調整案) ---
  {
    id: 'main_battle_tank',
    name: '主力戦車',
    cost: 200,
    productionTime: 50,
    icon: ' M ', // 仮のアイコン
    role: '主力打撃、戦線維持、対戦車戦闘',
    description: '主砲のAP DPSは対戦車歩兵より低いが、装甲とHPで耐えつつ継続的にダメージを与える。機銃による長射程HE攻撃で歩兵も掃討可能。',
    isCommander: false,
    stats: {
      hp: 40, // 補足資料での変更案
      armor: { front: 15, side: 10, back: 4, top: 2 },
      moveSpeed: 0.8, // 補足資料での変更案
      heWeapon: { power: 2, range: 5, attackInterval: 1.0, dps: 2.0 }, // 副次的兵装
      apWeapon: { power: 12, range: 5, attackInterval: 6.0, dps: 2.0 }, // 主砲
      sightMultiplier: 0.5,
      baseDetectionRange: 6,
      turnSpeed: 60,
    },
  },
  // --- 歩兵戦闘車 (HP25、移動速度1.2に調整案) ---
  {
    id: 'ifv',
    name: '歩兵戦闘車',
    cost: 80,
    productionTime: 25,
    icon: ' I ',
    role: '歩兵支援、対軽装甲・対歩兵、快速展開',
    description: '機関砲の連射力で高いHE DPSを誇る。AP DPSも軽装甲相手には十分。主力戦車には歯が立たない。',
    isCommander: false,
    stats: {
      hp: 25, // 補足資料での変更案
      armor: { front: 4, side: 3, back: 2, top: 1 },
      moveSpeed: 1.2, // 補足資料での変更案
      heWeapon: { power: 3, range: 3, attackInterval: 1.0, dps: 3.0 },
      apWeapon: { power: 5, range: 3, attackInterval: 1.0, dps: 5.0 },
      sightMultiplier: 0.8,
      baseDetectionRange: 4,
      turnSpeed: 120,
    },
  },
  // --- 自走砲 (HP15に増加案、旋回速度30) ---
  {
    id: 'sp_artillery',
    name: '自走砲',
    cost: 150,
    productionTime: 40,
    icon: ' A ',
    role: '後方からの長距離火力支援、対ソフトターゲット、制圧',
    description: '単発威力は高いがリロードが非常に長い。着弾までに2秒間の時間がかかる。但し射線を無視して長射程攻撃を行える唯一のユニット。',
    isCommander: false,
    stats: {
      hp: 15, // 補足資料での変更案
      armor: { front: 1, side: 1, back: 1, top: 0 },
      moveSpeed: 0.5,
      heWeapon: { power: 5, range: 8, attackInterval: 10.0, dps: 0.5 }, // 射線無視、着弾ラグ2秒、半径1hex範囲攻撃
      // apWeapon: undefined,
      sightMultiplier: 0.8,
      baseDetectionRange: 5,
      turnSpeed: 30, // 補足資料より
    },
    remarks: '射線無視、着弾ラグ2秒、半径1ヘックス範囲へのHEダメージ。目標視認必要。',
  },
  // --- 司令官ユニット (HP20に増加案) ---
  {
    id: 'commander',
    name: '司令官ユニット',
    cost: 300,
    productionTime: 60, // 補足資料より
    icon: ' C ',
    role: '最重要ユニット、ユニット生産拠点',
    description: 'このユニットが全滅すると敗北。隣接ヘックスでユニットを生産可能。',
    isCommander: true,
    stats: {
      hp: 20, // 補足資料での変更案
      armor: { front: 0, side: 0, back: 0, top: 0 },
      moveSpeed: 1.0,
      heWeapon: { power: 1, range: 1, attackInterval: 2.0, dps: 0.5 },
      // apWeapon: undefined,
      sightMultiplier: 1.5,
      baseDetectionRange: 3,
    },
    remarks: '全滅で敗北。生産も可能だが高コスト・長時間。',
  },
];

// ユニットIDで検索できるようにMapオブジェクトもエクスポートすると便利
export const UNITS_MAP: Map<string, UnitData> = new Map(
  ALL_UNITS.map(unit => [unit.id, unit])
);