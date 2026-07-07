import type { ChestReward, CombatResult, HeroClassId, LootItem, LootRarity } from "./types";
import { filterTalentIdsForClass, getTalentPointBudget } from "./talents";

export interface CampaignState {
  selectedClassId: HeroClassId;
  heroLevel: number;
  experience: number;
  gold: number;
  victories: number;
  totalEnemiesDefeated: number;
  completedLevelIds: string[];
  nextLevelNumber: number;
  queuedBonusLevelAfter: number | null;
  chestsOpened: number;
  inventory: LootItem[];
  selectedTalentIds: string[];
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
    nextLevelNumber: 1,
    queuedBonusLevelAfter: null,
    chestsOpened: 0,
    inventory: [],
    selectedTalentIds: [],
  };
}

export function selectCampaignClass(state: CampaignState, selectedClassId: HeroClassId): CampaignState {
  return {
    ...state,
    selectedClassId,
    selectedTalentIds: filterTalentIdsForClass(state.selectedTalentIds, selectedClassId),
  };
}

export function learnCampaignTalent(state: CampaignState, talentId: string): CampaignState {
  if (state.selectedTalentIds.includes(talentId)) {
    return state;
  }

  if (state.selectedTalentIds.length >= getTalentPointBudget(state.heroLevel)) {
    return state;
  }

  return {
    ...state,
    selectedTalentIds: [...state.selectedTalentIds, talentId],
  };
}

export function applyCombatRewards(
  state: CampaignState,
  result: CombatResult,
  chestReward?: ChestReward,
  queuedBonusLevelAfter?: number | null,
): CampaignState {
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
    gold: state.gold + result.gold + (chestReward?.goldBonus ?? 0),
    victories: state.victories + 1,
    totalEnemiesDefeated: state.totalEnemiesDefeated + result.enemiesDefeated,
    completedLevelIds,
    nextLevelNumber: result.level.kind === "bonus" ? state.nextLevelNumber : Math.max(state.nextLevelNumber, result.level.levelNumber + 1),
    queuedBonusLevelAfter: result.level.kind === "bonus" ? null : queuedBonusLevelAfter ?? null,
    chestsOpened: state.chestsOpened + (chestReward ? 1 : 0),
    inventory: chestReward ? [chestReward.item, ...state.inventory] : state.inventory,
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
  const selectedClassId = isHeroClassId(candidate.selectedClassId) ? candidate.selectedClassId : initial.selectedClassId;
  const selectedTalentIds = Array.isArray(candidate.selectedTalentIds)
    ? candidate.selectedTalentIds.filter((id): id is string => typeof id === "string")
    : initial.selectedTalentIds;

  return {
    selectedClassId,
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
    nextLevelNumber: clampInteger(candidate.nextLevelNumber, 1, Number.MAX_SAFE_INTEGER, initial.nextLevelNumber),
    queuedBonusLevelAfter:
      typeof candidate.queuedBonusLevelAfter === "number" && Number.isFinite(candidate.queuedBonusLevelAfter)
        ? Math.max(1, Math.floor(candidate.queuedBonusLevelAfter))
        : null,
    chestsOpened: clampInteger(candidate.chestsOpened, 0, Number.MAX_SAFE_INTEGER, initial.chestsOpened),
    inventory: Array.isArray(candidate.inventory) ? candidate.inventory.filter(isLootItem) : initial.inventory,
    selectedTalentIds: filterTalentIdsForClass(selectedTalentIds, selectedClassId),
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

function isLootItem(value: unknown): value is LootItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LootItem>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    isLootRarity(candidate.rarity) &&
    (candidate.slot === "weapon" || candidate.slot === "armor" || candidate.slot === "trinket") &&
    typeof candidate.itemLevel === "number" &&
    Array.isArray(candidate.modifiers)
  );
}

function isLootRarity(value: unknown): value is LootRarity {
  return (
    value === "common" ||
    value === "uncommon" ||
    value === "rare" ||
    value === "epic" ||
    value === "legendary" ||
    value === "set"
  );
}
