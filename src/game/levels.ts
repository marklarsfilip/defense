import { createSeededRandom } from "./random";
import type { EnemySpawn, LevelDefinition, LootRarity } from "./types";

export const BONUS_LEVEL_CHANCE = 0.01;

type Gate = EnemySpawn["gate"];

const GATES: Gate[] = ["north", "east", "south", "west"];
const BASE_RARITY_WEIGHTS: Record<LootRarity, number> = {
  common: 700,
  uncommon: 220,
  rare: 65,
  epic: 13,
  legendary: 2,
  set: 1,
};

export function createCampaignLevel(levelNumber: number): LevelDefinition {
  if (levelNumber === 1) {
    return createBoneGateLevel();
  }

  if (levelNumber % 10 === 0) {
    return createBossLevel(levelNumber);
  }

  const archetype = pickArchetype(levelNumber);

  if (archetype === "flying") {
    return createFlyingLevel(levelNumber);
  }

  if (archetype === "glass") {
    return createGlassLevel(levelNumber);
  }

  if (archetype === "brute") {
    return createBruteLevel(levelNumber);
  }

  if (archetype === "caster") {
    return createCasterLevel(levelNumber);
  }

  if (archetype === "swarm") {
    return createSwarmLevel(levelNumber);
  }

  if (archetype === "shield") {
    return createShieldLevel(levelNumber);
  }

  return createMixedLevel(levelNumber);
}

export function shouldQueueBonusLevel(completedLevelNumber: number, victories: number): boolean {
  const random = createSeededRandom(9001 + completedLevelNumber * 131 + victories * 1297);

  return random() < BONUS_LEVEL_CHANCE;
}

export function createBonusLevel(afterLevelNumber: number): LevelDefinition {
  const itemLevel = Math.max(1, afterLevelNumber);

  return {
    id: `bonus-pasture-after-${afterLevelNumber}`,
    name: "Bonus Pasture",
    subtitle: "A Very Strange Field",
    kind: "bonus",
    levelNumber: afterLevelNumber,
    durationLimit: 25,
    seed: 81000 + afterLevelNumber * 89,
    chest: {
      itemLevel,
      rarityWeights: scaleRarityWeights(2.8),
      goldBonus: {
        min: 24 + afterLevelNumber * 7,
        max: 42 + afterLevelNumber * 12,
      },
    },
    combat: {
      enemyHealthMultiplier: 0.75 + afterLevelNumber * 0.04,
      enemyDamageMultiplier: 0.18,
      rewardMultiplier: 2.4,
      heroDamageMultipliers: {},
    },
    notes: ["Rare bonus level", "One easy creature", "At least double normal loot value"],
    enemyWaves: [{ enemyId: "glitterhorn", count: 1, startsAt: 0.4, interval: 1, gate: "north" }],
  };
}

function createBoneGateLevel(): LevelDefinition {
  return {
    id: "level-1",
    name: "Level 1",
    subtitle: "The Bone Gate",
    kind: "normal",
    levelNumber: 1,
    durationLimit: 45,
    seed: 1729,
    chest: {
      itemLevel: 1,
      rarityWeights: BASE_RARITY_WEIGHTS,
      goldBonus: {
        min: 4,
        max: 12,
      },
    },
    combat: {
      enemyHealthMultiplier: 1,
      enemyDamageMultiplier: 1,
      rewardMultiplier: 1,
      heroDamageMultipliers: {},
    },
    notes: ["Tutorial pressure", "Ground enemies", "Nearly impossible to fail"],
    enemyWaves: [
      { enemyId: "skeleton", count: 10, startsAt: 0, interval: 0.8, gate: "north" },
      { enemyId: "skeleton", count: 8, startsAt: 4, interval: 0.75, gate: "east" },
      { enemyId: "skeleton", count: 12, startsAt: 8, interval: 0.55, gate: "west" },
    ],
  };
}

function createBossLevel(levelNumber: number): LevelDefinition {
  return {
    ...baseLevel(levelNumber, "boss", "The Gate Titan", "Boss level"),
    durationLimit: 65,
    chest: createChest(levelNumber, 1.9),
    combat: {
      enemyHealthMultiplier: 1 + levelNumber * 0.14,
      enemyDamageMultiplier: 1 + levelNumber * 0.05,
      rewardMultiplier: 1.9,
      heroDamageMultipliers: {},
    },
    notes: ["Every tenth level", "Single boss", "Higher reward chest"],
    enemyWaves: [{ enemyId: "gateTitan", count: 1, startsAt: 0.8, interval: 1, gate: "north" }],
  };
}

function createFlyingLevel(levelNumber: number): LevelDefinition {
  return {
    ...baseLevel(levelNumber, "normal", "Broken Wings", "Flying enemies"),
    combat: {
      enemyHealthMultiplier: levelScale(levelNumber),
      enemyDamageMultiplier: 0.92 + levelNumber * 0.025,
      rewardMultiplier: 1.08,
      heroDamageMultipliers: {
        ranged: 1.2,
        magic: 1.12,
        summon: 1.08,
      },
    },
    notes: ["Flying enemies", "Melee uses weak thrown attacks", "Ranged and magic favored"],
    enemyWaves: buildWaves("boneHawk", levelNumber, 26, 0.46),
  };
}

function createGlassLevel(levelNumber: number): LevelDefinition {
  return {
    ...baseLevel(levelNumber, "normal", "Glass Knives", "Dangerous fragile mobs"),
    combat: {
      enemyHealthMultiplier: Math.max(0.7, levelScale(levelNumber) * 0.82),
      enemyDamageMultiplier: 1.25 + levelNumber * 0.035,
      rewardMultiplier: 1.12,
      heroDamageMultipliers: {
        melee: 1.15,
        ranged: 1.08,
      },
    },
    notes: ["Fragile but dangerous", "Melee burst favored", "Slow builds take more hits"],
    enemyWaves: buildWaves("glassCultist", levelNumber, 28, 0.52),
  };
}

function createBruteLevel(levelNumber: number): LevelDefinition {
  return {
    ...baseLevel(levelNumber, "normal", "Grave March", "Armored brutes"),
    combat: {
      enemyHealthMultiplier: levelScale(levelNumber) * 1.08,
      enemyDamageMultiplier: 1 + levelNumber * 0.025,
      rewardMultiplier: 1.18,
      heroDamageMultipliers: {
        magic: 1.18,
        summon: 1.12,
      },
    },
    notes: ["Armored enemies", "Magic and summons favored", "Low single-target builds are slower"],
    enemyWaves: buildWaves("graveBrute", levelNumber, 12, 1.05),
  };
}

function createCasterLevel(levelNumber: number): LevelDefinition {
  return {
    ...baseLevel(levelNumber, "normal", "Lantern Storm", "Flying casters"),
    combat: {
      enemyHealthMultiplier: Math.max(0.7, levelScale(levelNumber) * 0.78),
      enemyDamageMultiplier: 1.45 + levelNumber * 0.035,
      rewardMultiplier: 1.2,
      heroDamageMultipliers: {
        ranged: 1.22,
        magic: 1.05,
        melee: 0.92,
      },
    },
    notes: ["Flying casters", "High incoming damage", "Ranged control favored"],
    enemyWaves: buildWaves("spellWisp", levelNumber, 24, 0.62),
  };
}

function createSwarmLevel(levelNumber: number): LevelDefinition {
  return {
    ...baseLevel(levelNumber, "normal", "Rot Tide", "Large swarm"),
    combat: {
      enemyHealthMultiplier: Math.max(0.65, levelScale(levelNumber) * 0.72),
      enemyDamageMultiplier: 0.82 + levelNumber * 0.018,
      rewardMultiplier: 0.92,
      heroDamageMultipliers: {
        magic: 1.2,
        summon: 1.16,
        melee: 1.08,
      },
    },
    notes: ["Many weak enemies", "Area damage favored", "Single-target builds waste attacks"],
    enemyWaves: buildWaves("rotImp", levelNumber, 48, 0.28),
  };
}

function createShieldLevel(levelNumber: number): LevelDefinition {
  return {
    ...baseLevel(levelNumber, "normal", "Shield Line", "Armored formation"),
    combat: {
      enemyHealthMultiplier: levelScale(levelNumber),
      enemyDamageMultiplier: 0.95 + levelNumber * 0.02,
      rewardMultiplier: 1.16,
      heroDamageMultipliers: {
        magic: 1.24,
        ranged: 0.9,
      },
    },
    notes: ["Heavy armor", "Magic favored", "Precision damage is blunted"],
    enemyWaves: [
      ...buildWaves("shieldBearer", levelNumber, 18, 0.82),
      { enemyId: "glassCultist", count: Math.max(2, Math.floor(levelNumber / 2)), startsAt: 6, interval: 0.7, gate: "east" },
    ],
  };
}

function createMixedLevel(levelNumber: number): LevelDefinition {
  return {
    ...baseLevel(levelNumber, "normal", "Restless Dead", "Mixed assault"),
    combat: {
      enemyHealthMultiplier: levelScale(levelNumber),
      enemyDamageMultiplier: 0.95 + levelNumber * 0.025,
      rewardMultiplier: 1,
      heroDamageMultipliers: {},
    },
    notes: ["Mixed ground enemies", "General build check"],
    enemyWaves: [
      ...buildWaves("skeleton", levelNumber, 22, 0.58),
      { enemyId: "graveBrute", count: Math.max(1, Math.floor(levelNumber / 3)), startsAt: 7, interval: 1.4, gate: "south" },
    ],
  };
}

function baseLevel(levelNumber: number, kind: LevelDefinition["kind"], subtitle: string, note: string): LevelDefinition {
  return {
    id: `level-${levelNumber}`,
    name: `Level ${levelNumber}`,
    subtitle,
    kind,
    levelNumber,
    durationLimit: 50 + Math.min(20, levelNumber),
    seed: 1729 + levelNumber * 941,
    chest: createChest(levelNumber, 1),
    combat: {
      enemyHealthMultiplier: levelScale(levelNumber),
      enemyDamageMultiplier: 1,
      rewardMultiplier: 1,
      heroDamageMultipliers: {},
    },
    notes: [note],
    enemyWaves: [],
  };
}

function createChest(levelNumber: number, luckMultiplier: number) {
  return {
    itemLevel: levelNumber,
    rarityWeights: scaleRarityWeights(luckMultiplier + levelNumber * 0.035),
    goldBonus: {
      min: 4 + levelNumber * 3,
      max: 12 + levelNumber * 6,
    },
  };
}

function scaleRarityWeights(luckMultiplier: number): Record<LootRarity, number> {
  return {
    common: Math.max(120, Math.round(700 / Math.sqrt(luckMultiplier))),
    uncommon: Math.round(220 * luckMultiplier),
    rare: Math.round(65 * luckMultiplier),
    epic: Math.round(13 * luckMultiplier),
    legendary: Math.max(1, Math.round(2 * luckMultiplier)),
    set: Math.max(1, Math.round(1 * luckMultiplier)),
  };
}

function buildWaves(enemyId: string, levelNumber: number, baseCount: number, interval: number): EnemySpawn[] {
  const count = baseCount + Math.floor(levelNumber * 1.8);

  return [0, 1, 2].map((waveIndex) => ({
    enemyId,
    count: Math.max(1, Math.floor(count / 3)),
    startsAt: waveIndex * 4,
    interval,
    gate: GATES[(levelNumber + waveIndex) % GATES.length],
  }));
}

function pickArchetype(levelNumber: number): "mixed" | "flying" | "glass" | "brute" | "caster" | "swarm" | "shield" {
  const sequence = ["flying", "glass", "brute", "caster", "swarm", "shield", "mixed"] as const;

  return sequence[(levelNumber - 2) % sequence.length];
}

function levelScale(levelNumber: number): number {
  return 0.86 + levelNumber * 0.08;
}
