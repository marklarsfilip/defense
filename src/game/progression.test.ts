import { describe, expect, it } from "vitest";
import { heroClasses, starterLevel } from "./content";
import {
  applyCombatRewards,
  createInitialCampaign,
  getExperienceForNextLevel,
  learnCampaignTalent,
  restoreCampaign,
  selectCampaignClass,
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

const chestReward = {
  seed: 123,
  levelId: starterLevel.id,
  goldBonus: 7,
  item: {
    id: "item-1",
    name: "Rare Test Axe",
    rarity: "rare" as const,
    slot: "weapon" as const,
    itemLevel: 1,
    modifiers: [{ stat: "damage" as const, label: "Brutal: +3 damage", amount: 3 }],
  },
};

describe("progression", () => {
  it("applies victory rewards and records completed levels", () => {
    const campaign = applyCombatRewards(createInitialCampaign(), victoryResult);

    expect(campaign.gold).toBe(90);
    expect(campaign.victories).toBe(1);
    expect(campaign.totalEnemiesDefeated).toBe(30);
    expect(campaign.completedLevelIds).toEqual([starterLevel.id]);
    expect(campaign.nextLevelNumber).toBe(2);
  });

  it("levels up from earned experience", () => {
    const campaign = applyCombatRewards(createInitialCampaign(), victoryResult);

    expect(getExperienceForNextLevel(1)).toBe(100);
    expect(campaign.heroLevel).toBe(2);
    expect(campaign.experience).toBe(50);
  });

  it("banks chest gold and inventory on victory", () => {
    const campaign = applyCombatRewards(createInitialCampaign(), victoryResult, chestReward);

    expect(campaign.gold).toBe(97);
    expect(campaign.chestsOpened).toBe(1);
    expect(campaign.inventory).toEqual([chestReward.item]);
  });

  it("queues bonus levels without consuming the next normal level until cleared", () => {
    const queuedCampaign = applyCombatRewards(createInitialCampaign(), victoryResult, chestReward, 1);
    const bonusCampaign = applyCombatRewards(queuedCampaign, {
      ...victoryResult,
      level: {
        ...victoryResult.level,
        id: "bonus-pasture-after-1",
        kind: "bonus",
      },
    });

    expect(queuedCampaign.nextLevelNumber).toBe(2);
    expect(queuedCampaign.queuedBonusLevelAfter).toBe(1);
    expect(bonusCampaign.nextLevelNumber).toBe(2);
    expect(bonusCampaign.queuedBonusLevelAfter).toBeNull();
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

  it("learns talents up to the current point budget", () => {
    const levelTwoCampaign = {
      ...createInitialCampaign(),
      heroLevel: 2,
    };
    const firstTalent = learnCampaignTalent(levelTwoCampaign, "battle-hardened");
    const overspent = learnCampaignTalent(firstTalent, "sharpened-instincts");

    expect(firstTalent.selectedTalentIds).toEqual(["battle-hardened"]);
    expect(overspent.selectedTalentIds).toEqual(["battle-hardened"]);
  });

  it("drops incompatible class talents when changing class", () => {
    const campaign = selectCampaignClass(
      {
        ...createInitialCampaign(),
        selectedTalentIds: ["battle-hardened", "throwing-drills"],
      },
      "arcanist",
    );

    expect(campaign.selectedTalentIds).toEqual(["battle-hardened"]);
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
      nextLevelNumber: 4,
      queuedBonusLevelAfter: 3,
      selectedTalentIds: ["battle-hardened", 123],
    });

    expect(campaign.selectedClassId).toBe("ranger");
    expect(campaign.heroLevel).toBe(3);
    expect(campaign.completedLevelIds).toEqual([starterLevel.id]);
    expect(campaign.nextLevelNumber).toBe(4);
    expect(campaign.queuedBonusLevelAfter).toBe(3);
    expect(campaign.selectedTalentIds).toEqual(["battle-hardened"]);
  });
});
