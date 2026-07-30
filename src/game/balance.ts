import { heroClasses } from "./content";
import { createCampaignLevel } from "./levels";
import { simulateCombat } from "./simulateCombat";
import { applyStatModifiers } from "./stats";
import type { HeroClass, HeroClassId } from "./types";

export const MAX_POWER_FACTOR = 12;
const POWER_STEP = 0.05;

/**
 * Scales the gear-driven stats by `factor`, approximating how geared a player
 * is. A factor of 1 is a naked level-1 hero. Attack speed, crit and cooldown
 * reduction are deliberately left alone so the factor measures raw power rather
 * than reshaping the build.
 */
export function scaledHero(heroClass: HeroClass, factor: number): HeroClass {
  const base = heroClass.stats;

  return {
    ...heroClass,
    stats: applyStatModifiers(base, {
      health: base.health * (factor - 1),
      damage: base.damage * (factor - 1),
      armor: base.armor * (factor - 1),
      abilityPower: base.abilityPower * (factor - 1),
    }),
  };
}

/**
 * Smallest gear factor at which this hero clears the level, or null if it never
 * does within MAX_POWER_FACTOR. Lower is easier.
 *
 * This is a linear scan rather than a binary search on purpose: `won` is not
 * guaranteed monotonic in the gear factor, because more damage can change kill
 * order and therefore which enemies land hits. A binary search could return a
 * misleading threshold.
 */
export function requiredPower(heroClass: HeroClass, levelNumber: number): number | null {
  const level = createCampaignLevel(levelNumber);

  for (let factor = 1; factor <= MAX_POWER_FACTOR + POWER_STEP / 2; factor += POWER_STEP) {
    if (simulateCombat(scaledHero(heroClass, factor), level).won) {
      return Math.round(factor * 100) / 100;
    }
  }

  return null;
}

export function requiredPowerByClass(levelNumber: number): Array<{ id: HeroClassId; required: number | null }> {
  return heroClasses.map((heroClass) => ({ id: heroClass.id, required: requiredPower(heroClass, levelNumber) }));
}

/** Median of the defined values, treating null as MAX_POWER_FACTOR. */
export function medianPower(values: Array<number | null>): number {
  const resolved = values.map((value) => value ?? MAX_POWER_FACTOR).sort((a, b) => a - b);

  return resolved[Math.floor(resolved.length / 2)];
}
