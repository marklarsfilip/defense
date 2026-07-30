import { enemies } from "./content";
import { describeEnemyTraits, hasTraitRule } from "./traits";
import type { LevelDefinition, TraitDescription } from "./types";

export interface RosterEntry {
  enemyId: string;
  name: string;
  count: number;
  traits: TraitDescription[];
}

/** Groups a level's waves into one entry per enemy, in first-spawn order. */
export function buildLevelRoster(level: LevelDefinition): RosterEntry[] {
  const entries = new Map<string, RosterEntry>();

  for (const wave of [...level.enemyWaves].sort((a, b) => a.startsAt - b.startsAt)) {
    const definition = enemies[wave.enemyId];
    if (!definition) {
      continue;
    }

    const existing = entries.get(wave.enemyId);
    if (existing) {
      existing.count += wave.count;
      continue;
    }

    entries.set(wave.enemyId, {
      enemyId: definition.id,
      name: definition.name,
      count: wave.count,
      traits: describeEnemyTraits(definition.traits.filter(hasTraitRule)),
    });
  }

  return [...entries.values()];
}
