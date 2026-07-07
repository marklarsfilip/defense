import type {
  EnemyDefinition,
  HeroClass,
  LevelDefinition,
  LootAffixDefinition,
  LootBaseItemDefinition,
  LootNamedItemDefinition,
  LootRarity,
  LootRarityDefinition,
  LootSetDefinition,
} from "./types";

export const heroClasses: HeroClass[] = [
  {
    id: "berserker",
    name: "Berserker",
    fantasy: "A reckless melee bruiser who turns attack speed into carnage.",
    combatStyle: "Fast cleaves, high crits, low defenses",
    color: "#ef4444",
    damageKind: "melee",
    stats: {
      health: 190,
      armor: 10,
      damage: 31,
      attackSpeed: 1.45,
      range: 1.8,
      critChance: 0.22,
      critDamage: 1.85,
      abilityPower: 0,
      cooldownReduction: 0,
    },
    special: {
      name: "Whirlwind Cut",
      description: "Every fourth attack slashes several nearby enemies.",
      everyNthAttack: 4,
      cleaveTargets: 4,
      damageMultiplier: 0.78,
    },
  },
  {
    id: "arcanist",
    name: "Arcanist",
    fantasy: "A spellcaster who burns grouped enemies with volatile magic.",
    combatStyle: "Area bursts, high ability scaling",
    color: "#38bdf8",
    damageKind: "magic",
    stats: {
      health: 130,
      armor: 4,
      damage: 24,
      attackSpeed: 0.9,
      range: 7.5,
      critChance: 0.12,
      critDamage: 1.65,
      abilityPower: 24,
      cooldownReduction: 0.08,
    },
    special: {
      name: "Arcane Nova",
      description: "Every third cast splashes into a small pack.",
      everyNthAttack: 3,
      cleaveTargets: 5,
      damageMultiplier: 0.88,
    },
  },
  {
    id: "ranger",
    name: "Ranger",
    fantasy: "A precise ranged fighter who deletes targets before they arrive.",
    combatStyle: "Long range, frequent critical hits",
    color: "#22c55e",
    damageKind: "ranged",
    stats: {
      health: 150,
      armor: 6,
      damage: 28,
      attackSpeed: 1.25,
      range: 9,
      critChance: 0.28,
      critDamage: 2.05,
      abilityPower: 0,
      cooldownReduction: 0.02,
    },
    special: {
      name: "Piercing Volley",
      description: "Every fifth shot punches through a line of enemies.",
      everyNthAttack: 5,
      cleaveTargets: 3,
      damageMultiplier: 0.95,
    },
  },
  {
    id: "summoner",
    name: "Summoner",
    fantasy: "A battlefield caller who overwhelms attackers with conjured allies.",
    combatStyle: "Steady chip damage, many visual allies later",
    color: "#a855f7",
    damageKind: "summon",
    stats: {
      health: 145,
      armor: 5,
      damage: 18,
      attackSpeed: 1.05,
      range: 6,
      critChance: 0.1,
      critDamage: 1.5,
      abilityPower: 18,
      cooldownReduction: 0.06,
    },
    special: {
      name: "Spirit Pack",
      description: "Every third command sends spirits at multiple enemies.",
      everyNthAttack: 3,
      cleaveTargets: 4,
      damageMultiplier: 0.7,
    },
  },
  {
    id: "guardian",
    name: "Guardian",
    fantasy: "A shielded defender who survives pressure and crushes close targets.",
    combatStyle: "High armor, stable melee damage",
    color: "#f59e0b",
    damageKind: "melee",
    stats: {
      health: 240,
      armor: 21,
      damage: 23,
      attackSpeed: 0.95,
      range: 1.9,
      critChance: 0.1,
      critDamage: 1.55,
      abilityPower: 0,
      cooldownReduction: 0,
    },
    special: {
      name: "Shield Slam",
      description: "Every fourth attack hits a small cluster while holding the line.",
      everyNthAttack: 4,
      cleaveTargets: 3,
      damageMultiplier: 0.9,
    },
  },
];

export const enemies: Record<string, EnemyDefinition> = {
  skeleton: {
    id: "skeleton",
    name: "Skeleton",
    health: 34,
    armor: 2,
    damage: 2,
    attackSpeed: 0.35,
    moveSpeed: 1.2,
    rewardXp: 5,
    rewardGold: 3,
  },
};

export const lootRarities: Record<LootRarity, LootRarityDefinition> = {
  common: {
    rarity: "common",
    label: "Common",
    color: "#cbd5e1",
    powerMultiplier: 1,
    modifierCount: 1,
  },
  uncommon: {
    rarity: "uncommon",
    label: "Uncommon",
    color: "#4ade80",
    powerMultiplier: 1.22,
    modifierCount: 1,
  },
  rare: {
    rarity: "rare",
    label: "Rare",
    color: "#38bdf8",
    powerMultiplier: 1.55,
    modifierCount: 2,
  },
  epic: {
    rarity: "epic",
    label: "Epic",
    color: "#c084fc",
    powerMultiplier: 2,
    modifierCount: 3,
  },
  legendary: {
    rarity: "legendary",
    label: "Legendary",
    color: "#f59e0b",
    powerMultiplier: 2.8,
    modifierCount: 4,
  },
  set: {
    rarity: "set",
    label: "Set",
    color: "#2dd4bf",
    powerMultiplier: 2.35,
    modifierCount: 3,
  },
};

export const lootBaseItems: LootBaseItemDefinition[] = [
  { id: "notched-axe", name: "Notched Axe", slot: "weapon" },
  { id: "ashwood-staff", name: "Ashwood Staff", slot: "weapon" },
  { id: "patched-mail", name: "Patched Mail", slot: "armor" },
  { id: "bone-charm", name: "Bone Charm", slot: "trinket" },
  { id: "gate-ring", name: "Gate Ring", slot: "trinket" },
];

export const legendaryLootItems: LootNamedItemDefinition[] = [
  { id: "westering-ember-shard", name: "Westering Ember Shard", slot: "weapon" },
  { id: "blackwall-oathblade", name: "Blackwall Oathblade", slot: "weapon" },
  { id: "twin-moon-silverbrand", name: "Twin-Moon Silverbrand", slot: "weapon" },
  { id: "pale-road-badge", name: "Pale Road Badge", slot: "trinket" },
  { id: "void-hum-resonator", name: "Void-Hum Resonator", slot: "weapon" },
  { id: "ashen-contract-medallion", name: "Ashen Contract Medallion", slot: "trinket" },
  { id: "last-watch-longcoat", name: "Last Watch Longcoat", slot: "armor" },
];

export const lootAffixes: LootAffixDefinition[] = [
  { id: "brutal", name: "Brutal", stat: "damage", minPerLevel: 1.7, maxPerLevel: 3.4 },
  { id: "sturdy", name: "Sturdy", stat: "health", minPerLevel: 7, maxPerLevel: 14 },
  { id: "guarded", name: "Guarded", stat: "armor", minPerLevel: 0.8, maxPerLevel: 1.8 },
  { id: "quick", name: "Quick", stat: "attackSpeed", minPerLevel: 0.015, maxPerLevel: 0.035 },
  { id: "precise", name: "Precise", stat: "critChance", minPerLevel: 0.01, maxPerLevel: 0.025 },
  { id: "forceful", name: "Forceful", stat: "critDamage", minPerLevel: 0.03, maxPerLevel: 0.07 },
  { id: "charged", name: "Charged", stat: "abilityPower", minPerLevel: 1.4, maxPerLevel: 3.2 },
  { id: "focused", name: "Focused", stat: "cooldownReduction", minPerLevel: 0.006, maxPerLevel: 0.016 },
];

export const lootSets: LootSetDefinition[] = [
  {
    id: "ninefold-road",
    name: "Ninefold Road Relics",
    pieces: [
      { name: "Wayfarer's Ember Cutter", slot: "weapon" },
      { name: "Grey Road Mantle", slot: "armor" },
      { name: "Small Golden Burden", slot: "trinket" },
    ],
  },
  {
    id: "black-ice-vigil",
    name: "Black Ice Vigil",
    pieces: [
      { name: "Crowless Watchblade", slot: "weapon" },
      { name: "Frost-Vow Harness", slot: "armor" },
      { name: "Northern Ember Seal", slot: "trinket" },
    ],
  },
  {
    id: "pale-contract",
    name: "Pale Contract Gear",
    pieces: [
      { name: "Two-Moon Silver Fang", slot: "weapon" },
      { name: "Potion-Stained Jerkin", slot: "armor" },
      { name: "Monster Ledger Charm", slot: "trinket" },
    ],
  },
  {
    id: "last-road",
    name: "Last Road Keepsakes",
    pieces: [
      { name: "Barbed Lullaby Token", slot: "trinket" },
      { name: "Fenced County Leathers", slot: "armor" },
      { name: "Roadhouse Cleaver", slot: "weapon" },
    ],
  },
  {
    id: "far-star",
    name: "Far-Star Relics",
    pieces: [
      { name: "Humming Lightrod", slot: "weapon" },
      { name: "Twin-Sun Desert Wrap", slot: "armor" },
      { name: "Rebel Spark Cell", slot: "trinket" },
    ],
  },
];

export const starterLevel: LevelDefinition = {
  id: "level-1",
  name: "Level 1",
  subtitle: "The Bone Gate",
  levelNumber: 1,
  durationLimit: 45,
  seed: 1729,
  chest: {
    itemLevel: 1,
    rarityWeights: {
      common: 700,
      uncommon: 220,
      rare: 65,
      epic: 13,
      legendary: 2,
      set: 1,
    },
    goldBonus: {
      min: 4,
      max: 12,
    },
  },
  enemyWaves: [
    { enemyId: "skeleton", count: 10, startsAt: 0, interval: 0.8, gate: "north" },
    { enemyId: "skeleton", count: 8, startsAt: 4, interval: 0.75, gate: "east" },
    { enemyId: "skeleton", count: 12, startsAt: 8, interval: 0.55, gate: "west" },
  ],
};
