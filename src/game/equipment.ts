import { applyStatModifiers } from "./stats";
import type { Equipment, HeroClass, LootItem, LootRarity, StatKey } from "./types";

export const EMPTY_EQUIPMENT: Equipment = { weapon: null, armor: null, trinket: null };

const POWER_WEIGHTS: Record<StatKey, number> = {
  damage: 1,
  abilityPower: 1,
  health: 0.1,
  armor: 1.5,
  range: 3,
  attackSpeed: 110,
  critDamage: 55,
  critChance: 220,
  cooldownReduction: 320,
};

const SALVAGE_RARITY_VALUE: Record<LootRarity, number> = {
  common: 4,
  uncommon: 7,
  rare: 12,
  epic: 20,
  legendary: 35,
  set: 28,
};

export interface AutoEquipResult {
  equipment: Equipment;
  replaced: LootItem | null;
  equipped: boolean;
}

export function applyEquipmentToHero(heroClass: HeroClass, equipment: Equipment): HeroClass {
  const equipped = [equipment.weapon, equipment.armor, equipment.trinket].filter(
    (item): item is LootItem => item !== null,
  );

  // Applied one modifier at a time to preserve additivity through applyStatModifiers.
  // Correct as long as modifiers are non-negative: incremental clamping then equals
  // clamping the summed total. Revisit if penalty/negative affixes are ever added.
  const stats = equipped.reduce(
    (current, item) =>
      item.modifiers.reduce(
        (accumulated, modifier) => applyStatModifiers(accumulated, { [modifier.stat]: modifier.amount }),
        current,
      ),
    heroClass.stats,
  );

  return { ...heroClass, stats };
}

export function itemPowerScore(item: LootItem): number {
  return item.modifiers.reduce((total, modifier) => total + modifier.amount * POWER_WEIGHTS[modifier.stat], 0);
}

export function autoEquipIfBetter(equipment: Equipment, item: LootItem): AutoEquipResult {
  const current = equipment[item.slot];
  const isBetter = current === null || itemPowerScore(item) > itemPowerScore(current);

  if (!isBetter) {
    return { equipment, replaced: null, equipped: false };
  }

  return {
    equipment: { ...equipment, [item.slot]: item },
    replaced: current,
    equipped: true,
  };
}

export function salvageValue(item: LootItem): number {
  return Math.max(1, Math.round(SALVAGE_RARITY_VALUE[item.rarity] * item.itemLevel));
}
