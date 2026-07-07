import type { CombatResult, HeroClassId } from "./types";

export interface CampaignState {
  selectedClassId: HeroClassId;
  heroLevel: number;
  experience: number;
  gold: number;
  victories: number;
  totalEnemiesDefeated: number;
  completedLevelIds: string[];
}

const DEFAULT_CLASS_ID: HeroClassId = "berserker";
const MAX_HERO_LEVEL = 20;

export function createInitialCampaign(): CampaignState {
  return {
    selectedClassId: DEFAULT_CLASS_ID,
    heroLevel: 1,
    experience: 0,
    gold: 0,
    victories: 0,
    totalEnemiesDefeated: 0,
    completedLevelIds: [],
  };
}

export function selectCampaignClass(state: CampaignState, selectedClassId: HeroClassId): CampaignState {
  return {
    ...state,
    selectedClassId,
  };
}

export function applyCombatRewards(state: CampaignState, result: CombatResult): CampaignState {
  if (!result.won) {
    return state;
  }

  const leveled = addExperience(state.heroLevel, state.experience, result.xp);
  const completedLevelIds = state.completedLevelIds.includes(result.level.id)
    ? state.completedLevelIds
    : [...state.completedLevelIds, result.level.id];

  return {
    ...state,
    heroLevel: leveled.heroLevel,
    experience: leveled.experience,
    gold: state.gold + result.gold,
    victories: state.victories + 1,
    totalEnemiesDefeated: state.totalEnemiesDefeated + result.enemiesDefeated,
    completedLevelIds,
  };
}

export function getExperienceForNextLevel(heroLevel: number): number {
  if (heroLevel >= MAX_HERO_LEVEL) {
    return 0;
  }

  return 100 + (heroLevel - 1) * 75;
}

export function restoreCampaign(value: unknown): CampaignState {
  const initial = createInitialCampaign();

  if (!value || typeof value !== "object") {
    return initial;
  }

  const candidate = value as Partial<CampaignState>;

  return {
    selectedClassId: isHeroClassId(candidate.selectedClassId) ? candidate.selectedClassId : initial.selectedClassId,
    heroLevel: clampInteger(candidate.heroLevel, 1, MAX_HERO_LEVEL, initial.heroLevel),
    experience: clampInteger(candidate.experience, 0, Number.MAX_SAFE_INTEGER, initial.experience),
    gold: clampInteger(candidate.gold, 0, Number.MAX_SAFE_INTEGER, initial.gold),
    victories: clampInteger(candidate.victories, 0, Number.MAX_SAFE_INTEGER, initial.victories),
    totalEnemiesDefeated: clampInteger(
      candidate.totalEnemiesDefeated,
      0,
      Number.MAX_SAFE_INTEGER,
      initial.totalEnemiesDefeated,
    ),
    completedLevelIds: Array.isArray(candidate.completedLevelIds)
      ? candidate.completedLevelIds.filter((id): id is string => typeof id === "string")
      : initial.completedLevelIds,
  };
}

function addExperience(heroLevel: number, experience: number, earnedExperience: number) {
  let nextHeroLevel = heroLevel;
  let nextExperience = experience + earnedExperience;

  while (nextHeroLevel < MAX_HERO_LEVEL) {
    const requiredExperience = getExperienceForNextLevel(nextHeroLevel);

    if (nextExperience < requiredExperience) {
      break;
    }

    nextExperience -= requiredExperience;
    nextHeroLevel += 1;
  }

  if (nextHeroLevel >= MAX_HERO_LEVEL) {
    nextExperience = 0;
  }

  return {
    heroLevel: nextHeroLevel,
    experience: nextExperience,
  };
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isHeroClassId(value: unknown): value is HeroClassId {
  return value === "berserker" || value === "arcanist" || value === "ranger" || value === "summoner" || value === "guardian";
}
