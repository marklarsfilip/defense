import type { AbilityDefinition, AbilityEffect } from "./types";

export function effectiveCooldown(ability: AbilityDefinition, cooldownReduction: number): number {
  return ability.cooldown * (1 - cooldownReduction);
}

export function abilityDamagePerTarget(
  effect: Extract<AbilityEffect, { kind: "damage" }>,
  heroDamage: number,
  abilityPower: number,
  levelMultiplier: number,
): number {
  return Math.round((heroDamage + abilityPower * effect.apScaling) * effect.damageMultiplier * levelMultiplier);
}

export function abilityShieldAmount(
  effect: Extract<AbilityEffect, { kind: "shield" }>,
  abilityPower: number,
): number {
  return Math.round(effect.amount + abilityPower * effect.apScaling);
}

export function summonDamagePerTick(
  effect: Extract<AbilityEffect, { kind: "summon" }>,
  abilityPower: number,
): number {
  return Math.max(1, Math.round(effect.dps * effect.interval + abilityPower * effect.apScaling));
}
