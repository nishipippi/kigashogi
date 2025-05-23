// src/types/unit.ts
export interface UnitArmor {
  front: number;
  side: number;
  back: number;
  top: number;
}

export interface UnitWeaponStats {
  power: number;
  range: number;
  attackInterval: number; // 秒
  dps: number;
}

export interface UnitStats {
  hp: number;
  armor: UnitArmor;
  moveSpeed: number; // hex/s
  heWeapon?: UnitWeaponStats;
  apWeapon?: UnitWeaponStats;
  sightMultiplier: number;
  baseDetectionRange: number; // hex
  turnSpeed?: number; // degrees/s (該当ユニットのみ)
  // 必要に応じてその他の特殊能力やパラメータを追加
}

export interface UnitData {
  id: string; // ユニットの一意なID (例: "rifle_infantry")
  name: string; // 表示名 (例: "ライフル歩兵")
  cost: number; // 生産コスト
  productionTime: number; // 生産時間 (秒) - 要件定義補足資料より
  icon: string; // UI表示用のアイコン (絵文字や画像パスなど)
  description?: string; // ユニットの簡単な説明や役割
  role?: string; // 役割 (例: "基本的な戦線維持")
  isCommander?: boolean; // 司令官ユニットかどうかのフラグ
  stats: UnitStats; // 詳細なユニット性能
  remarks?: string; // 備考
}