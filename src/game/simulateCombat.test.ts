import { describe, expect, it } from "vitest";
import { heroClasses, starterLevel } from "./content";
import { createCampaignLevel } from "./levels";
import { simulateCombat } from "./simulateCombat";
import type { AbilityDefinition, HeroClass, LevelDefinition } from "./types";

describe("simulateCombat", () => {
  it("makes level 1 winnable for every starter class", () => {
    const results = heroClasses.map((heroClass) => simulateCombat(heroClass, starterLevel));

    expect(results.every((result) => result.won)).toBe(true);
    expect(results.every((result) => result.enemiesDefeated === 30)).toBe(true);
  });

  it("produces deterministic timelines for the same class and level", () => {
    const firstRun = simulateCombat(heroClasses[0], starterLevel);
    const secondRun = simulateCombat(heroClasses[0], starterLevel);

    expect(secondRun).toEqual(firstRun);
  });

  it("keeps the result independent from replay rendering", () => {
    const result = simulateCombat(heroClasses[1], starterLevel);
    const finalEvent = result.events.at(-1);

    expect(finalEvent?.type).toBe("levelComplete");
    expect(result.xp).toBe(150);
    expect(result.gold).toBe(90);
  });

  it("lets melee heroes hit flying enemies with weaker fallback attacks, less efficiently than ranged", () => {
    const flyingLevel = createCampaignLevel(2);
    const berserker = heroClasses.find((heroClass) => heroClass.id === "berserker")!;
    const ranger = heroClasses.find((heroClass) => heroClass.id === "ranger")!;
    const meleeResult = simulateCombat(berserker, flyingLevel);
    const rangerResult = simulateCombat(ranger, flyingLevel);

    expect(meleeResult.enemiesDefeated).toBeGreaterThan(0);
    // enemiesDefeated saturates once both classes clear the level (both end up at the
    // wave's total enemy count), so it can no longer express a degree of advantage now
    // that trait effects like fragile's crit vulnerability help melee close the gap.
    // duration and health remaining don't saturate and together capture what "ranged
    // handles flyers better" actually means: faster and safer. Do not swap this back to
    // enemiesDefeated without re-checking whether both sides still hit the same ceiling.
    expect(rangerResult.duration).toBeLessThan(meleeResult.duration);
    expect(rangerResult.heroHealthRemaining).toBeGreaterThan(meleeResult.heroHealthRemaining);
  });

  it("announces each trait once per enemy so the log explains the fight", () => {
    const bruteLevel = createCampaignLevel(4);
    const berserker = heroClasses.find((heroClass) => heroClass.id === "berserker")!;
    const result = simulateCombat(berserker, bruteLevel);
    const traitEvents = result.events.filter((event) => event.type === "traitEffect");

    expect(traitEvents.length).toBeGreaterThan(0);
    expect(traitEvents.some((event) => event.trait === "armored")).toBe(true);

    const keys = traitEvents.map((event) => `${event.enemyId}:${event.trait}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(traitEvents.every((event) => event.message.length > 0)).toBe(true);
  });
});

function loneLevel(_ability: unknown, durationLimit = 20): LevelDefinition {
  return {
    id: "test-lone", name: "Test", subtitle: "", kind: "normal", levelNumber: 1,
    enemyWaves: [{ enemyId: "graveBrute", count: 1, startsAt: 0, interval: 1, gate: "north" }],
    durationLimit, seed: 7,
    chest: { itemLevel: 1, rarityWeights: { common: 1, uncommon: 0, rare: 0, epic: 0, legendary: 0, set: 0 }, goldBonus: { min: 0, max: 0 } },
    combat: { enemyHealthMultiplier: 1, enemyDamageMultiplier: 1, rewardMultiplier: 1, heroDamageMultipliers: {} },
    notes: [],
  };
}

function bareHero(overrides: Partial<HeroClass>, abilities: AbilityDefinition[]): HeroClass {
  return {
    id: "berserker", name: "T", fantasy: "", combatStyle: "", color: "#fff", damageKind: "melee",
    stats: { health: 500, armor: 0, damage: 10, attackSpeed: 0.0001, range: 2, critChance: 0, critDamage: 1, abilityPower: 0, cooldownReduction: 0 },
    abilities,
    ...overrides,
  } as HeroClass;
}

const TANKY = { enemyHealthMultiplier: 100000, enemyDamageMultiplier: 0, rewardMultiplier: 1, heroDamageMultipliers: {} };
const STATS = (o: Partial<import("./types").Stats>): import("./types").Stats => ({
  health: 500, armor: 0, damage: 10, attackSpeed: 0.0001, range: 2, critChance: 0, critDamage: 1, abilityPower: 0, cooldownReduction: 0, ...o,
});

describe("ability effects", () => {
  it("damage ability hits up to `targets` living enemies", () => {
    const level: LevelDefinition = { ...loneLevel(null), enemyWaves: [{ enemyId: "rotImp", count: 5, startsAt: 0, interval: 0, gate: "north" }], combat: { ...TANKY } };
    const ability: AbilityDefinition = { id: "nova", name: "Nova", description: "", cooldown: 2, effect: { kind: "damage", targets: 5, damageMultiplier: 1, apScaling: 1 } };
    const result = simulateCombat(bareHero({ stats: STATS({ damage: 5 }) }, [ability]), level);
    const casts = result.events.filter((e) => e.type === "abilityCast");
    expect(casts.length).toBeGreaterThan(0);
    expect((casts[0] as Extract<typeof casts[number], { type: "abilityCast" }>).targetIds.length).toBe(5);
  });

  it("buff makes the hero attack faster while active", () => {
    const level: LevelDefinition = { ...loneLevel(null, 12), combat: { ...TANKY } };
    const countAttacks = (h: HeroClass) => simulateCombat(h, level).events.filter((e) => e.type === "attack").length;
    const noBuff = countAttacks(bareHero({ stats: STATS({ attackSpeed: 1 }) }, []));
    const withBuff = countAttacks(bareHero({ stats: STATS({ attackSpeed: 1 }) }, [
      { id: "rage", name: "Rage", description: "", cooldown: 3, effect: { kind: "buff", duration: 10, modifiers: { attackSpeed: 3 } } },
    ]));
    expect(withBuff).toBeGreaterThan(noBuff);
  });

  it("shield absorbs enemy damage before health", () => {
    const level: LevelDefinition = { ...loneLevel(null, 12), combat: { enemyHealthMultiplier: 100000, enemyDamageMultiplier: 1, rewardMultiplier: 1, heroDamageMultipliers: {} } };
    const heroNoShield = bareHero({ stats: STATS({ health: 8, damage: 1 }) }, []);
    const heroShield = bareHero({ stats: STATS({ health: 8, damage: 1 }) }, [
      { id: "wall", name: "Wall", description: "", cooldown: 1, effect: { kind: "shield", amount: 500, apScaling: 0, duration: 30 } },
    ]);
    const a = simulateCombat(heroNoShield, level);
    const b = simulateCombat(heroShield, level);
    expect(a.won).toBe(false);
    expect(b.heroHealthRemaining).toBeGreaterThan(a.heroHealthRemaining);
  });

  it("summon deals periodic ticks over its duration", () => {
    const level: LevelDefinition = { ...loneLevel(null, 20), combat: { ...TANKY } };
    const hero = bareHero({ stats: STATS({ damage: 1 }) }, [
      { id: "pets", name: "Pets", description: "", cooldown: 100, effect: { kind: "summon", dps: 50, apScaling: 0, interval: 1, duration: 4 } },
    ]);
    const ticks = simulateCombat(hero, level).events.filter((e) => e.type === "summonTick");
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });

  it("applies a level's heroDamageMultipliers to a hero of the matching damageKind only", () => {
    const levelWithMultiplier = (multiplier: number): LevelDefinition => ({
      ...loneLevel(null),
      enemyWaves: [{ enemyId: "skeleton", count: 1, startsAt: 0, interval: 1, gate: "north" }],
      combat: { enemyHealthMultiplier: 100000, enemyDamageMultiplier: 0, rewardMultiplier: 1, heroDamageMultipliers: { melee: multiplier } },
    });
    const meleeHero = bareHero({ damageKind: "melee", stats: STATS({ damage: 10 }) }, []);
    const magicHero = bareHero({ damageKind: "magic", stats: STATS({ damage: 10 }) }, []);
    const firstAttackDamage = (result: ReturnType<typeof simulateCombat>): number => {
      const attack = result.events.find((e) => e.type === "attack") as Extract<(typeof result.events)[number], { type: "attack" }>;
      return attack.damage;
    };

    const meleeBoosted = firstAttackDamage(simulateCombat(meleeHero, levelWithMultiplier(2)));
    const meleeBaseline = firstAttackDamage(simulateCombat(meleeHero, levelWithMultiplier(1)));
    const magicBoosted = firstAttackDamage(simulateCombat(magicHero, levelWithMultiplier(2)));
    const magicBaseline = firstAttackDamage(simulateCombat(magicHero, levelWithMultiplier(1)));

    expect(meleeBoosted).toBeGreaterThan(meleeBaseline);
    expect(magicBoosted).toBe(magicBaseline);
  });
});
