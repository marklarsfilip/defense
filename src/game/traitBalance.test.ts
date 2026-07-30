import { describe, expect, it } from "vitest";
import { STAT_POINT_INCREMENTS } from "./allocation";
import { heroClasses } from "./content";
import { medianPower, requiredPower, requiredPowerByClass } from "./balance";
import { traitRules } from "./traits";
import type { HeroClass, Stats } from "./types";

const BRUTE_LEVEL = 4;
const CASTER_LEVEL = 5;
const SWARM_LEVEL = 6;
const SHIELD_LEVEL = 7;
const BOSS_LEVEL = 10;

/** Measured on untouched code at commit 70ff484. See the baseline document. */
const BASELINE_MEDIAN: Record<number, number> = {
  1: 1.0, 2: 1.0, 3: 1.0, 4: 1.55, 5: 1.05, 6: 2.6,
  7: 2.4, 8: 1.35, 9: 1.7, 10: 1.2, 11: 3.05, 12: 3.15,
};

function shapedHero(name: string, stats: Partial<Stats>, abilities: HeroClass["abilities"] = []): HeroClass {
  return {
    id: "berserker",
    name,
    fantasy: "",
    combatStyle: "",
    color: "#fff",
    damageKind: "melee",
    stats: {
      health: 200,
      armor: 10,
      damage: 20,
      attackSpeed: 1,
      range: 2,
      critChance: 0,
      critDamage: 1.5,
      abilityPower: 0,
      cooldownReduction: 0,
      ...stats,
    },
    abilities,
  } as HeroClass;
}

// Equal damage x attackSpeed budget (40), opposite shapes.
const FAST_WEAK = shapedHero("fast-weak", { damage: 10, attackSpeed: 4 });
const SLOW_HEAVY = shapedHero("slow-heavy", { damage: 40, attackSpeed: 1 });

// Equal defensive budget spent two ways: an equal 20-point spend from the
// shared base below, at the game's own STAT_POINT_INCREMENTS rates
// (src/game/allocation.ts). The fixtures are built from DEFENSIVE_BASE and
// DEFENSIVE_BUDGET_POINTS rather than hardcoded stats, and
// "spend an equal stat-point budget" below re-derives the same numbers and
// asserts them equal, so base and fixtures cannot drift apart unnoticed.
const DEFENSIVE_BASE: Pick<Stats, "armor" | "health"> = { armor: 10, health: 200 };
const DEFENSIVE_BUDGET_POINTS = 20;
const ARMOR_STACK = shapedHero("armor-stack", {
  armor: DEFENSIVE_BASE.armor + DEFENSIVE_BUDGET_POINTS * STAT_POINT_INCREMENTS.armor,
  health: DEFENSIVE_BASE.health,
});
const HEALTH_STACK = shapedHero("health-stack", {
  armor: DEFENSIVE_BASE.armor,
  health: DEFENSIVE_BASE.health + DEFENSIVE_BUDGET_POINTS * STAT_POINT_INCREMENTS.health,
});

/** Stat points spent on armor + health relative to DEFENSIVE_BASE, at real allocation rates. */
function defensivePointCost(stats: Pick<Stats, "armor" | "health">): number {
  return (
    (stats.armor - DEFENSIVE_BASE.armor) / STAT_POINT_INCREMENTS.armor +
    (stats.health - DEFENSIVE_BASE.health) / STAT_POINT_INCREMENTS.health
  );
}

// Equal ability budget, spread across many targets or concentrated on one.
const SPREAD = shapedHero("spread", {}, [
  { id: "nova", name: "Nova", description: "", cooldown: 4, effect: { kind: "damage", targets: 5, damageMultiplier: 1, apScaling: 0 } },
]);
const FOCUSED = shapedHero("focused", {}, [
  { id: "stab", name: "Stab", description: "", cooldown: 4, effect: { kind: "damage", targets: 1, damageMultiplier: 5, apScaling: 0 } },
]);

/** Total per-cast damage budget (targets x multiplier) of a hero's first ability. */
function abilityDamageBudget(hero: HeroClass): number {
  const effect = hero.abilities[0].effect;
  if (effect.kind !== "damage") {
    throw new Error(`${hero.name}'s ability is not a damage effect`);
  }

  return effect.targets * effect.damageMultiplier;
}

/** Fails loudly rather than comparing against null. */
function power(hero: HeroClass, levelNumber: number): number {
  const required = requiredPower(hero, levelNumber);
  expect(required, `${hero.name} never cleared level ${levelNumber}`).not.toBeNull();

  return required!;
}

describe("armored counterplay", () => {
  it("makes big hits the answer on Shield Line, inverting the baseline", () => {
    // Baseline: fast-weak 2.40, slow-heavy 4.25 — armored favoured chip damage.
    expect(power(SLOW_HEAVY, SHIELD_LEVEL)).toBeLessThan(power(FAST_WEAK, SHIELD_LEVEL));
  });

  it("makes big hits the answer on Grave March, where the baseline was noise", () => {
    // Baseline: fast-weak 1.65, slow-heavy 1.70 — no discrimination at all.
    // Require a clear gap, not a coin flip.
    expect(power(SLOW_HEAVY, BRUTE_LEVEL)).toBeLessThan(power(FAST_WEAK, BRUTE_LEVEL) * 0.9);
  });
});

describe("caster counterplay", () => {
  it("makes health a better answer than armor, inverting the baseline", () => {
    // Baseline: armor-stack 2.55, health-stack 2.80 — armor was strictly better.
    expect(power(HEALTH_STACK, CASTER_LEVEL)).toBeLessThan(power(ARMOR_STACK, CASTER_LEVEL));
  });

  // A behavioural control (checking both builds require equal power on a
  // non-caster level) was tried here and removed: level 8 turned out to be
  // bottlenecked by offense, not defence, for a no-ability hero, so it stayed
  // green (2.85 / 2.85) at any armor or health value on ARMOR_STACK — it
  // would not have caught the exact unequal-budget bug it was meant to
  // guard against. Do not re-add a level-based control here; assert the
  // point-cost arithmetic directly instead, as below.
  it("spends an equal stat-point budget on both defensive fixtures", () => {
    expect(defensivePointCost(ARMOR_STACK.stats)).toBe(DEFENSIVE_BUDGET_POINTS);
    expect(defensivePointCost(HEALTH_STACK.stats)).toBe(DEFENSIVE_BUDGET_POINTS);
  });
});

describe("swarm counterplay", () => {
  it("keeps multi-target ahead of single-target on Rot Tide", () => {
    // Baseline: spread 1.55, focused 2.65 — already correct. Regression guard.
    expect(power(SPREAD, SWARM_LEVEL)).toBeLessThan(power(FOCUSED, SWARM_LEVEL));
  });

  it("spends an equal per-cast damage budget on both ability fixtures", () => {
    expect(abilityDamageBudget(SPREAD)).toBe(abilityDamageBudget(FOCUSED));
  });
});

describe("boss counterplay", () => {
  it("keeps focused fire ahead of spread on a boss level, matching the boss trait's design", () => {
    // traits.ts: "sustained single-target damage wins". A lone boss honours
    // this trivially (nothing for spreadResistance to act on). The escort in
    // levels.ts exists so this holds for a *reason* — see the liveness test
    // below, which is the one that actually catches an inert escort.
    expect(power(FOCUSED, BOSS_LEVEL)).toBeLessThan(power(SPREAD, BOSS_LEVEL));
  });

  // Regression guard for a real bug: an escort that is too small, too
  // clustered, or too short-lived to still be alive when the boss is also
  // targetable makes `spreadResistance` structurally inert — multi-target
  // casts never actually land on more than one enemy, so `focused < spread`
  // above would hold for the wrong reason (offense parity with a lone boss,
  // not the trait). That happened during Task 7's fix rounds and looked
  // identical to a working escort from the outside: same inversion, same
  // guardrail passing. Pin liveness directly by disabling spreadResistance
  // at runtime (not by editing traits.ts) and asserting SPREAD's required
  // power actually depends on it — if the escort is inert, disabling the
  // trait changes nothing and this fails.
  it("keeps spreadResistance mechanically live on a boss level, not just structurally present", () => {
    const withResistance = power(SPREAD, BOSS_LEVEL);
    const originalResistance = traitRules.boss.spreadResistance;
    traitRules.boss.spreadResistance = 1; // disable: multiplier of 1 = no reduction
    let withoutResistance: number;
    try {
      withoutResistance = power(SPREAD, BOSS_LEVEL);
    } finally {
      traitRules.boss.spreadResistance = originalResistance;
    }

    expect(withoutResistance).toBeLessThan(withResistance);
  });
});

describe("campaign balance", () => {
  it("keeps level 1 clearable by every class with no gear at all", () => {
    for (const entry of requiredPowerByClass(1)) {
      expect(entry.required, entry.id).toBe(1);
    }
  });

  // Known fragility (Task 7 fix round): on level 5 (Lantern Storm) this ratio
  // sits at 1.96 against the 2.0 cap — passing, but not with much room. The
  // median (1.15) is held solely by the Ranger; Arcanist and Summoner both
  // sit on the 1.00 gear floor, so any future buff to either of them would
  // drop the median to 1.00 and push Guardian's 2.25 over the cap without
  // Guardian itself changing at all. The ratio is unstable whenever several
  // classes bunch on the gear floor — watch this level first if the buff
  // ever lands.
  it("keeps the worst class within twice the median on every early level", () => {
    for (let levelNumber = 1; levelNumber <= 12; levelNumber += 1) {
      const required = requiredPowerByClass(levelNumber).map((entry) => entry.required);
      const median = medianPower(required);
      const worst = Math.max(...required.map((value) => value ?? 12));

      expect(worst / median, `level ${levelNumber} spread`).toBeLessThanOrEqual(2);
    }
  });

  it("does not inflate difficulty: median power stays within 20% of the baseline", () => {
    for (let levelNumber = 1; levelNumber <= 12; levelNumber += 1) {
      const median = medianPower(requiredPowerByClass(levelNumber).map((entry) => entry.required));

      expect(median, `level ${levelNumber} median`).toBeLessThanOrEqual(BASELINE_MEDIAN[levelNumber] * 1.2);
    }
  });

  it("leaves every class able to kill something on every early level", () => {
    for (let levelNumber = 1; levelNumber <= 12; levelNumber += 1) {
      for (const heroClass of heroClasses) {
        expect(requiredPower(heroClass, levelNumber), `${heroClass.id} on level ${levelNumber}`).not.toBeNull();
      }
    }
  });
});
