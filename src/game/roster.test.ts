import { describe, expect, it } from "vitest";
import { buildLevelRoster } from "./roster";
import { createCampaignLevel } from "./levels";

describe("buildLevelRoster", () => {
  it("sums counts across waves of the same enemy", () => {
    const roster = buildLevelRoster(createCampaignLevel(1));

    expect(roster).toHaveLength(1);
    expect(roster[0].enemyId).toBe("skeleton");
    expect(roster[0].count).toBe(30);
  });

  it("describes only the traits that carry rules", () => {
    const roster = buildLevelRoster(createCampaignLevel(4));
    const brute = roster.find((entry) => entry.enemyId === "graveBrute")!;

    expect(brute.traits.map((trait) => trait.trait)).toEqual(["armored"]);
    expect(brute.traits[0].summary).toContain("Plated");
  });

  it("lists every distinct enemy in a multi-enemy level in first-spawn order", () => {
    const roster = buildLevelRoster(createCampaignLevel(10));

    expect(roster.map((entry) => entry.enemyId)).toEqual(["gateTitan", "rotImp"]);
  });

  it("returns an empty roster for a level with no waves", () => {
    expect(buildLevelRoster({ ...createCampaignLevel(1), enemyWaves: [] })).toEqual([]);
  });
});
