import { lootAffixes, lootBaseItems, lootRarities, lootSets } from "./content";
import { createSeededRandom } from "./random";
import type {
  ChestReward,
  EquipmentSlot,
  HeroClass,
  LevelDefinition,
  LootAffixDefinition,
  LootItem,
  LootModifier,
  LootRarity,
  StatKey,
} from "./types";

const STAT_LABELS: Record<StatKey, string> = {
  health: "health",
  armor: "armor",
  damage: "damage",
  attackSpeed: "attack speed",
  range: "range",
  critChance: "critical chance",
  critDamage: "critical damage",
  abilityPower: "ability power",
  cooldownReduction: "cooldown reduction",
};

const PERCENT_STATS = new Set<StatKey>(["attackSpeed", "critChance", "critDamage", "cooldownReduction"]);

export function generateChestReward(
  heroClass: HeroClass,
  level: LevelDefinition,
  chestIndex: number,
): ChestReward {
  const seed = buildChestSeed(heroClass, level, chestIndex);
  const random = createSeededRandom(seed);
  const rarity = rollRarity(level.chest.rarityWeights, random);
  const rarityDefinition = lootRarities[rarity];
  const itemLevel = level.chest.itemLevel;
  const item = rarity === "set" ? rollSetItem(seed, itemLevel, random) : rollStandardItem(seed, rarity, itemLevel, random);
  const goldBonus = rollInteger(level.chest.goldBonus.min, level.chest.goldBonus.max, random);

  return {
    seed,
    levelId: level.id,
    goldBonus,
    item: {
      ...item,
      modifiers: rollModifiers(itemLevel, rarityDefinition.powerMultiplier, rarityDefinition.modifierCount, random),
    },
  };
}

export function rollRarity(weights: Record<LootRarity, number>, random: () => number): LootRarity {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0) as Array<[LootRarity, number]>;
  const totalWeight = entries.reduce((total, [, weight]) => total + weight, 0);
  let roll = random() * totalWeight;

  for (const [rarity, weight] of entries) {
    roll -= weight;

    if (roll <= 0) {
      return rarity;
    }
  }

  return entries.at(-1)?.[0] ?? "common";
}

function rollStandardItem(
  seed: number,
  rarity: LootRarity,
  itemLevel: number,
  random: () => number,
): Omit<LootItem, "modifiers"> {
  const baseItem = pickOne(lootBaseItems, random);

  return {
    id: `${seed}-${baseItem.id}`,
    name: `${lootRarities[rarity].label} ${baseItem.name}`,
    rarity,
    slot: baseItem.slot,
    itemLevel,
  };
}

function rollSetItem(seed: number, itemLevel: number, random: () => number): Omit<LootItem, "modifiers"> {
  const set = pickOne(lootSets, random);
  const piece = pickOne(set.pieces, random);

  return {
    id: `${seed}-${set.id}-${slugify(piece.name)}`,
    name: piece.name,
    rarity: "set",
    slot: piece.slot,
    itemLevel,
    setId: set.id,
    setName: set.name,
  };
}

function rollModifiers(
  itemLevel: number,
  powerMultiplier: number,
  modifierCount: number,
  random: () => number,
): LootModifier[] {
  const availableAffixes = [...lootAffixes];
  const modifiers: LootModifier[] = [];

  for (let i = 0; i < modifierCount && availableAffixes.length > 0; i += 1) {
    const affix = removeOne(availableAffixes, random);
    const amount = rollModifierAmount(affix, itemLevel, powerMultiplier, random);

    modifiers.push({
      stat: affix.stat,
      label: `${affix.name}: ${formatModifier(affix.stat, amount)}`,
      amount,
    });
  }

  return modifiers;
}

function rollModifierAmount(
  affix: LootAffixDefinition,
  itemLevel: number,
  powerMultiplier: number,
  random: () => number,
): number {
  const rawValue = (affix.minPerLevel + (affix.maxPerLevel - affix.minPerLevel) * random()) * itemLevel * powerMultiplier;

  if (PERCENT_STATS.has(affix.stat)) {
    return Math.round(rawValue * 1000) / 1000;
  }

  return Math.max(1, Math.round(rawValue));
}

function formatModifier(stat: StatKey, amount: number): string {
  if (PERCENT_STATS.has(stat)) {
    return `+${Math.round(amount * 100)}% ${STAT_LABELS[stat]}`;
  }

  return `+${amount} ${STAT_LABELS[stat]}`;
}

function buildChestSeed(heroClass: HeroClass, level: LevelDefinition, chestIndex: number): number {
  let hash = level.seed + level.levelNumber * 1009 + chestIndex * 9176;

  for (const character of heroClass.id) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }

  return hash >>> 0;
}

function rollInteger(min: number, max: number, random: () => number): number {
  return Math.floor(min + random() * (max - min + 1));
}

function pickOne<T>(values: T[], random: () => number): T {
  return values[Math.floor(random() * values.length)];
}

function removeOne<T>(values: T[], random: () => number): T {
  const index = Math.floor(random() * values.length);
  const [value] = values.splice(index, 1);

  return value;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
