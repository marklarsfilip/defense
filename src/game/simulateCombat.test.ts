import { describe, expect, it } from "vitest";
import { heroClasses, starterLevel } from "./content";
import { createCampaignLevel } from "./levels";
import { simulateCombat } from "./simulateCombat";

describe("simulateCombat", () => {
  it("makes level 1 winnable for every starter class", () => {
    const results = heroClasses.map((heroClass) => simulateCombat(heroClass, starterLevel));

    expect(results.every((result) => result.won)).toBe(true);
    expect(results.every((result) => result.enemiesDefeated === 30)).toBe(true);
  });

  it("produces deterministic timelines for the same class and level", () => {
    const firstRun = simulateCombat(heroClasses[0], starterLevel);
    const secondRun = simulateCombat(heroClasses[0], starterLevel);

    expect(secondRun).toEqual(firstRun);
  });

  it("keeps the result independent from replay rendering", () => {
    const result = simulateCombat(heroClasses[1], starterLevel);
    const finalEvent = result.events.at(-1);

    expect(finalEvent?.type).toBe("levelComplete");
    expect(result.xp).toBe(150);
    expect(result.gold).toBe(90);
  });

  it("lets melee heroes hit flying enemies with weaker fallback attacks", () => {
    const flyingLevel = createCampaignLevel(2);
    const berserker = heroClasses.find((heroClass) => heroClass.id === "berserker")!;
    const ranger = heroClasses.find((heroClass) => heroClass.id === "ranger")!;
    const meleeResult = simulateCombat(berserker, flyingLevel);
    const rangerResult = simulateCombat(ranger, flyingLevel);

    expect(meleeResult.enemiesDefeated).toBeGreaterThan(0);
    expect(rangerResult.enemiesDefeated).toBeGreaterThan(meleeResult.enemiesDefeated);
  });
});
