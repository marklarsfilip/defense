# Class Ability System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the every-Nth-attack "special" with a data-driven cooldown ability system (damage/buff/shield/summon) that revives `abilityPower` and `cooldownReduction` and differentiates the five classes in combat.

**Architecture:** Abilities are data (`AbilityDefinition` with a discriminated `AbilityEffect`), referenced by `HeroClass.abilities`. The pure `abilities.ts` module holds cooldown/magnitude math. `simulateCombat` fires abilities on cooldowns inside its existing fixed-timestep loop, maintaining transient state (cooldown timers, active buffs, a shield pool, active summons) and emitting new typed `CombatEvent`s. The replay renders a minimal cast flash; unknown effect events are safely ignored.

**Tech Stack:** TypeScript, Vite, React 19, React Three Fiber, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-class-abilities-design.md`

**Conventions:** Colocated tests (`foo.ts`→`foo.test.ts`). One file: `npx vitest run <path>`. All: `npm test`. Typecheck+build: `npm run build`. The sim is pure + seeded; determinism (same hero+level+seed → identical event timeline) is a hard requirement. Ability damage does NOT roll crit (draws no `random()`), preserving RNG draw order.

**⚠️ Balance guardrail:** The existing test `makeLevel 1 winnable for every starter class` (asserts every class `won` with `enemiesDefeated === 30`) is a HARD guardrail. Removing the every-Nth cleave strips melee classes of AoE, so after the rewrite this test may fail. If it does, TUNE the offending class's ability numbers in `content.ts` (shorter cooldown, more damage/targets, stronger buff) and/or the `ABILITY_WARMUP` until all five classes clear level 1. **Never weaken or delete that test.**

---

## File Structure

- **Modify** `src/game/types.ts` — add `AbilityEffect`, `AbilityDefinition`; add `abilities` to `HeroClass` (keep `special` until Task 4); add `CombatEvent` variants.
- **Modify** `src/game/content.ts` — add an `abilities` array to each of the 5 classes (Task 1); remove `special` (Task 4).
- **Create** `src/game/abilities.ts` — pure cooldown + magnitude helpers.
- **Modify** `src/game/simulateCombat.ts` — fire abilities on cooldowns; effects + transient state + events; remove every-Nth special use.
- **Modify** `src/game/simulateCombat.test.ts` — new effect tests; keep/adjust guardrails.
- **Modify** `src/App.tsx` — hero-detail shows ability name(s); combat log shows `abilityCast`.
- **Modify** `src/components/CombatReplay.tsx` — minimal cast flash.

---

## Task 1: Ability types + content (additive, keeps `special`)

**Files:** `src/game/types.ts`, `src/game/content.ts`.

This task is purely additive so the project keeps compiling and all existing tests pass — the sim still uses `special` until Task 3.

- [ ] **Step 1: Add types.** In `src/game/types.ts`:

Add after the `Stats` interface (or near the other content types):

```ts
export type AbilityEffect =
  | { kind: "damage"; targets: number; damageMultiplier: number; apScaling: number }
  | { kind: "buff"; duration: number; modifiers: Partial<Stats> }
  | { kind: "shield"; amount: number; apScaling: number; duration: number }
  | { kind: "summon"; dps: number; apScaling: number; interval: number; duration: number };

export interface AbilityDefinition {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  effect: AbilityEffect;
}
```

Add `abilities` to `HeroClass` (keep the existing `special` field for now):

```ts
  abilities: AbilityDefinition[];
```

Add these `CombatEvent` union members (inside the existing `CombatEvent` union):

```ts
  | {
      type: "abilityCast";
      time: number;
      abilityId: string;
      label: string;
      targetIds: string[];
    }
  | {
      type: "buff";
      time: number;
      abilityId: string;
      label: string;
      duration: number;
    }
  | {
      type: "shield";
      time: number;
      abilityId: string;
      amount: number;
    }
  | {
      type: "summonTick";
      time: number;
      abilityId: string;
      targetId: string;
      damage: number;
    }
```

- [ ] **Step 2: Add ability content.** In `src/game/content.ts`, add an `abilities` array to each hero class object (alongside its existing `special`). Use these values:

```ts
// Berserker
    abilities: [
      {
        id: "bloodlust",
        name: "Bloodlust",
        description: "Enters a frenzy, attacking faster and harder for a few seconds.",
        cooldown: 8,
        effect: { kind: "buff", duration: 4, modifiers: { attackSpeed: 0.6, damage: 8 } },
      },
    ],
// Arcanist
    abilities: [
      {
        id: "arcane-nova",
        name: "Arcane Nova",
        description: "Detonates arcane energy across a pack of enemies.",
        cooldown: 6,
        effect: { kind: "damage", targets: 5, damageMultiplier: 0.9, apScaling: 1.4 },
      },
    ],
// Ranger
    abilities: [
      {
        id: "piercing-volley",
        name: "Piercing Volley",
        description: "Looses a volley that punches through a line of enemies.",
        cooldown: 7,
        effect: { kind: "damage", targets: 3, damageMultiplier: 1.6, apScaling: 0.4 },
      },
    ],
// Guardian
    abilities: [
      {
        id: "bulwark",
        name: "Bulwark",
        description: "Raises a protective barrier that absorbs incoming damage.",
        cooldown: 9,
        effect: { kind: "shield", amount: 60, apScaling: 1.2, duration: 5 },
      },
    ],
// Summoner
    abilities: [
      {
        id: "spirit-pack",
        name: "Spirit Pack",
        description: "Calls spirits that harry enemies for several seconds.",
        cooldown: 8,
        effect: { kind: "summon", dps: 14, apScaling: 0.6, interval: 0.8, duration: 6 },
      },
    ],
```

- [ ] **Step 3: Verify.** `npx tsc --noEmit` → clean. `npm test` → all existing tests still pass (no behavior change).

- [ ] **Step 4: Commit.**

```bash
git add src/game/types.ts src/game/content.ts
git commit -m "Add ability types and per-class ability content"
```

---

## Task 2: Pure abilities module

**Files:** Create `src/game/abilities.ts`, `src/game/abilities.test.ts`.

- [ ] **Step 1: Write the failing test.** Create `src/game/abilities.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  abilityDamagePerTarget,
  abilityShieldAmount,
  effectiveCooldown,
  summonDamagePerTick,
} from "./abilities";
import type { AbilityDefinition } from "./types";

const dmg: AbilityDefinition = {
  id: "a", name: "A", description: "", cooldown: 10,
  effect: { kind: "damage", targets: 3, damageMultiplier: 1.5, apScaling: 1 },
};

describe("effectiveCooldown", () => {
  it("shrinks with cooldownReduction", () => {
    expect(effectiveCooldown(dmg, 0)).toBe(10);
    expect(effectiveCooldown(dmg, 0.5)).toBe(5);
  });
});

describe("abilityDamagePerTarget", () => {
  it("scales with abilityPower and multiplier", () => {
    // (heroDamage 20 + ap 10 * apScaling 1) * mult 1.5 * levelMult 1 = 45
    expect(abilityDamagePerTarget({ kind: "damage", targets: 3, damageMultiplier: 1.5, apScaling: 1 }, 20, 10, 1)).toBe(45);
    // more ability power => more damage
    expect(abilityDamagePerTarget({ kind: "damage", targets: 3, damageMultiplier: 1.5, apScaling: 1 }, 20, 40, 1)).toBeGreaterThan(45);
  });
});

describe("abilityShieldAmount", () => {
  it("adds ability power scaled by apScaling", () => {
    expect(abilityShieldAmount({ kind: "shield", amount: 60, apScaling: 1.2, duration: 5 }, 20)).toBe(84); // 60 + 20*1.2
  });
});

describe("summonDamagePerTick", () => {
  it("is dps*interval plus ap scaling, floored at 1", () => {
    expect(summonDamagePerTick({ kind: "summon", dps: 14, apScaling: 0.6, interval: 0.8, duration: 6 }, 20)).toBe(23); // round(14*0.8 + 20*0.6)=round(11.2+12)=round(23.2)=23
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** `npx vitest run src/game/abilities.test.ts` → FAIL.

- [ ] **Step 3: Implement.** Create `src/game/abilities.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes.** `npx vitest run src/game/abilities.test.ts` → PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit.**

```bash
git add src/game/abilities.ts src/game/abilities.test.ts
git commit -m "Add pure ability cooldown and magnitude helpers"
```

---

## Task 3: Integrate abilities into the simulation

**Files:** `src/game/simulateCombat.ts`, `src/game/simulateCombat.test.ts`.

This is the core rewrite. The sim stops using `heroClass.special` (every-Nth cleave) and instead fires `heroClass.abilities` on cooldowns. Basic attacks become always-single-target (the cleave moves to the damage ability). `heroClass.special` is NOT referenced anywhere in the sim after this task.

- [ ] **Step 1: Write the failing tests.** Add to `src/game/simulateCombat.test.ts` (keep the existing 4 tests; the guardrails still apply):

```ts
import type { AbilityDefinition, HeroClass, LevelDefinition } from "./types";

// A tiny single-enemy level and a bare hero factory for isolated ability tests.
function loneLevel(ability: AbilityDefinition["effect"] | null, durationLimit = 20): LevelDefinition {
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

// A "tanky" combat block so a single test enemy survives the whole measurement
// window (so attack/tick counts reflect rate, not how fast the enemy dies) and
// deals negligible damage to a high-health test hero.
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
    expect((casts[0] as Extract<typeof casts[number], { type: "abilityCast" }>).targetIds.length).toBe(5); // hits all 5
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
    // Enemy deals real damage here; tiny-health hero dies without a shield, survives with one.
    const level: LevelDefinition = { ...loneLevel(null, 12), combat: { enemyHealthMultiplier: 100000, enemyDamageMultiplier: 1, rewardMultiplier: 1, heroDamageMultipliers: {} } };
    const heroNoShield = bareHero({ stats: STATS({ health: 8, damage: 1 }) }, []);
    const heroShield = bareHero({ stats: STATS({ health: 8, damage: 1 }) }, [
      { id: "wall", name: "Wall", description: "", cooldown: 1, effect: { kind: "shield", amount: 500, apScaling: 0, duration: 30 } },
    ]);
    const a = simulateCombat(heroNoShield, level);
    const b = simulateCombat(heroShield, level);
    expect(a.won).toBe(false); // dies without shield
    expect(b.heroHealthRemaining).toBeGreaterThan(a.heroHealthRemaining); // shield preserves health
  });

  it("summon deals periodic ticks over its duration", () => {
    const level: LevelDefinition = { ...loneLevel(null, 20), combat: { ...TANKY } };
    const hero = bareHero({ stats: STATS({ damage: 1 }) }, [
      { id: "pets", name: "Pets", description: "", cooldown: 100, effect: { kind: "summon", dps: 50, apScaling: 0, interval: 1, duration: 4 } },
    ]);
    const ticks = simulateCombat(hero, level).events.filter((e) => e.type === "summonTick");
    expect(ticks.length).toBeGreaterThanOrEqual(3); // ~4 ticks over 4s at interval 1 (enemy survives to absorb them)
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** `npx vitest run src/game/simulateCombat.test.ts` → FAIL (new tests reference behavior not yet implemented).

- [ ] **Step 3: Rewrite `simulateCombat.ts`.** Replace the whole file with:

```ts
import { enemies } from "./content";
import { createSeededRandom } from "./random";
import {
  abilityDamagePerTarget,
  abilityShieldAmount,
  effectiveCooldown,
  summonDamagePerTick,
} from "./abilities";
import type { AbilityDefinition, CombatEnemy, CombatEvent, CombatResult, HeroClass, LevelDefinition } from "./types";

const HERO_ATTACK_WINDUP = 0.16;
const ENEMY_REACH_TIME = 4.2;
const ABILITY_WARMUP = 0.8;

interface ActiveBuff {
  attackSpeed: number;
  damage: number;
  expiresAt: number;
}

interface ActiveSummon {
  abilityId: string;
  perTick: number;
  interval: number;
  nextTick: number;
  expiresAt: number;
}

export function simulateCombat(heroClass: HeroClass, level: LevelDefinition): CombatResult {
  const random = createSeededRandom(level.seed + heroClass.id.length * 97);
  const events: CombatEvent[] = [];
  const enemiesToSpawn = buildEnemySpawns(level);
  const activeEnemies: CombatEnemy[] = [];
  const defeated = new Set<string>();
  const nextEnemyAttack = new Map<string, number>();
  const nextAbilityReady = new Map<string, number>();
  for (const ability of heroClass.abilities) {
    nextAbilityReady.set(ability.id, ABILITY_WARMUP);
  }
  const activeBuffs: ActiveBuff[] = [];
  const activeSummons: ActiveSummon[] = [];
  let shield: { amount: number; expiresAt: number } | null = null;
  let spawnIndex = 0;
  let heroHealth = heroClass.stats.health;
  let nextHeroAttack = 0.6;
  let xp = 0;
  let gold = 0;
  let time = 0;

  const levelDamageMultiplier = level.combat.heroDamageMultipliers[heroClass.damageKind] ?? 1;

  function livingEnemies(): CombatEnemy[] {
    return activeEnemies.filter((enemy) => enemy.health > 0);
  }

  function pickTargets(count: number): CombatEnemy[] {
    return livingEnemies()
      .sort((a, b) => a.spawnTime - b.spawnTime)
      .slice(0, Math.max(0, count));
  }

  function registerKill(target: CombatEnemy, at: number): void {
    if (target.health <= 0 && !defeated.has(target.id)) {
      defeated.add(target.id);
      xp += target.rewardXp;
      gold += target.rewardGold;
      events.push({ type: "death", time: roundTime(at + 0.08), enemyId: target.id });
    }
  }

  function buffTotals(): { attackSpeed: number; damage: number } {
    let attackSpeed = 0;
    let damage = 0;
    for (const buff of activeBuffs) {
      if (time <= buff.expiresAt) {
        attackSpeed += buff.attackSpeed;
        damage += buff.damage;
      }
    }
    return { attackSpeed, damage };
  }

  function fireAbility(ability: AbilityDefinition): void {
    const effect = ability.effect;

    if (effect.kind === "damage") {
      const targets = pickTargets(effect.targets);
      const perTarget = abilityDamagePerTarget(effect, heroClass.stats.damage, heroClass.stats.abilityPower, levelDamageMultiplier);
      const targetIds: string[] = [];
      let lastDamage = 0;
      for (const target of targets) {
        const damage = mitigateDamage(Math.round(perTarget * getTargetDamageMultiplier(heroClass, target)), target.armor);
        target.health = Math.max(0, target.health - damage);
        lastDamage = damage;
        targetIds.push(target.id);
        events.push({
          type: "projectile",
          time: roundTime(Math.max(0, time - HERO_ATTACK_WINDUP)),
          sourceId: "hero",
          targetId: target.id,
          damageKind: heroClass.damageKind,
        });
        registerKill(target, time);
      }
      events.push({ type: "abilityCast", time: roundTime(time), abilityId: ability.id, label: ability.name, targetIds });
      events.push({
        type: "attack",
        time: roundTime(time),
        sourceId: "hero",
        targetIds,
        damage: lastDamage,
        critical: false,
        damageKind: heroClass.damageKind,
        label: ability.name,
      });
      return;
    }

    if (effect.kind === "buff") {
      activeBuffs.push({
        attackSpeed: effect.modifiers.attackSpeed ?? 0,
        damage: effect.modifiers.damage ?? 0,
        expiresAt: time + effect.duration,
      });
      events.push({ type: "abilityCast", time: roundTime(time), abilityId: ability.id, label: ability.name, targetIds: [] });
      events.push({ type: "buff", time: roundTime(time), abilityId: ability.id, label: ability.name, duration: effect.duration });
      return;
    }

    if (effect.kind === "shield") {
      const amount = abilityShieldAmount(effect, heroClass.stats.abilityPower);
      shield = { amount, expiresAt: time + effect.duration };
      events.push({ type: "abilityCast", time: roundTime(time), abilityId: ability.id, label: ability.name, targetIds: [] });
      events.push({ type: "shield", time: roundTime(time), abilityId: ability.id, amount });
      return;
    }

    // summon
    activeSummons.push({
      abilityId: ability.id,
      perTick: summonDamagePerTick(effect, heroClass.stats.abilityPower),
      interval: effect.interval,
      nextTick: time + effect.interval,
      expiresAt: time + effect.duration,
    });
    events.push({ type: "abilityCast", time: roundTime(time), abilityId: ability.id, label: ability.name, targetIds: [] });
  }

  while (time <= level.durationLimit) {
    while (spawnIndex < enemiesToSpawn.length && enemiesToSpawn[spawnIndex].spawnTime <= time) {
      const enemy = enemiesToSpawn[spawnIndex];
      activeEnemies.push(enemy);
      nextEnemyAttack.set(enemy.id, enemy.spawnTime + ENEMY_REACH_TIME);
      events.push({
        type: "spawn",
        time: roundTime(enemy.spawnTime),
        enemyId: enemy.id,
        enemyName: enemy.name,
        gate: enemy.gate,
        maxHealth: enemy.maxHealth,
      });
      spawnIndex += 1;
    }

    if (shield && time > shield.expiresAt) {
      shield = null;
    }

    for (const enemy of activeEnemies) {
      if (enemy.health <= 0) {
        continue;
      }
      const nextAttack = nextEnemyAttack.get(enemy.id) ?? enemy.spawnTime + ENEMY_REACH_TIME;
      const attackCadence = 1 / enemy.attackSpeed;
      if (time >= nextAttack) {
        nextEnemyAttack.set(enemy.id, nextAttack + attackCadence);
        let damage = mitigateDamage(enemy.damage, heroClass.stats.armor);
        if (shield && time <= shield.expiresAt && shield.amount > 0) {
          const absorbed = Math.min(shield.amount, damage);
          shield.amount -= absorbed;
          damage -= absorbed;
        }
        heroHealth = Math.max(0, heroHealth - damage);
        events.push({ type: "heroHit", time: roundTime(time), sourceId: enemy.id, damage });
        if (heroHealth <= 0) {
          events.push({ type: "heroDefeated", time: roundTime(time) });
          return finishResult(heroClass, level, false, time, heroHealth, defeated.size, xp, gold, events);
        }
      }
    }

    for (const summon of activeSummons) {
      while (time >= summon.nextTick && summon.nextTick <= summon.expiresAt) {
        const target = pickTargets(1)[0];
        if (!target) {
          summon.nextTick += summon.interval;
          continue;
        }
        const damage = mitigateDamage(Math.round(summon.perTick * getTargetDamageMultiplier(heroClass, target)), target.armor);
        target.health = Math.max(0, target.health - damage);
        events.push({ type: "summonTick", time: roundTime(time), abilityId: summon.abilityId, targetId: target.id, damage });
        registerKill(target, time);
        summon.nextTick += summon.interval;
      }
    }
    for (let i = activeSummons.length - 1; i >= 0; i -= 1) {
      if (time > activeSummons[i].expiresAt) {
        activeSummons.splice(i, 1);
      }
    }

    for (const ability of heroClass.abilities) {
      const ready = nextAbilityReady.get(ability.id) ?? ABILITY_WARMUP;
      if (time < ready) {
        continue;
      }
      if (ability.effect.kind === "damage" && livingEnemies().length === 0) {
        continue;
      }
      fireAbility(ability);
      nextAbilityReady.set(ability.id, time + effectiveCooldown(ability, heroClass.stats.cooldownReduction));
    }

    if (time >= nextHeroAttack) {
      const target = pickTargets(1)[0];
      const buffs = buffTotals();
      if (target) {
        const critical = random() < heroClass.stats.critChance;
        const baseDamage = heroClass.stats.damage + buffs.damage + heroClass.stats.abilityPower * 0.55;
        const multiplier = critical ? heroClass.stats.critDamage : 1;
        const rawDamage = Math.round(baseDamage * multiplier * levelDamageMultiplier);
        const damage = mitigateDamage(Math.round(rawDamage * getTargetDamageMultiplier(heroClass, target)), target.armor);
        target.health = Math.max(0, target.health - damage);
        events.push({
          type: "projectile",
          time: roundTime(Math.max(0, time - HERO_ATTACK_WINDUP)),
          sourceId: "hero",
          targetId: target.id,
          damageKind: heroClass.damageKind,
        });
        events.push({
          type: "attack",
          time: roundTime(time),
          sourceId: "hero",
          targetIds: [target.id],
          damage,
          critical,
          damageKind: heroClass.damageKind,
          label: basicAttackLabel(heroClass.damageKind),
        });
        registerKill(target, time);
      }
      const effectiveAttackSpeed = heroClass.stats.attackSpeed + buffs.attackSpeed;
      nextHeroAttack = time + 1 / (effectiveAttackSpeed * (1 + heroClass.stats.cooldownReduction));
    }

    if (spawnIndex >= enemiesToSpawn.length && activeEnemies.every((enemy) => enemy.health <= 0)) {
      events.push({ type: "levelComplete", time: roundTime(time + 0.25), xp, gold });
      return finishResult(heroClass, level, true, time + 0.25, heroHealth, defeated.size, xp, gold, events);
    }

    time = roundTime(time + 0.05);
  }

  return finishResult(heroClass, level, false, level.durationLimit, heroHealth, defeated.size, xp, gold, events);
}

function buildEnemySpawns(level: LevelDefinition): CombatEnemy[] {
  const spawns: CombatEnemy[] = [];
  let index = 1;

  for (const wave of level.enemyWaves) {
    const definition = enemies[wave.enemyId];
    if (!definition) {
      throw new Error(`Unknown enemy definition: ${wave.enemyId}`);
    }

    for (let i = 0; i < wave.count; i += 1) {
      const spawnTime = wave.startsAt + i * wave.interval;
      const maxHealth = Math.round(definition.health * level.combat.enemyHealthMultiplier);

      spawns.push({
        id: `${definition.id}-${index}`,
        definitionId: definition.id,
        name: definition.name,
        traits: definition.traits,
        maxHealth,
        health: maxHealth,
        armor: definition.armor,
        damage: Math.max(1, Math.round(definition.damage * level.combat.enemyDamageMultiplier)),
        attackSpeed: definition.attackSpeed,
        moveSpeed: definition.moveSpeed,
        rewardXp: Math.max(1, Math.round(definition.rewardXp * level.combat.rewardMultiplier)),
        rewardGold: Math.max(1, Math.round(definition.rewardGold * level.combat.rewardMultiplier)),
        gate: wave.gate,
        spawnTime,
      });
      index += 1;
    }
  }

  return spawns.sort((a, b) => a.spawnTime - b.spawnTime);
}

function mitigateDamage(rawDamage: number, armor: number): number {
  const armorMultiplier = 100 / (100 + armor * 6);
  return Math.max(1, Math.round(rawDamage * armorMultiplier));
}

function getTargetDamageMultiplier(heroClass: HeroClass, enemy: CombatEnemy): number {
  if (heroClass.damageKind === "melee" && enemy.traits.includes("flying")) {
    return 0.38;
  }

  return 1;
}

function basicAttackLabel(kind: HeroClass["damageKind"]): string {
  if (kind === "magic") {
    return "Spell bolt";
  }
  if (kind === "ranged") {
    return "Arrow shot";
  }
  if (kind === "summon") {
    return "Spirit strike";
  }
  return "Weapon strike";
}

function roundTime(value: number): number {
  return Math.round(value * 100) / 100;
}

function finishResult(
  heroClass: HeroClass,
  level: LevelDefinition,
  won: boolean,
  duration: number,
  heroHealthRemaining: number,
  enemiesDefeated: number,
  xp: number,
  gold: number,
  events: CombatEvent[],
): CombatResult {
  return {
    heroClass,
    level,
    won,
    duration: roundTime(duration),
    heroHealthRemaining: Math.round(heroHealthRemaining),
    enemiesDefeated,
    xp,
    gold,
    events,
  };
}
```

- [ ] **Step 4: Run the sim tests.** `npx vitest run src/game/simulateCombat.test.ts`.
  - The 4 new ability-effect tests should pass.
  - **The existing guardrails must still pass**: `level 1 winnable for every starter class` (all `won`, `enemiesDefeated === 30`), determinism, xp/gold totals, and melee-vs-flying.
  - If `level 1 winnable` fails for a class (removing the cleave cut its AoE), TUNE that class's ability in `src/game/content.ts` — e.g. shorten `cooldown`, raise `damageMultiplier`/`targets` for damage classes, strengthen the Berserker buff, lengthen the Guardian shield — and/or lower `ABILITY_WARMUP`, until every class clears level 1. Do NOT weaken the test. Re-run until green.

- [ ] **Step 5: Full suite + typecheck.** `npm test` and `npx tsc --noEmit`. Note: `heroClass.special` is now unused by the sim but still present on the type/content (removed in Task 4) — that's expected and compiles.

- [ ] **Step 6: Commit.**

```bash
git add src/game/simulateCombat.ts src/game/simulateCombat.test.ts src/game/content.ts
git commit -m "Fire class abilities on cooldowns in the simulation"
```

---

## Task 4: Remove the deprecated `special` field

**Files:** `src/game/types.ts`, `src/game/content.ts`, `src/App.tsx`.

- [ ] **Step 1: Remove from the type.** In `src/game/types.ts`, delete the `special: { ... }` block from the `HeroClass` interface.

- [ ] **Step 2: Remove from content.** In `src/game/content.ts`, delete the `special: { ... }` object from all five hero class definitions (keep `abilities`).

- [ ] **Step 3: Update the hero-detail UI.** In `src/App.tsx`, the "Special" stat cell currently renders `{selectedClass.special.name}`. Replace it with the class's ability name(s):

```tsx
              <div>
                <dt>Ability</dt>
                <dd>{selectedClass.abilities.map((ability) => ability.name).join(", ")}</dd>
              </div>
```

(Change the `<dt>` label from "Special" to "Ability".)

- [ ] **Step 4: Verify no dangling references.** Grep the repo for `.special`:

Run: `grep -rn "\.special" src/`
Expected: no matches in `src/` (the field is gone). If any remain (e.g. in `CombatReplay.tsx`), update them — `CombatReplay` should rely on `event.label`, not `heroClass.special`.

- [ ] **Step 5: Build + test.** `npm run build` → clean (tsc catches any missed reference). `npm test` → all pass.

- [ ] **Step 6: Commit.**

```bash
git add src/game/types.ts src/game/content.ts src/App.tsx
git commit -m "Remove deprecated every-Nth-attack special field"
```

---

## Task 5: Replay cast flash + combat-log ability events

**Files:** `src/App.tsx`, `src/components/CombatReplay.tsx`, `src/styles.css`. Verified by build + browser (Task 6).

- [ ] **Step 1: Show ability casts in the combat log.** In `src/App.tsx`, the combat log currently filters events to `attack`/`death`/`levelComplete`. Add `abilityCast` to the filter and render it. Find the `.filter((event) => event.type === "attack" || ...)` and extend it:

```tsx
              .filter(
                (event) =>
                  event.type === "attack" ||
                  event.type === "death" ||
                  event.type === "levelComplete" ||
                  event.type === "abilityCast",
              )
```

And in the `.map(...)` that renders each event, add a branch for `abilityCast` (alongside the existing `event.type === "attack" && ...` lines):

```tsx
                    {event.type === "abilityCast" && `Cast ${event.label}`}
```

- [ ] **Step 2: Add a cast flash to the replay.** In `src/components/CombatReplay.tsx`, inside `TimelineActors`, compute whether a cast is active near the current `time` and render a brief ring/flash on the hero. Add near the other `useMemo`s:

```tsx
  const casting = useMemo(
    () =>
      result.events.some(
        (event) => event.type === "abilityCast" && time >= event.time && time <= event.time + 0.35,
      ),
    [result.events, time],
  );
```

Then render a flash when `casting` (place inside the returned fragment of `TimelineActors`):

```tsx
      {casting ? (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.1, 1.35, 40]} />
          <meshStandardMaterial color={heroClass.color} emissive={heroClass.color} emissiveIntensity={1.4} transparent opacity={0.7} />
        </mesh>
      ) : null}
```

(`heroClass` and `time` are already in scope inside `TimelineActors`; `useMemo` is already imported.)

- [ ] **Step 3: (Optional) style** — no new CSS is strictly required; the combat log reuses existing styles. Skip `styles.css` unless a tweak is needed.

- [ ] **Step 4: Build.** `npm run build` → green.

- [ ] **Step 5: Commit.**

```bash
git add src/App.tsx src/components/CombatReplay.tsx
git commit -m "Show ability casts in combat log and replay"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full suite.** `npm test` → all pass (including the level-1 guardrail for all 5 classes).
- [ ] **Step 2: Build.** `npm run build` → green.
- [ ] **Step 3: Browser end-to-end** (project `verify` skill recipe, `.claude/skills/verify/SKILL.md`). From a fresh save:
  - For each of the 5 classes, start level 1 and confirm it is won and the combat log shows the class's ability casting (e.g. Berserker "Cast Bloodlust", Arcanist "Cast Arcane Nova").
  - Confirm the replay shows a cast flash and does not error.
  - Seed a high-`abilityPower` build (or level up + allocate AbilityPower / equip AP gear) and confirm the Arcanist/Summoner ability visibly hits harder (higher damage numbers), demonstrating AP scaling is live.
  - Confirm the hero-detail panel shows the ability name under "Ability".
- [ ] **Step 4:** Confirm zero console errors during the session.

---

## Self-Review Notes

- **Spec coverage:** data-driven ability model (Task 1), pure magnitude/cooldown helpers (Task 2), sim integration of all four effect kinds + new events + removal of the every-Nth special (Task 3), `special` removal (Task 4), replay/log/hero-detail UI (Tasks 4–5), testing incl. determinism + the level-1 guardrail (Tasks 2–3, 6). YAGNI: no heal effect, one ability per class, minimal VFX.
- **Determinism:** ability damage rolls no `random()`; cooldowns are time-driven; basic-attack crit RNG order is unchanged, so same seed → same timeline.
- **Balance guardrail is explicit** in Task 3 Step 4 — the level-1 winnable test governs tuning; the test is never weakened.
- **Type/name consistency:** `AbilityDefinition`/`AbilityEffect`; helpers `effectiveCooldown`/`abilityDamagePerTarget`/`abilityShieldAmount`/`summonDamagePerTick`; event types `abilityCast`/`buff`/`shield`/`summonTick` — consistent across types.ts, abilities.ts, simulateCombat.ts, and the UI.
- **Incremental compilation:** Tasks 1–3 keep `special` on the type/content so the project compiles at every checkpoint; Task 4 removes it once nothing uses it.
