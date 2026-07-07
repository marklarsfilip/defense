export type HeroClassId = "berserker" | "arcanist" | "ranger" | "summoner" | "guardian";

export type DamageKind = "melee" | "magic" | "ranged" | "summon";

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

export interface EnemyDefinition {
  id: string;
  name: string;
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
  enemyWaves: EnemySpawn[];
  durationLimit: number;
  seed: number;
}

export interface CombatEnemy {
  id: string;
  definitionId: string;
  name: string;
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

