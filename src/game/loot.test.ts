import { describe, expect, it } from "vitest";
import { heroClasses, starterLevel } from "./content";
import { generateChestReward, rollRarity } from "./loot";
import type { LevelDefinition, LootRarity } from "./types";

const zeroWeights: Record<LootRarity, number> = {
  common: 0,
  uncommon: 0,
  rare: 0,
  epic: 0,
  legendary: 0,
  set: 0,
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

    expect(reward.item.rarity).toBe("set");
    expect(reward.item.setName).toBe("Bone Gate Regalia");
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
