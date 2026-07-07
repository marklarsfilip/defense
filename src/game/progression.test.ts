import { describe, expect, it } from "vitest";
import { heroClasses, starterLevel } from "./content";
import {
  applyCombatRewards,
  createInitialCampaign,
  getExperienceForNextLevel,
  restoreCampaign,
} from "./progression";
import type { CombatResult } from "./types";

const victoryResult: CombatResult = {
  heroClass: heroClasses[0],
  level: starterLevel,
  won: true,
  duration: 12,
  heroHealthRemaining: 100,
  enemiesDefeated: 30,
  xp: 150,
  gold: 90,
  events: [],
};

describe("progression", () => {
  it("applies victory rewards and records completed levels", () => {
    const campaign = applyCombatRewards(createInitialCampaign(), victoryResult);

    expect(campaign.gold).toBe(90);
    expect(campaign.victories).toBe(1);
    expect(campaign.totalEnemiesDefeated).toBe(30);
    expect(campaign.completedLevelIds).toEqual([starterLevel.id]);
  });

  it("levels up from earned experience", () => {
    const campaign = applyCombatRewards(createInitialCampaign(), victoryResult);

    expect(getExperienceForNextLevel(1)).toBe(100);
    expect(campaign.heroLevel).toBe(2);
    expect(campaign.experience).toBe(50);
  });

  it("does not apply rewards for defeats", () => {
    const defeatedCampaign = applyCombatRewards(createInitialCampaign(), {
      ...victoryResult,
      won: false,
      xp: 40,
      gold: 20,
    });

    expect(defeatedCampaign).toEqual(createInitialCampaign());
  });

  it("restores save data defensively", () => {
    const campaign = restoreCampaign({
      selectedClassId: "ranger",
      heroLevel: 3.8,
      experience: 42,
      gold: 500,
      victories: 2,
      totalEnemiesDefeated: 60,
      completedLevelIds: [starterLevel.id, 123],
    });

    expect(campaign.selectedClassId).toBe("ranger");
    expect(campaign.heroLevel).toBe(3);
    expect(campaign.completedLevelIds).toEqual([starterLevel.id]);
  });
});
