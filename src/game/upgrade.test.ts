import { describe, expect, it } from "vitest";
import {
  MAX_UPGRADE_LEVEL,
  canUpgrade,
  rerollCost,
  rerollItemModifiers,
  upgradeCost,
  upgradeItem,
} from "./upgrade";
import type { LootItem } from "./types";

function item(overrides: Partial<LootItem> = {}): LootItem {
  return {
    id: "itm-1",
    name: "Test Blade",
    rarity: "rare",
    slot: "weapon",
    itemLevel: 5,
    modifiers: [
      { stat: "damage", label: "Brutal: +10 damage", amount: 10 },
      { stat: "critChance", label: "Precise: +5% critical chance", amount: 0.05 },
    ],
    ...overrides,
  };
}

describe("upgradeItem", () => {
  it("scales modifier amounts up and bumps upgradeLevel", () => {
    const up = upgradeItem(item());
    expect(up.upgradeLevel).toBe(1);
    expect(up.modifiers[0].amount).toBeGreaterThan(10);
    expect(up.modifiers[0].label).toContain("Brutal");
  });

  it("does not upgrade past the cap", () => {
    const maxed = item({ upgradeLevel: MAX_UPGRADE_LEVEL });
    expect(canUpgrade(maxed)).toBe(false);
    expect(upgradeItem(maxed)).toBe(maxed);
  });

  it("grows a low flat modifier on every upgrade", () => {
    let current = item({
      upgradeLevel: 0,
      modifiers: [{ stat: "damage", label: "Brutal: +1 damage", amount: 1 }],
    });
    const first = upgradeItem(current);
    expect(first.modifiers[0].amount).toBeGreaterThanOrEqual(2);

    const amounts = [current.modifiers[0].amount];
    for (let i = 0; i < MAX_UPGRADE_LEVEL; i += 1) {
      current = upgradeItem(current);
      amounts.push(current.modifiers[0].amount);
    }

    for (let i = 1; i < amounts.length; i += 1) {
      expect(amounts[i]).toBeGreaterThan(amounts[i - 1]);
    }
  });

  it("grows a percent modifier without bumping it by a whole integer", () => {
    const up = upgradeItem(item({
      modifiers: [{ stat: "critChance", label: "Precise: +5% critical chance", amount: 0.05 }],
    }));
    expect(up.modifiers[0].amount).toBeGreaterThan(0.05);
    expect(up.modifiers[0].amount).toBeLessThan(1);
  });
});

describe("rerollItemModifiers", () => {
  it("is deterministic per (id, rerolls) and increments rerolls", () => {
    const a = rerollItemModifiers(item());
    const b = rerollItemModifiers(item());
    expect(a.modifiers).toEqual(b.modifiers);
    expect(a.rerolls).toBe(1);
  });

  it("varies across successive rerolls and resets upgradeLevel", () => {
    const first = rerollItemModifiers(item({ upgradeLevel: 3 }));
    const second = rerollItemModifiers(first);
    expect(first.upgradeLevel).toBe(0);
    expect(second.modifiers).not.toEqual(first.modifiers);
  });
});

describe("costs", () => {
  it("upgradeCost escalates with upgradeLevel", () => {
    expect(upgradeCost(item({ upgradeLevel: 1 }))).toBeGreaterThan(upgradeCost(item({ upgradeLevel: 0 })));
  });
  it("rerollCost is flat across rerolls but scales with rarity", () => {
    expect(rerollCost(item({ rerolls: 5 }))).toBe(rerollCost(item({ rerolls: 0 })));
    expect(rerollCost(item({ rarity: "legendary" }))).toBeGreaterThan(rerollCost(item({ rarity: "common" })));
  });
});
