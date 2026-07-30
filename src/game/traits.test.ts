import { describe, expect, it } from "vitest";
import { describeEnemyTraits, describeTrait, enemyPlating, hasTraitRule, mitigateByArmor, resolveEnemyDamage, resolveHeroDamage, traitRules } from "./traits";
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

const HERO_HIT = {
  rawDamage: 100,
  traits: [] as EnemyTrait[],
  armor: 0,
  plating: 0,
  damageKind: "melee" as const,
  critical: false,
  targetsHit: 1,
  livingSwarmCount: 0,
};

describe("resolveHeroDamage", () => {
  it("passes damage through untouched when no trait applies", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["ground"] })).toEqual({ damage: 100, appliedTraits: [] });
  });

  it("mitigates by armor before anything else reduces the hit", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, armor: 10 }).damage).toBe(Math.round(mitigateByArmor(100, 10)));
  });

  it("subtracts plating after armor mitigation, not before", () => {
    const armorOnly = resolveHeroDamage({ ...HERO_HIT, traits: ["armored"], armor: 10, plating: 0 }).damage;
    const plated = resolveHeroDamage({ ...HERO_HIT, traits: ["armored"], armor: 10, plating: 9 }).damage;

    expect(plated).toBe(armorOnly - 9);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["armored"], plating: 9 }).appliedTraits).toEqual(["armored"]);
  });

  it("does not report plating when the enemy has none resolved", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["armored"], plating: 0 }).appliedTraits).toEqual([]);
  });

  it("cuts melee damage against flying enemies and leaves other kinds alone", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["flying"] }).damage).toBe(38);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["flying"], damageKind: "ranged" }).damage).toBe(100);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["flying"], damageKind: "ranged" }).appliedTraits).toEqual([]);
  });

  it("amplifies critical hits against fragile enemies only when the hit crits", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["fragile"], critical: true }).damage).toBe(160);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["fragile"] }).damage).toBe(100);
  });

  it("reduces spread damage against bosses only when several enemies were struck", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["boss"], targetsHit: 4 }).damage).toBe(60);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["boss"], targetsHit: 1 }).damage).toBe(100);
  });

  it("scales swarm resistance with packmates and clamps at the cap", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["swarm"], livingSwarmCount: 1 }).damage).toBe(100);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["swarm"], livingSwarmCount: 3 }).damage).toBe(88);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["swarm"], livingSwarmCount: 7 }).damage).toBe(64);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["swarm"], livingSwarmCount: 20 }).damage).toBe(64);
  });

  it("stacks multiple traits multiplicatively and reports each one", () => {
    const resolved = resolveHeroDamage({ ...HERO_HIT, traits: ["flying", "caster", "fragile"], critical: true });

    expect(resolved.damage).toBe(Math.round(100 * 0.38 * 1.6));
    expect(resolved.appliedTraits).toEqual(["flying", "fragile"]);
  });

  it("never resolves a hit below 1 damage, however stacked", () => {
    const resolved = resolveHeroDamage({
      ...HERO_HIT,
      rawDamage: 1,
      traits: ["flying", "armored", "swarm", "boss"],
      armor: 200,
      plating: 9999,
      targetsHit: 5,
      livingSwarmCount: 20,
    });

    expect(resolved.damage).toBe(1);
  });
});

const ENEMY_HIT = {
  rawDamage: 100,
  traits: [] as EnemyTrait[],
  heroArmor: 0,
  livingSwarmCount: 0,
};

describe("resolveEnemyDamage", () => {
  it("mitigates by hero armor when no trait applies", () => {
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["ground"], heroArmor: 20 }).damage)
      .toBe(Math.round(mitigateByArmor(100, 20)));
  });

  it("doubles the strike for dangerous enemies", () => {
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["dangerous"] }).damage).toBe(200);
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["dangerous"] }).appliedTraits).toEqual(["dangerous"]);
  });

  it("ignores 70% of hero armor for casters", () => {
    const pierced = resolveEnemyDamage({ ...ENEMY_HIT, traits: ["caster"], heroArmor: 20 }).damage;

    expect(pierced).toBe(Math.round(mitigateByArmor(100, 20 * 0.3)));
    expect(pierced).toBeGreaterThan(Math.round(mitigateByArmor(100, 20)));
  });

  it("does not claim armor pierce against an unarmored hero", () => {
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["caster"], heroArmor: 0 }).appliedTraits).toEqual([]);
  });

  it("raises swarm damage with packmates and clamps at the cap", () => {
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["swarm"], livingSwarmCount: 1 }).damage).toBe(100);
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["swarm"], livingSwarmCount: 3 }).damage).toBe(120);
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["swarm"], livingSwarmCount: 7 }).damage).toBe(160);
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["swarm"], livingSwarmCount: 20 }).damage).toBe(160);
  });

  it("never resolves an enemy hit below 1 damage", () => {
    expect(resolveEnemyDamage({ ...ENEMY_HIT, rawDamage: 1, traits: ["ground"], heroArmor: 500 }).damage).toBe(1);
  });
});
