// src/types/unit.ts

// ユニットの所属勢力 (将来的な拡張用)
export type UnitFaction = 'alpha_force' | 'bravo_corp' | 'neutral' | 'player_default' | 'enemy_default';

// ユニットの役割やカテゴリを示すタグ (複数選択可能にするなら string[] など)
export type UnitRoleTag =
  | 'infantry'
  | 'anti_infantry'
  | 'anti_tank'
  | 'recon'
  | 'support_fire'
  | 'heavy_armor'
  | 'light_vehicle'
  | 'artillery'
  | 'commander';

// ユニットの基本的な種別 (分類)
export type UnitClassificationType =
  | 'infantry'          // 歩兵全般
  | 'vehicle_light'     // 軽車両 (装輪装甲車、偵察車など)
  | 'vehicle_heavy'     // 重車両 (戦車など)
  | 'support_indirect'  // 間接支援 (自走砲など)
  | 'commander_infantry'// 司令官 (歩兵タイプ)
  | 'commander_vehicle' // 司令官 (車両タイプ)
  | 'static_defense';   // 固定防御設備 (将来用)

// ユニットが持つ武器の統計情報
export interface UnitWeaponStats {
  name?: string; // 武器名 (例: "120mm Cannon", "Heavy Machine Gun")
  power: number; // 攻撃力 (HEまたはAP)
  range: number; // 射程 (ヘックス数)
  dps: number;   // 秒間平均ダメージ (計算値、表示用)
  attackInterval: number; // 攻撃間隔 (秒) - これが実際の攻撃サイクル
  areaOfEffect?: number; // 効果範囲 (半径ヘックス数、0は単体攻撃)
  // accuracy?: number; // 命中率 (0-1、必中なら不要)
  // penetrationFalloff?: number[]; // 距離による貫通力減衰 (将来用)
}

// ユニットの装甲値
export interface UnitArmorStats {
  front: number;
  side: number;
  back: number;
  top: number;
}

// ユニットの基本統計情報
export interface UnitStats {
  hp: number; // 体力
  armor: UnitArmorStats; // 装甲値
  moveSpeed: number; // 移動速度 (ヘックス/秒)
  sightMultiplier: number; // 視界倍率 (例: 1.0, 1.5, 0.8)
  baseDetectionRange: number; // 基礎被発見距離 (ヘックス数)
  turnSpeed?: number; // 旋回速度 (度/秒) - 旋回可能なユニットのみ
  heWeapon?: UnitWeaponStats; // 対ソフトターゲット/榴弾兵器
  apWeapon?: UnitWeaponStats; // 対装甲/徹甲弾兵器
  // maxFuel?: number; // 最大燃料 (将来用)
  // maxAmmo?: number; // 最大弾薬 (将来用)
}

// ユニットの静的データ定義
export interface UnitData { // ★★★ このインターフェースの名前は typesUnitData ではなく UnitData が正しいです ★★★
  id: string; // ユニットの一意なID (例: "rifle_infantry", "mbt_alpha")
  name: string; // UIに表示されるユニット名
  icon: string; // UI表示用のアイコン (絵文字や短い文字列など)
  description?: string; // ユニットの詳細説明
  role?: string; // ユニットの主な役割 (UI表示用、UnitRoleTagとは別でも可)
  cost: number; // 生産/配置に必要なコスト
  productionTime: number; // 生産にかかる時間 (秒)
  isCommander?: boolean; // このユニットが司令官ユニットか
  faction?: UnitFaction; // 所属勢力 (主にAI用や将来の勢力別ユニットのため)

  type: UnitClassificationType; // ユニットの基本的な分類 (歩兵、車両など)

  tags?: UnitRoleTag[]; // ユニットの役割や特性を示すタグ (複数可)

  stats: UnitStats; // ユニットの性能値

  canMoveAndAttack?: boolean; // ★★★ この行を追加 ★★★

  // prerequisites?: string[]; // 生産に必要な前提条件 (他のユニットや研究など、将来用)
  // specialAbilities?: { id: string, name: string, description: string }[]; // 特殊能力 (将来用)
}