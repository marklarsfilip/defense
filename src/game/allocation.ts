import { applyStatModifiers } from "./stats";
import type { AllocatableStat, HeroClass, Stats } from "./types";

export const ALLOCATABLE_STATS: AllocatableStat[] = ["health", "damage", "armor", "abilityPower", "critChance"];

export const STAT_POINT_INCREMENTS: Record<AllocatableStat, number> = {
  health: 12,
  damage: 2,
  armor: 1,
  abilityPower: 2,
  critChance: 0.01,
};

export type StatAllocation = Record<AllocatableStat, number>;

export const EMPTY_ALLOCATION: StatAllocation = {
  health: 0,
  damage: 0,
  armor: 0,
  abilityPower: 0,
  critChance: 0,
};

export function getStatPointBudget(heroLevel: number): number {
  return Math.max(0, (heroLevel - 1) * 2);
}

export function getAllocatedPointCount(allocation: StatAllocation): number {
  return ALLOCATABLE_STATS.reduce((total, stat) => total + (allocation[stat] ?? 0), 0);
}

export function applyAllocationToHero(heroClass: HeroClass, allocation: StatAllocation): HeroClass {
  const modifiers: Partial<Stats> = {};

  for (const stat of ALLOCATABLE_STATS) {
    const points = allocation[stat] ?? 0;
    if (points > 0) {
      modifiers[stat] = points * STAT_POINT_INCREMENTS[stat];
    }
  }

  return { ...heroClass, stats: applyStatModifiers(heroClass.stats, modifiers) };
}
