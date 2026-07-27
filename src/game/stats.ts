import type { Stats } from "./types";

export function applyStatModifiers(stats: Stats, modifiers: Partial<Stats>): Stats {
  return {
    health: stats.health + (modifiers.health ?? 0),
    armor: stats.armor + (modifiers.armor ?? 0),
    damage: stats.damage + (modifiers.damage ?? 0),
    attackSpeed: stats.attackSpeed + (modifiers.attackSpeed ?? 0),
    range: stats.range + (modifiers.range ?? 0),
    critChance: clamp(stats.critChance + (modifiers.critChance ?? 0), 0, 0.95),
    critDamage: stats.critDamage + (modifiers.critDamage ?? 0),
    abilityPower: stats.abilityPower + (modifiers.abilityPower ?? 0),
    cooldownReduction: clamp(stats.cooldownReduction + (modifiers.cooldownReduction ?? 0), 0, 0.75),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
