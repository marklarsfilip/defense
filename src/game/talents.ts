import { talents } from "./content";
import { applyStatModifiers } from "./stats";
import type { HeroClass, HeroClassId, TalentDefinition } from "./types";

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
