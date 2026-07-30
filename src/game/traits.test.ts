import { describe, expect, it } from "vitest";
import { describeEnemyTraits, describeTrait, enemyPlating, hasTraitRule, traitRules } from "./traits";
import type { EnemyTrait } from "./types";

const ALL_TRAITS: EnemyTrait[] = [
  "ground", "flying", "fragile", "dangerous", "armored", "caster", "swarm", "boss", "bonus",
];

describe("trait rules table", () => {
  it("describes every trait", () => {
    for (const trait of ALL_TRAITS) {
      const description = describeTrait(trait);
      expect(description.trait, trait).toBe(trait);
      expect(description.label.length, trait).toBeGreaterThan(0);
      expect(description.summary.length, trait).toBeGreaterThan(0);
    }
  });

  it("uses the trait knob values the spec fixes", () => {
    expect(traitRules.flying.meleePenalty).toBe(0.38);
    expect(traitRules.fragile.critVulnerability).toBe(1.6);
    expect(traitRules.armored.plating).toBe(9);
    expect(traitRules.caster.armorPierce).toBe(0.7);
    expect(traitRules.dangerous.damageAmplifier).toBe(2);
    expect(traitRules.swarm.pack).toEqual({ damagePerAlly: 0.1, resistancePerAlly: 0.06, maxAllies: 6 });
    expect(traitRules.boss.spreadResistance).toBe(0.6);
  });

  it("marks ground and bonus as rule-free and everything else as rule-bearing", () => {
    expect(hasTraitRule("ground")).toBe(false);
    expect(hasTraitRule("bonus")).toBe(false);
    for (const trait of ALL_TRAITS.filter((t) => t !== "ground" && t !== "bonus")) {
      expect(hasTraitRule(trait), trait).toBe(true);
    }
  });

  it("gives every rule-bearing trait a combat-log line", () => {
    for (const trait of ALL_TRAITS.filter(hasTraitRule)) {
      expect(traitRules[trait].logLine, trait).toBeTruthy();
    }
  });

  it("sums plating across a trait list", () => {
    expect(enemyPlating(["ground", "armored"])).toBe(9);
    expect(enemyPlating(["ground", "flying"])).toBe(0);
  });

  it("describes a trait list in order", () => {
    expect(describeEnemyTraits(["ground", "armored"]).map((entry) => entry.trait)).toEqual(["ground", "armored"]);
  });
});
