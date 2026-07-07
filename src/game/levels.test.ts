import { describe, expect, it } from "vitest";
import { createBonusLevel, createCampaignLevel, shouldQueueBonusLevel } from "./levels";

describe("levels", () => {
  it("keeps level 1 as the safe tutorial level", () => {
    const level = createCampaignLevel(1);

    expect(level.id).toBe("level-1");
    expect(level.kind).toBe("normal");
    expect(level.enemyWaves.reduce((total, wave) => total + wave.count, 0)).toBe(30);
    expect(level.notes).toContain("Nearly impossible to fail");
  });

  it("creates boss levels every tenth level", () => {
    const bossLevel = createCampaignLevel(10);
    const normalLevel = createCampaignLevel(11);

    expect(bossLevel.kind).toBe("boss");
    expect(bossLevel.enemyWaves).toHaveLength(1);
    expect(bossLevel.enemyWaves[0].enemyId).toBe("gateTitan");
    expect(normalLevel.kind).toBe("normal");
  });

  it("creates rare deterministic bonus level checks", () => {
    const rolls = Array.from({ length: 1000 }, (_, index) => shouldQueueBonusLevel(index + 1, index));
    const hits = rolls.filter(Boolean).length;

    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(25);
  });

  it("creates bonus pasture levels with stronger rewards than normal levels", () => {
    const normalLevel = createCampaignLevel(8);
    const bonusLevel = createBonusLevel(8);

    expect(bonusLevel.kind).toBe("bonus");
    expect(bonusLevel.enemyWaves).toEqual([{ enemyId: "glitterhorn", count: 1, startsAt: 0.4, interval: 1, gate: "north" }]);
    expect(bonusLevel.combat.rewardMultiplier).toBeGreaterThanOrEqual(normalLevel.combat.rewardMultiplier * 2);
    expect(bonusLevel.chest.goldBonus.min).toBeGreaterThanOrEqual(normalLevel.chest.goldBonus.min * 2);
  });

  it("generates matchup notes for flying and fragile dangerous levels", () => {
    const flyingLevel = createCampaignLevel(5);
    const glassLevel = createCampaignLevel(6);

    expect(flyingLevel.notes).toContain("Melee uses weak thrown attacks");
    expect(flyingLevel.enemyWaves.every((wave) => wave.enemyId === "boneHawk")).toBe(true);
    expect(glassLevel.notes).toContain("Melee burst favored");
    expect(glassLevel.enemyWaves.every((wave) => wave.enemyId === "glassCultist")).toBe(true);
  });
});
