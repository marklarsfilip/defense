import { describe, expect, it } from "vitest";
import { heroClasses } from "./content";
import { applyTalentsToHero, getAvailableTalents, getTalentPointBudget } from "./talents";

describe("talents", () => {
  it("grants one talent point every two hero levels", () => {
    expect(getTalentPointBudget(1)).toBe(0);
    expect(getTalentPointBudget(2)).toBe(1);
    expect(getTalentPointBudget(5)).toBe(2);
  });

  it("filters available talents by level, class, and selected talents", () => {
    const levelTwoTalents = getAvailableTalents(2, "berserker", []);
    const levelFourTalents = getAvailableTalents(4, "berserker", ["battle-hardened"]);

    expect(levelTwoTalents.map((talent) => talent.id)).toContain("battle-hardened");
    expect(levelTwoTalents.some((talent) => talent.classId === "arcanist")).toBe(false);
    expect(levelFourTalents.map((talent) => talent.id)).toContain("throwing-drills");
    expect(levelFourTalents.map((talent) => talent.id)).not.toContain("battle-hardened");
  });

  it("applies selected talent stat modifiers to the hero", () => {
    const berserker = heroClasses.find((heroClass) => heroClass.id === "berserker")!;
    const modified = applyTalentsToHero(berserker, ["battle-hardened", "throwing-drills"]);

    expect(modified.stats.health).toBe(berserker.stats.health + 35);
    expect(modified.stats.damage).toBe(berserker.stats.damage + 5);
    expect(modified.stats.range).toBeGreaterThan(berserker.stats.range);
  });
});
