export type HeroClassId = "berserker" | "arcanist" | "ranger" | "summoner" | "guardian";

export type DamageKind = "melee" | "magic" | "ranged" | "summon";

export type EnemyTrait =
  | "ground"
  | "flying"
  | "fragile"
  | "dangerous"
  | "armored"
  | "caster"
  | "swarm"
  | "boss"
  | "bonus";

export type LevelKind = "normal" | "boss" | "bonus";

export type LootRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "set";

export type EquipmentSlot = "weapon" | "armor" | "trinket";

export type StatKey = keyof Stats;

export interface Stats {
  health: number;
  armor: number;
  damage: number;
  attackSpeed: number;
  range: number;
  critChance: number;
  critDamage: number;
  abilityPower: number;
  cooldownReduction: number;
}

export interface HeroClass {
  id: HeroClassId;
  name: string;
  fantasy: string;
  combatStyle: string;
  color: string;
  damageKind: DamageKind;
  stats: Stats;
  special: {
    name: string;
    description: string;
    everyNthAttack: number;
    cleaveTargets: number;
    damageMultiplier: number;
  };
}

export interface TalentDefinition {
  id: string;
  name: string;
  description: string;
  levelRequirement: number;
  classId?: HeroClassId;
  statModifiers: Partial<Stats>;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  traits: EnemyTrait[];
  health: number;
  armor: number;
  damage: number;
  attackSpeed: number;
  moveSpeed: number;
  rewardXp: number;
  rewardGold: number;
}

export interface EnemySpawn {
  enemyId: string;
  count: number;
  startsAt: number;
  interval: number;
  gate: "north" | "east" | "south" | "west";
}

export interface LevelDefinition {
  id: string;
  name: string;
  subtitle: string;
  kind: LevelKind;
  levelNumber: number;
  enemyWaves: EnemySpawn[];
  durationLimit: number;
  seed: number;
  chest: LevelChestDefinition;
  combat: LevelCombatRules;
  notes: string[];
}

export interface LevelChestDefinition {
  itemLevel: number;
  rarityWeights: Record<LootRarity, number>;
  goldBonus: {
    min: number;
    max: number;
  };
}

export interface LevelCombatRules {
  enemyHealthMultiplier: number;
  enemyDamageMultiplier: number;
  rewardMultiplier: number;
  heroDamageMultipliers: Partial<Record<DamageKind, number>>;
}

export interface LootRarityDefinition {
  rarity: LootRarity;
  label: string;
  color: string;
  powerMultiplier: number;
  modifierCount: number;
}

export interface LootBaseItemDefinition {
  id: string;
  name: string;
  slot: EquipmentSlot;
}

export interface LootNamedItemDefinition {
  id: string;
  name: string;
  slot: EquipmentSlot;
}

export interface LootAffixDefinition {
  id: string;
  name: string;
  stat: StatKey;
  minPerLevel: number;
  maxPerLevel: number;
}

export interface LootSetDefinition {
  id: string;
  name: string;
  pieces: Array<{
    name: string;
    slot: EquipmentSlot;
  }>;
}

export interface LootModifier {
  stat: StatKey;
  label: string;
  amount: number;
}

export interface LootItem {
  id: string;
  name: string;
  rarity: LootRarity;
  slot: EquipmentSlot;
  itemLevel: number;
  modifiers: LootModifier[];
  setId?: string;
  setName?: string;
}

export interface ChestReward {
  seed: number;
  levelId: string;
  goldBonus: number;
  item: LootItem;
}

export interface CombatEnemy {
  id: string;
  definitionId: string;
  name: string;
  traits: EnemyTrait[];
  maxHealth: number;
  health: number;
  armor: number;
  damage: number;
  attackSpeed: number;
  moveSpeed: number;
  rewardXp: number;
  rewardGold: number;
  gate: EnemySpawn["gate"];
  spawnTime: number;
}

export type CombatEvent =
  | {
      type: "spawn";
      time: number;
      enemyId: string;
      enemyName: string;
      gate: EnemySpawn["gate"];
      maxHealth: number;
    }
  | {
      type: "attack";
      time: number;
      sourceId: "hero" | string;
      targetIds: string[];
      damage: number;
      critical: boolean;
      damageKind: DamageKind;
      label: string;
    }
  | {
      type: "projectile";
      time: number;
      sourceId: "hero";
      targetId: string;
      damageKind: DamageKind;
    }
  | {
      type: "heroHit";
      time: number;
      sourceId: string;
      damage: number;
    }
  | {
      type: "death";
      time: number;
      enemyId: string;
    }
  | {
      type: "levelComplete";
      time: number;
      xp: number;
      gold: number;
    }
  | {
      type: "heroDefeated";
      time: number;
    };

export interface CombatResult {
  heroClass: HeroClass;
  level: LevelDefinition;
  won: boolean;
  duration: number;
  heroHealthRemaining: number;
  enemiesDefeated: number;
  xp: number;
  gold: number;
  events: CombatEvent[];
}
