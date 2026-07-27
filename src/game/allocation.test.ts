import { describe, expect, it } from "vitest";
import {
  ALLOCATABLE_STATS,
  EMPTY_ALLOCATION,
  applyAllocationToHero,
  getAllocatedPointCount,
  getStatPointBudget,
} from "./allocation";
import { heroClasses } from "./content";

const berserker = heroClasses[0];

describe("stat point budget", () => {
  it("is 0 at level 1 and grows with level", () => {
    expect(getStatPointBudget(1)).toBe(0);
    expect(getStatPointBudget(5)).toBeGreaterThan(getStatPointBudget(2));
  });
});

describe("getAllocatedPointCount", () => {
  it("sums allocated points", () => {
    expect(getAllocatedPointCount({ ...EMPTY_ALLOCATION, damage: 2, health: 3 })).toBe(5);
  });
});

describe("applyAllocationToHero", () => {
  it("adds increments for allocated stats", () => {
    const hero = applyAllocationToHero(berserker, { ...EMPTY_ALLOCATION, damage: 3 });
    expect(hero.stats.damage).toBe(berserker.stats.damage + 6); // damage +2/point
  });
  it("is a no-op with an empty allocation", () => {
    const hero = applyAllocationToHero(berserker, EMPTY_ALLOCATION);
    expect(hero.stats.damage).toBe(berserker.stats.damage);
  });
  it("covers exactly the five allocatable stats", () => {
    expect(ALLOCATABLE_STATS.slice().sort()).toEqual(["abilityPower", "armor", "critChance", "damage", "health"]);
  });
});
