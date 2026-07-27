import { formatModifierValue, quantizeModifierAmount, rollItemModifiers } from "./loot";
import type { LootItem, LootModifier, LootRarity } from "./types";

export const MAX_UPGRADE_LEVEL = 5;
const UPGRADE_FACTOR = 1.15;

const UPGRADE_BASE: Record<LootRarity, number> = {
  common: 15,
  uncommon: 25,
  rare: 45,
  epic: 75,
  legendary: 130,
  set: 100,
};

const REROLL_BASE: Record<LootRarity, number> = {
  common: 10,
  uncommon: 18,
  rare: 32,
  epic: 55,
  legendary: 95,
  set: 75,
};

export function canUpgrade(item: LootItem): boolean {
  return (item.upgradeLevel ?? 0) < MAX_UPGRADE_LEVEL;
}

export function upgradeItem(item: LootItem): LootItem {
  if (!canUpgrade(item)) {
    return item;
  }

  return {
    ...item,
    upgradeLevel: (item.upgradeLevel ?? 0) + 1,
    modifiers: item.modifiers.map(scaleModifier),
  };
}

export function rerollItemModifiers(item: LootItem): LootItem {
  const rerolls = (item.rerolls ?? 0) + 1;
  const seed = buildRerollSeed(item.id, rerolls);

  return {
    ...item,
    modifiers: rollItemModifiers(item.rarity, item.itemLevel, seed),
    rerolls,
    upgradeLevel: 0,
  };
}

export function upgradeCost(item: LootItem): number {
  const level = item.upgradeLevel ?? 0;
  return Math.max(1, Math.round(UPGRADE_BASE[item.rarity] * item.itemLevel * (level + 1)));
}

export function rerollCost(item: LootItem): number {
  return Math.max(1, Math.round(REROLL_BASE[item.rarity] * item.itemLevel));
}

function scaleModifier(modifier: LootModifier): LootModifier {
  const amount = quantizeModifierAmount(modifier.stat, modifier.amount * UPGRADE_FACTOR);
  const prefix = modifier.label.includes(":") ? modifier.label.slice(0, modifier.label.indexOf(":")) : modifier.stat;
  return {
    stat: modifier.stat,
    amount,
    label: `${prefix}: ${formatModifierValue(modifier.stat, amount)}`,
  };
}

function buildRerollSeed(id: string, rerolls: number): number {
  let hash = 2166136261;
  for (const character of id) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  hash = Math.imul(hash ^ (rerolls + 1), 16777619);
  return hash >>> 0;
}
