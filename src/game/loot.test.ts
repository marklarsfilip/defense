import { describe, expect, it } from "vitest";
import { heroClasses, legendaryLootItems, lootSets, starterLevel } from "./content";
import { generateChestReward, generateLootItem, rollRarity } from "./loot";
import type { LevelDefinition, LootRarity } from "./types";

const zeroWeights: Record<LootRarity, number> = {
  common: 0,
  uncommon: 0,
  rare: 0,
  epic: 0,
  legendary: 0,
  set: 0,
};

const ALL_RARE: Record<LootRarity, number> = {
  common: 0, uncommon: 0, rare: 1, epic: 0, legendary: 0, set: 0,
};

describe("loot", () => {
  it("generates deterministic chest rewards for the same inputs", () => {
    const firstReward = generateChestReward(heroClasses[0], starterLevel, 0);
    const secondReward = generateChestReward(heroClasses[0], starterLevel, 0);

    expect(secondReward).toEqual(firstReward);
  });

  it("rolls the configured rarity when only one weight is enabled", () => {
    const rarity = rollRarity({ ...zeroWeights, legendary: 1 }, () => 0.5);

    expect(rarity).toBe("legendary");
  });

  it("can generate set pieces from chest tables", () => {
    const setOnlyLevel: LevelDefinition = {
      ...starterLevel,
      chest: {
        ...starterLevel.chest,
        rarityWeights: { ...zeroWeights, set: 1 },
      },
    };
    const reward = generateChestReward(heroClasses[1], setOnlyLevel, 0);
    const setNames = lootSets.map((set) => set.name);
    const pieceNames = lootSets.flatMap((set) => set.pieces.map((piece) => piece.name));

    expect(reward.item.rarity).toBe("set");
    expect(setNames).toContain(reward.item.setName);
    expect(pieceNames).toContain(reward.item.name);
  });

  it("uses curated hidden-reference names for legendary items", () => {
    const legendaryOnlyLevel: LevelDefinition = {
      ...starterLevel,
      chest: {
        ...starterLevel.chest,
        rarityWeights: { ...zeroWeights, legendary: 1 },
      },
    };
    const reward = generateChestReward(heroClasses[3], legendaryOnlyLevel, 0);
    const legendaryNames = legendaryLootItems.map((item) => item.name);

    expect(reward.item.rarity).toBe("legendary");
    expect(legendaryNames).toContain(reward.item.name);
    expect(reward.item.name).not.toMatch(/ring|throne|witcher|jedi|sith|skywalker|lucille/i);
  });

  it("scales item modifiers with completed level item level", () => {
    const levelOneReward = generateChestReward(heroClasses[2], starterLevel, 1);
    const higherLevel: LevelDefinition = {
      ...starterLevel,
      chest: {
        ...starterLevel.chest,
        itemLevel: 5,
      },
    };
    const higherLevelReward = generateChestReward(heroClasses[2], higherLevel, 1);
    const levelOnePower = totalModifierPower(levelOneReward.item.modifiers);
    const higherLevelPower = totalModifierPower(higherLevelReward.item.modifiers);

    expect(higherLevelReward.item.itemLevel).toBe(5);
    expect(higherLevelPower).toBeGreaterThan(levelOnePower);
  });
});

function totalModifierPower(modifiers: Array<{ amount: number }>): number {
  return modifiers.reduce((total, modifier) => total + modifier.amount, 0);
}

describe("generateLootItem", () => {
  it("is deterministic for the same seed", () => {
    const a = generateLootItem(12345, ALL_RARE, 5);
    const b = generateLootItem(12345, ALL_RARE, 5);
    expect(a).toEqual(b);
  });

  it("produces different items for different seeds", () => {
    const a = generateLootItem(1, ALL_RARE, 5);
    const b = generateLootItem(2, ALL_RARE, 5);
    expect(a.id).not.toBe(b.id);
  });

  it("respects rarity weights", () => {
    expect(generateLootItem(999, ALL_RARE, 5).rarity).toBe("rare");
  });
});
