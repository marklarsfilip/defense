import { describe, expect, it } from "vitest";
import {
  abilityDamagePerTarget,
  abilityShieldAmount,
  effectiveCooldown,
  summonDamagePerTick,
} from "./abilities";
import type { AbilityDefinition } from "./types";

const dmg: AbilityDefinition = {
  id: "a", name: "A", description: "", cooldown: 10,
  effect: { kind: "damage", targets: 3, damageMultiplier: 1.5, apScaling: 1 },
};

describe("effectiveCooldown", () => {
  it("shrinks with cooldownReduction", () => {
    expect(effectiveCooldown(dmg, 0)).toBe(10);
    expect(effectiveCooldown(dmg, 0.5)).toBe(5);
  });
});

describe("abilityDamagePerTarget", () => {
  it("scales with abilityPower and multiplier", () => {
    // (heroDamage 20 + ap 10 * apScaling 1) * mult 1.5 * levelMult 1 = 45
    expect(abilityDamagePerTarget({ kind: "damage", targets: 3, damageMultiplier: 1.5, apScaling: 1 }, 20, 10, 1)).toBe(45);
    // more ability power => more damage
    expect(abilityDamagePerTarget({ kind: "damage", targets: 3, damageMultiplier: 1.5, apScaling: 1 }, 20, 40, 1)).toBeGreaterThan(45);
  });
});

describe("abilityShieldAmount", () => {
  it("adds ability power scaled by apScaling", () => {
    expect(abilityShieldAmount({ kind: "shield", amount: 60, apScaling: 1.2, duration: 5 }, 20)).toBe(84); // 60 + 20*1.2
  });
});

describe("summonDamagePerTick", () => {
  it("is dps*interval plus ap scaling, floored at 1", () => {
    expect(summonDamagePerTick({ kind: "summon", dps: 14, apScaling: 0.6, interval: 0.8, duration: 6 }, 20)).toBe(23); // round(14*0.8 + 20*0.6)=round(11.2+12)=round(23.2)=23
  });
});
