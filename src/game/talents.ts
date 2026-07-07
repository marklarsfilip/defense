import { talents } from "./content";
import type { HeroClass, HeroClassId, Stats, TalentDefinition } from "./types";

export function getTalentPointBudget(heroLevel: number): number {
  return Math.floor(heroLevel / 2);
}

export function getAvailableTalents(
  heroLevel: number,
  selectedClassId: HeroClassId,
  selectedTalentIds: string[],
): TalentDefinition[] {
  return talents.filter(
    (talent) =>
      talent.levelRequirement <= heroLevel &&
      !selectedTalentIds.includes(talent.id) &&
      (!talent.classId || talent.classId === selectedClassId),
  );
}

export function applyTalentsToHero(heroClass: HeroClass, selectedTalentIds: string[]): HeroClass {
  const selectedTalents = talents.filter(
    (talent) => selectedTalentIds.includes(talent.id) && (!talent.classId || talent.classId === heroClass.id),
  );

  return {
    ...heroClass,
    stats: selectedTalents.reduce((stats, talent) => applyStatModifiers(stats, talent.statModifiers), heroClass.stats),
  };
}

export function getSelectedTalents(selectedTalentIds: string[]): TalentDefinition[] {
  return talents.filter((talent) => selectedTalentIds.includes(talent.id));
}

export function filterTalentIdsForClass(selectedTalentIds: string[], selectedClassId: HeroClassId): string[] {
  return talents
    .filter((talent) => selectedTalentIds.includes(talent.id) && (!talent.classId || talent.classId === selectedClassId))
    .map((talent) => talent.id);
}

function applyStatModifiers(stats: Stats, modifiers: Partial<Stats>): Stats {
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
