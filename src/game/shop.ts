import { generateLootItem } from "./loot";
import type { LootItem, LootRarity, ShopOffer } from "./types";

export const SHOP_SIZE = 4;

const SHOP_RARITY_WEIGHTS: Record<LootRarity, number> = {
  common: 30,
  uncommon: 34,
  rare: 22,
  epic: 10,
  legendary: 3,
  set: 4,
};

const BUY_RARITY_BASE: Record<LootRarity, number> = {
  common: 12,
  uncommon: 20,
  rare: 36,
  epic: 62,
  legendary: 105,
  set: 82,
};

export function rollShopStock(heroLevel: number, shopRerolls: number): ShopOffer[] {
  const itemLevel = Math.max(1, heroLevel);
  const offers: ShopOffer[] = [];

  for (let index = 0; index < SHOP_SIZE; index += 1) {
    const seed = buildShopSeed(heroLevel, shopRerolls, index);
    const item = generateLootItem(seed, SHOP_RARITY_WEIGHTS, itemLevel);
    offers.push({ item, price: shopItemPrice(item) });
  }

  return offers;
}

export function shopItemPrice(item: LootItem): number {
  return Math.max(1, Math.round(BUY_RARITY_BASE[item.rarity] * item.itemLevel));
}

export function getRerollCost(shopRerolls: number): number {
  return 25 + shopRerolls * 20;
}

function buildShopSeed(heroLevel: number, shopRerolls: number, index: number): number {
  let hash = Math.imul(heroLevel + 1, 2654435761);
  hash = Math.imul(hash ^ (shopRerolls + 1), 2246822519);
  hash = Math.imul(hash ^ (index + 1), 3266489917);
  return hash >>> 0;
}
