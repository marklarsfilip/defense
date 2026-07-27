import { describe, expect, it } from "vitest";
import { applyStatModifiers } from "./stats";
import type { Stats } from "./types";

const BASE: Stats = {
  health: 100,
  armor: 5,
  damage: 20,
  attackSpeed: 1,
  range: 3,
  critChance: 0.9,
  critDamage: 1.5,
  abilityPower: 0,
  cooldownReduction: 0.7,
};

describe("applyStatModifiers", () => {
  it("adds flat stats additively", () => {
    const result = applyStatModifiers(BASE, { damage: 5, health: 30 });
    expect(result.damage).toBe(25);
    expect(result.health).toBe(130);
  });

  it("clamps critChance to 0.95 and cooldownReduction to 0.75", () => {
    const result = applyStatModifiers(BASE, { critChance: 0.2, cooldownReduction: 0.2 });
    expect(result.critChance).toBe(0.95);
    expect(result.cooldownReduction).toBe(0.75);
  });

  it("clamps critChance and cooldownReduction to a floor of 0", () => {
    const result = applyStatModifiers(BASE, { critChance: -2, cooldownReduction: -2 });
    expect(result.critChance).toBe(0);
    expect(result.cooldownReduction).toBe(0);
  });

  it("does not mutate the input", () => {
    const result = applyStatModifiers(BASE, { damage: 5 });
    expect(BASE.damage).toBe(20);
    expect(result).not.toBe(BASE);
  });

  it("carries over unmodified fields unchanged", () => {
    const result = applyStatModifiers(BASE, { damage: 5 });
    expect(result.armor).toBe(BASE.armor);
  });
});
