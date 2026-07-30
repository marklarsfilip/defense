# Enemy Trait Behaviors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the nine `EnemyTrait` values real mechanical teeth so they force build counterplay, and move that counterplay out of the level-wide `heroDamageMultipliers` that currently fake it.

**Architecture:** A new pure module `src/game/traits.ts` holds a flat `traitRules` table of typed knobs plus two resolvers — `resolveHeroDamage` (hero → enemy) and `resolveEnemyDamage` (enemy → hero). `simulateCombat.ts` funnels its four damage sites through those two functions, deleting `getTargetDamageMultiplier` and its local `mitigateDamage`. Trait rule text is authored in the same table the rules live in, and a new `roster.ts` turns a level's waves into per-enemy trait descriptions for the pre-combat UI. Balance is corrected in `content.ts` and `levels.ts` against a **required-gear-power** baseline already measured on untouched code and written up in `docs/superpowers/plans/2026-07-30-trait-balance-baseline.md`.

**Tech Stack:** TypeScript, Vite, React 19, Vitest 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-30-enemy-trait-behaviors-design.md`

## Global Constraints

- **Determinism is non-negotiable.** The simulation must produce identical timelines for the same class + level. No new RNG draws — trait rules are pure arithmetic. The existing determinism test must keep passing.
- **Level 1 stays unloseable.** All five starter classes win `starterLevel` with `enemiesDefeated === 30`. This is the project's balance guardrail and must never be weakened to make another test pass.
- **Additive stat pipeline is sacred.** All hero stat sources stack additively through `applyStatModifiers` in `src/game/stats.ts`. Trait rules operate on *damage instances*, never on hero stats. Do not introduce a second stat-stacking system.
- **No damage instance may ever resolve below 1.** Every resolver returns `Math.max(1, ...)`. No trait is an immunity.
- **Trait knob values are fixed by the spec**, not by the tuning process: `flying` meleePenalty `0.38`, `fragile` critVulnerability `1.6`, `armored` plating base `9`, `caster` armorPierce `0.7`, `dangerous` damageAmplifier `2.0`, `swarm` pack `{ damagePerAlly: 0.10, resistancePerAlly: 0.06, maxAllies: 6 }`, `boss` spreadResistance `0.6`. Tune `content.ts` and `levels.ts` numbers instead.
- **Out of scope:** enemy abilities/cooldowns, movement or range simulation (`moveSpeed` and hero `range` stay unused), new enemy types, new trait types.
- Run tests with `npm test`. Typecheck with `npm run build` (runs `tsc --noEmit` first).
- Commit after every task.

---

### Task 1: Trait rule table and descriptions

Creates the data layer: the table of knobs and the player-facing text, with no combat math yet.

**Files:**
- Create: `src/game/traits.ts`
- Create: `src/game/traits.test.ts`
- Modify: `src/game/types.ts` (add `PackScaling`, `TraitRule`, `TraitDescription`)

**Interfaces:**
- Consumes: `EnemyTrait` from `src/game/types.ts`.
- Produces: `traitRules: Record<EnemyTrait, TraitRule>`, `describeTrait(trait: EnemyTrait): TraitDescription`, `describeEnemyTraits(traits: EnemyTrait[]): TraitDescription[]`, `enemyPlating(traits: EnemyTrait[]): number`, `hasTraitRule(trait: EnemyTrait): boolean`. Types `PackScaling`, `TraitRule`, `TraitDescription` exported from `types.ts`.

**Read first:** `docs/superpowers/plans/2026-07-30-trait-balance-baseline.md`. The pre-change balance baseline has **already been measured** on untouched code at commit `70ff484` and written up there, because it stops being measurable once Task 4 wires the resolvers in. It also documents that three of the current `heroDamageMultipliers` point the wrong way, which is the evidence this whole slice rests on. Do not re-measure it.

- [ ] **Step 1: Add the trait types to `src/game/types.ts`**

Append after the `EnemyTrait` union (around line 14):

```ts
export interface PackScaling {
  damagePerAlly: number;
  resistancePerAlly: number;
  maxAllies: number;
}

export interface TraitRule {
  label: string;
  /** Player-facing rule text for the pre-combat roster. */
  summary: string;
  /** Combat-log fragment, appended after the enemy name. Omit for traits with no rules. */
  logLine?: string;
  /** Multiplier applied to melee hero damage. */
  meleePenalty?: number;
  /** Multiplier applied when the incoming hit was a critical. */
  critVulnerability?: number;
  /** Flat damage subtracted after armor mitigation. Scaled per spawn by level. */
  plating?: number;
  /** Multiplier applied when the same attack struck more than one enemy. */
  spreadResistance?: number;
  /** Fraction of the hero's armor this enemy's attacks ignore. */
  armorPierce?: number;
  /** Multiplier applied to this enemy's outgoing damage. */
  damageAmplifier?: number;
  /** Scales both directions with the number of living packmates. */
  pack?: PackScaling;
}

export interface TraitDescription {
  trait: EnemyTrait;
  label: string;
  summary: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/game/traits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeEnemyTraits, describeTrait, enemyPlating, hasTraitRule, traitRules } from "./traits";
import type { EnemyTrait } from "./types";

const ALL_TRAITS: EnemyTrait[] = [
  "ground", "flying", "fragile", "dangerous", "armored", "caster", "swarm", "boss", "bonus",
];

describe("trait rules table", () => {
  it("describes every trait", () => {
    for (const trait of ALL_TRAITS) {
      const description = describeTrait(trait);
      expect(description.trait, trait).toBe(trait);
      expect(description.label.length, trait).toBeGreaterThan(0);
      expect(description.summary.length, trait).toBeGreaterThan(0);
    }
  });

  it("uses the trait knob values the spec fixes", () => {
    expect(traitRules.flying.meleePenalty).toBe(0.38);
    expect(traitRules.fragile.critVulnerability).toBe(1.6);
    expect(traitRules.armored.plating).toBe(9);
    expect(traitRules.caster.armorPierce).toBe(0.7);
    expect(traitRules.dangerous.damageAmplifier).toBe(2);
    expect(traitRules.swarm.pack).toEqual({ damagePerAlly: 0.1, resistancePerAlly: 0.06, maxAllies: 6 });
    expect(traitRules.boss.spreadResistance).toBe(0.6);
  });

  it("marks ground and bonus as rule-free and everything else as rule-bearing", () => {
    expect(hasTraitRule("ground")).toBe(false);
    expect(hasTraitRule("bonus")).toBe(false);
    for (const trait of ALL_TRAITS.filter((t) => t !== "ground" && t !== "bonus")) {
      expect(hasTraitRule(trait), trait).toBe(true);
    }
  });

  it("gives every rule-bearing trait a combat-log line", () => {
    for (const trait of ALL_TRAITS.filter(hasTraitRule)) {
      expect(traitRules[trait].logLine, trait).toBeTruthy();
    }
  });

  it("sums plating across a trait list", () => {
    expect(enemyPlating(["ground", "armored"])).toBe(9);
    expect(enemyPlating(["ground", "flying"])).toBe(0);
  });

  it("describes a trait list in order", () => {
    expect(describeEnemyTraits(["ground", "armored"]).map((entry) => entry.trait)).toEqual(["ground", "armored"]);
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npm test -- traits`
Expected: FAIL — cannot resolve `./traits`.

- [ ] **Step 4: Create `src/game/traits.ts`**

```ts
import type { EnemyTrait, TraitDescription, TraitRule } from "./types";

export const traitRules: Record<EnemyTrait, TraitRule> = {
  ground: {
    label: "Ground",
    summary: "No special defenses — whatever you brought works.",
  },
  flying: {
    label: "Flying",
    summary: "Airborne. Melee weapons only clip it: melee damage is cut to 38%.",
    logLine: "stayed out of melee reach",
    meleePenalty: 0.38,
  },
  fragile: {
    label: "Fragile",
    summary: "Thin-shelled. Critical hits deal 60% extra damage to it.",
    logLine: "was torn open by a critical hit",
    critVulnerability: 1.6,
  },
  armored: {
    label: "Armored",
    summary: "Plated. Every hit loses a flat chunk of damage after armor, so big hits punch through and fast weak hits barely scratch.",
    logLine: "blunted the hit with its plating",
    plating: 9,
  },
  caster: {
    label: "Caster",
    summary: "Its spellfire ignores 70% of your armor. Answer with health, shields, or a faster kill.",
    logLine: "pierced your armor with spellfire",
    armorPierce: 0.7,
  },
  dangerous: {
    label: "Dangerous",
    summary: "Every strike it lands hits for double damage.",
    logLine: "struck for double damage",
    damageAmplifier: 2,
  },
  swarm: {
    label: "Swarm",
    summary: "Emboldened in numbers: +10% damage and 6% damage resistance per nearby packmate, up to 6. Thin the pack fast.",
    logLine: "drew strength from its pack",
    pack: { damagePerAlly: 0.1, resistancePerAlly: 0.06, maxAllies: 6 },
  },
  boss: {
    label: "Boss",
    summary: "A massive single target. An attack that struck several enemies deals 40% less to it — sustained single-target damage wins.",
    logLine: "shed spread damage",
    spreadResistance: 0.6,
  },
  bonus: {
    label: "Bonus",
    summary: "A harmless treasure creature.",
  },
};

export function describeTrait(trait: EnemyTrait): TraitDescription {
  const rule = traitRules[trait];

  return { trait, label: rule.label, summary: rule.summary };
}

export function describeEnemyTraits(traits: EnemyTrait[]): TraitDescription[] {
  return traits.map(describeTrait);
}

export function hasTraitRule(trait: EnemyTrait): boolean {
  const rule = traitRules[trait];

  return (
    rule.meleePenalty !== undefined ||
    rule.critVulnerability !== undefined ||
    rule.plating !== undefined ||
    rule.spreadResistance !== undefined ||
    rule.armorPierce !== undefined ||
    rule.damageAmplifier !== undefined ||
    rule.pack !== undefined
  );
}

export function enemyPlating(traits: EnemyTrait[]): number {
  return traits.reduce((total, trait) => total + (traitRules[trait].plating ?? 0), 0);
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- traits`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/game/traits.ts src/game/traits.test.ts src/game/types.ts
git commit -m "Add enemy trait rule table with player-facing descriptions"
```

---

### Task 2: resolveHeroDamage

The hero → enemy pipeline. Pure function, no simulation wiring yet.

**Files:**
- Modify: `src/game/traits.ts`
- Modify: `src/game/traits.test.ts`

**Interfaces:**
- Consumes: `traitRules` from Task 1.
- Produces: `resolveHeroDamage(input: HeroDamageInput): ResolvedDamage` where
  `HeroDamageInput = { rawDamage: number; traits: EnemyTrait[]; armor: number; plating: number; damageKind: DamageKind; critical: boolean; targetsHit: number; livingSwarmCount: number }`
  and `ResolvedDamage = { damage: number; appliedTraits: EnemyTrait[] }`.
  Also `mitigateByArmor(rawDamage: number, armor: number): number` (exported for `resolveEnemyDamage` and tests).

Note the input takes loose fields (`traits`, `armor`, `plating`) rather than a `CombatEnemy`, so `traits.ts` stays free of combat types and the tests stay short.

- [ ] **Step 1: Write the failing tests**

Extend the existing `./traits` import at the top of `src/game/traits.test.ts` to add `mitigateByArmor` and `resolveHeroDamage` — do not add a second import line from the same module. Then append:

```ts
const HERO_HIT = {
  rawDamage: 100,
  traits: [] as EnemyTrait[],
  armor: 0,
  plating: 0,
  damageKind: "melee" as const,
  critical: false,
  targetsHit: 1,
  livingSwarmCount: 0,
};

describe("resolveHeroDamage", () => {
  it("passes damage through untouched when no trait applies", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["ground"] })).toEqual({ damage: 100, appliedTraits: [] });
  });

  it("mitigates by armor before anything else reduces the hit", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, armor: 10 }).damage).toBe(Math.round(mitigateByArmor(100, 10)));
  });

  it("subtracts plating after armor mitigation, not before", () => {
    const armorOnly = resolveHeroDamage({ ...HERO_HIT, traits: ["armored"], armor: 10, plating: 0 }).damage;
    const plated = resolveHeroDamage({ ...HERO_HIT, traits: ["armored"], armor: 10, plating: 9 }).damage;

    expect(plated).toBe(armorOnly - 9);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["armored"], plating: 9 }).appliedTraits).toEqual(["armored"]);
  });

  it("does not report plating when the enemy has none resolved", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["armored"], plating: 0 }).appliedTraits).toEqual([]);
  });

  it("cuts melee damage against flying enemies and leaves other kinds alone", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["flying"] }).damage).toBe(38);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["flying"], damageKind: "ranged" }).damage).toBe(100);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["flying"], damageKind: "ranged" }).appliedTraits).toEqual([]);
  });

  it("amplifies critical hits against fragile enemies only when the hit crits", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["fragile"], critical: true }).damage).toBe(160);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["fragile"] }).damage).toBe(100);
  });

  it("reduces spread damage against bosses only when several enemies were struck", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["boss"], targetsHit: 4 }).damage).toBe(60);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["boss"], targetsHit: 1 }).damage).toBe(100);
  });

  it("scales swarm resistance with packmates and clamps at the cap", () => {
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["swarm"], livingSwarmCount: 1 }).damage).toBe(100);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["swarm"], livingSwarmCount: 3 }).damage).toBe(88);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["swarm"], livingSwarmCount: 7 }).damage).toBe(64);
    expect(resolveHeroDamage({ ...HERO_HIT, traits: ["swarm"], livingSwarmCount: 20 }).damage).toBe(64);
  });

  it("stacks multiple traits multiplicatively and reports each one", () => {
    const resolved = resolveHeroDamage({ ...HERO_HIT, traits: ["flying", "caster", "fragile"], critical: true });

    expect(resolved.damage).toBe(Math.round(100 * 0.38 * 1.6));
    expect(resolved.appliedTraits).toEqual(["flying", "fragile"]);
  });

  it("never resolves a hit below 1 damage, however stacked", () => {
    const resolved = resolveHeroDamage({
      ...HERO_HIT,
      rawDamage: 1,
      traits: ["flying", "armored", "swarm", "boss"],
      armor: 200,
      plating: 9999,
      targetsHit: 5,
      livingSwarmCount: 20,
    });

    expect(resolved.damage).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- traits`
Expected: FAIL — `resolveHeroDamage` and `mitigateByArmor` are not exported.

- [ ] **Step 3: Implement the resolver**

First extend the single `import type` line at the top of `src/game/traits.ts` so it reads:

```ts
import type { DamageKind, EnemyTrait, PackScaling, TraitDescription, TraitRule } from "./types";
```

Then append to the file:

```ts
export interface HeroDamageInput {
  rawDamage: number;
  traits: EnemyTrait[];
  armor: number;
  /** Level-scaled flat reduction, resolved once per spawn. */
  plating: number;
  damageKind: DamageKind;
  critical: boolean;
  /** How many enemies this same attack struck. */
  targetsHit: number;
  livingSwarmCount: number;
}

export interface ResolvedDamage {
  damage: number;
  appliedTraits: EnemyTrait[];
}

/** Armor curve shared by both damage directions. */
export function mitigateByArmor(rawDamage: number, armor: number): number {
  return rawDamage * (100 / (100 + Math.max(0, armor) * 6));
}

function packAllies(pack: PackScaling, livingSwarmCount: number): number {
  return Math.min(pack.maxAllies, Math.max(0, livingSwarmCount - 1));
}

export function resolveHeroDamage(input: HeroDamageInput): ResolvedDamage {
  const applied = new Set<EnemyTrait>();
  let multiplier = 1;

  for (const trait of input.traits) {
    const rule = traitRules[trait];

    if (rule.meleePenalty !== undefined && input.damageKind === "melee") {
      multiplier *= rule.meleePenalty;
      applied.add(trait);
    }

    if (rule.critVulnerability !== undefined && input.critical) {
      multiplier *= rule.critVulnerability;
      applied.add(trait);
    }

    if (rule.spreadResistance !== undefined && input.targetsHit > 1) {
      multiplier *= rule.spreadResistance;
      applied.add(trait);
    }

    if (rule.pack !== undefined) {
      const allies = packAllies(rule.pack, input.livingSwarmCount);
      if (allies > 0) {
        multiplier *= Math.max(0.1, 1 - allies * rule.pack.resistancePerAlly);
        applied.add(trait);
      }
    }

    if (rule.plating !== undefined && input.plating > 0) {
      applied.add(trait);
    }
  }

  const mitigated = mitigateByArmor(input.rawDamage * multiplier, input.armor);

  return { damage: Math.max(1, Math.round(mitigated - input.plating)), appliedTraits: [...applied] };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- traits`
Expected: PASS.

If the multi-trait stacking test is off by 1, the cause is rounding order — `resolveHeroDamage` rounds **once**, at the end. Fix the test's expectation to match single rounding; do not add intermediate rounding.

- [ ] **Step 5: Commit**

```bash
git add src/game/traits.ts src/game/traits.test.ts
git commit -m "Resolve hero damage through the trait rule table"
```

---

### Task 3: resolveEnemyDamage

The enemy → hero pipeline.

**Files:**
- Modify: `src/game/traits.ts`
- Modify: `src/game/traits.test.ts`

**Interfaces:**
- Consumes: `traitRules`, `mitigateByArmor`, `ResolvedDamage`, `packAllies` from Task 2.
- Produces: `resolveEnemyDamage(input: EnemyDamageInput): ResolvedDamage` where
  `EnemyDamageInput = { rawDamage: number; traits: EnemyTrait[]; heroArmor: number; livingSwarmCount: number }`.

- [ ] **Step 1: Write the failing tests**

Add `resolveEnemyDamage` to the existing `./traits` import in `src/game/traits.test.ts`, then append:

```ts
const ENEMY_HIT = {
  rawDamage: 100,
  traits: [] as EnemyTrait[],
  heroArmor: 0,
  livingSwarmCount: 0,
};

describe("resolveEnemyDamage", () => {
  it("mitigates by hero armor when no trait applies", () => {
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["ground"], heroArmor: 20 }).damage)
      .toBe(Math.round(mitigateByArmor(100, 20)));
  });

  it("doubles the strike for dangerous enemies", () => {
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["dangerous"] }).damage).toBe(200);
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["dangerous"] }).appliedTraits).toEqual(["dangerous"]);
  });

  it("ignores 70% of hero armor for casters", () => {
    const pierced = resolveEnemyDamage({ ...ENEMY_HIT, traits: ["caster"], heroArmor: 20 }).damage;

    expect(pierced).toBe(Math.round(mitigateByArmor(100, 20 * 0.3)));
    expect(pierced).toBeGreaterThan(Math.round(mitigateByArmor(100, 20)));
  });

  it("does not claim armor pierce against an unarmored hero", () => {
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["caster"], heroArmor: 0 }).appliedTraits).toEqual([]);
  });

  it("raises swarm damage with packmates and clamps at the cap", () => {
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["swarm"], livingSwarmCount: 1 }).damage).toBe(100);
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["swarm"], livingSwarmCount: 3 }).damage).toBe(120);
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["swarm"], livingSwarmCount: 7 }).damage).toBe(160);
    expect(resolveEnemyDamage({ ...ENEMY_HIT, traits: ["swarm"], livingSwarmCount: 20 }).damage).toBe(160);
  });

  it("never resolves an enemy hit below 1 damage", () => {
    expect(resolveEnemyDamage({ ...ENEMY_HIT, rawDamage: 1, traits: ["ground"], heroArmor: 500 }).damage).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- traits`
Expected: FAIL — `resolveEnemyDamage` is not exported.

- [ ] **Step 3: Implement the resolver**

Append to `src/game/traits.ts`:

```ts
export interface EnemyDamageInput {
  rawDamage: number;
  traits: EnemyTrait[];
  heroArmor: number;
  livingSwarmCount: number;
}

export function resolveEnemyDamage(input: EnemyDamageInput): ResolvedDamage {
  const applied = new Set<EnemyTrait>();
  let multiplier = 1;
  let armorPierce = 0;

  for (const trait of input.traits) {
    const rule = traitRules[trait];

    if (rule.damageAmplifier !== undefined) {
      multiplier *= rule.damageAmplifier;
      applied.add(trait);
    }

    // Only credit the pierce when the hero actually has armor to bypass, so the
    // combat log never claims a trait mattered when it changed nothing.
    if (rule.armorPierce !== undefined && input.heroArmor > 0) {
      armorPierce = Math.max(armorPierce, rule.armorPierce);
      applied.add(trait);
    }

    if (rule.pack !== undefined) {
      const allies = packAllies(rule.pack, input.livingSwarmCount);
      if (allies > 0) {
        multiplier *= 1 + allies * rule.pack.damagePerAlly;
        applied.add(trait);
      }
    }
  }

  const effectiveArmor = input.heroArmor * (1 - Math.min(1, armorPierce));

  return {
    damage: Math.max(1, Math.round(mitigateByArmor(input.rawDamage * multiplier, effectiveArmor))),
    appliedTraits: [...applied],
  };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- traits`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/traits.ts src/game/traits.test.ts
git commit -m "Resolve enemy damage through the trait rule table"
```

---

### Task 4: Wire the resolvers into the simulation

Replaces `getTargetDamageMultiplier` and the local `mitigateDamage` with the two resolvers at all four damage sites. Behaviour changes here — level balance is corrected in Task 7, so expect the existing suite to show balance drift at the end of this task and read the note in Step 6 before reacting to it.

**Files:**
- Modify: `src/game/types.ts` (add `plating` to `CombatEnemy`)
- Modify: `src/game/simulateCombat.ts`

**Interfaces:**
- Consumes: `resolveHeroDamage`, `resolveEnemyDamage`, `enemyPlating` from Tasks 1–3.
- Produces: `CombatEnemy.plating: number`. `simulateCombat` no longer exports or defines `getTargetDamageMultiplier` or `mitigateDamage`.

- [ ] **Step 1: Add `plating` to `CombatEnemy` in `src/game/types.ts`**

In the `CombatEnemy` interface, after `armor: number;`:

```ts
  /** Flat post-armor damage reduction from armored-style traits, scaled by level. */
  plating: number;
```

- [ ] **Step 2: Resolve plating when building spawns**

In `src/game/simulateCombat.ts`, add `enemyPlating` to the import from `./traits` (create the import if this is the first use), then in `buildEnemySpawns` add to the pushed object, right after `armor: definition.armor,`:

```ts
        plating: Math.round(enemyPlating(definition.traits) * level.combat.enemyHealthMultiplier),
```

Plating scales with `enemyHealthMultiplier` so a flat value stays relevant across 30 levels, matching the growth curve enemy health already uses.

- [ ] **Step 3: Add a living-swarm counter**

In `simulateCombat`, directly after the `livingEnemies()` helper:

```ts
  function livingSwarmCount(): number {
    let count = 0;
    for (const enemy of activeEnemies) {
      if (enemy.health > 0 && enemy.traits.includes("swarm")) {
        count += 1;
      }
    }
    return count;
  }
```

- [ ] **Step 4: Route the ability damage site through the resolver**

In `fireAbility`, inside the `effect.kind === "damage"` branch, capture the pack size **once before** the target loop so every target in one cast sees the same pack — killing packmates mid-loop must not change the multiplier for later targets in the same cast, or the result stops being order-independent:

```ts
      const targets = pickTargets(effect.targets);
      const perTarget = abilityDamagePerTarget(effect, heroClass.stats.damage, heroClass.stats.abilityPower, levelDamageMultiplier);
      const swarmCount = livingSwarmCount();
      const targetIds: string[] = [];
      let lastDamage = 0;
      for (const target of targets) {
        const resolved = resolveHeroDamage({
          rawDamage: perTarget,
          traits: target.traits,
          armor: target.armor,
          plating: target.plating,
          damageKind: heroClass.damageKind,
          critical: false,
          targetsHit: targets.length,
          livingSwarmCount: swarmCount,
        });
        const damage = resolved.damage;
        target.health = Math.max(0, target.health - damage);
```

Leave the rest of the loop body (the `lastDamage`, `targetIds`, `projectile` event and `registerKill` lines) unchanged.

- [ ] **Step 5: Route the summon and basic-attack sites through the resolver**

In the summon tick loop, replace the `const damage = mitigateDamage(...)` line with:

```ts
        const damage = resolveHeroDamage({
          rawDamage: summon.perTick,
          traits: target.traits,
          armor: target.armor,
          plating: target.plating,
          damageKind: heroClass.damageKind,
          critical: false,
          targetsHit: 1,
          livingSwarmCount: livingSwarmCount(),
        }).damage;
```

In the basic-attack block, replace the `const damage = mitigateDamage(...)` line with:

```ts
        const damage = resolveHeroDamage({
          rawDamage: rawDamage,
          traits: target.traits,
          armor: target.armor,
          plating: target.plating,
          damageKind: heroClass.damageKind,
          critical,
          targetsHit: 1,
          livingSwarmCount: livingSwarmCount(),
        }).damage;
```

In the enemy-attack block, replace `let damage = mitigateDamage(enemy.damage, heroClass.stats.armor);` with:

```ts
        let damage = resolveEnemyDamage({
          rawDamage: enemy.damage,
          traits: enemy.traits,
          heroArmor: heroClass.stats.armor,
          livingSwarmCount: livingSwarmCount(),
        }).damage;
```

- [ ] **Step 6: Delete the dead helpers and typecheck**

Delete the `mitigateDamage` and `getTargetDamageMultiplier` functions from `src/game/simulateCombat.ts` — both are now unused.

Run: `npm run build`
Expected: typecheck passes, build succeeds.

Run: `npm test`
Expected: `traits` tests pass. **In `simulateCombat.test.ts`, the level-1 and determinism tests must still pass** — level 1 is all `skeleton` (`["ground"]`), which has no trait rules, so a level-1 failure means a wiring bug, not balance drift. The melee-vs-flying test should also still pass, unchanged. Any *other* balance movement is expected and gets corrected in Task 7 — do not weaken a guardrail to make it green.

- [ ] **Step 7: Commit**

```bash
git add src/game/types.ts src/game/simulateCombat.ts
git commit -m "Route every combat damage site through the trait resolvers"
```

---

### Task 5: Trait effect events and combat log lines

Makes traits visible during and after a fight.

**Files:**
- Modify: `src/game/types.ts` (add the `traitEffect` `CombatEvent` variant)
- Modify: `src/game/simulateCombat.ts`
- Modify: `src/game/simulateCombat.test.ts`
- Modify: `src/App.tsx:421-438` (combat log filter and rendering)

**Interfaces:**
- Consumes: `ResolvedDamage.appliedTraits` from Tasks 2–3, `traitRules` from Task 1.
- Produces: `CombatEvent` variant `{ type: "traitEffect"; time: number; enemyId: string; enemyName: string; trait: EnemyTrait; message: string }`, emitted at most once per `(enemyId, trait)` pair per fight.

- [ ] **Step 1: Add the event variant to `src/game/types.ts`**

Append to the `CombatEvent` union:

```ts
  | {
      type: "traitEffect";
      time: number;
      enemyId: string;
      enemyName: string;
      trait: EnemyTrait;
      message: string;
    }
```

- [ ] **Step 2: Write the failing test**

Append to the `simulateCombat` describe block in `src/game/simulateCombat.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npm test -- simulateCombat`
Expected: FAIL — `traitEvents.length` is 0.

- [ ] **Step 4: Emit the events**

In `src/game/simulateCombat.ts`, add `traitRules` to the `./traits` import, then declare next to the other tracking sets (near `const defeated = new Set<string>();`):

```ts
  const announcedTraits = new Set<string>();

  function noteTraitEffects(enemy: CombatEnemy, applied: EnemyTrait[], at: number): void {
    for (const trait of applied) {
      const key = `${enemy.id}:${trait}`;
      if (announcedTraits.has(key)) {
        continue;
      }
      const message = traitRules[trait].logLine;
      if (!message) {
        continue;
      }
      announcedTraits.add(key);
      events.push({
        type: "traitEffect",
        time: roundTime(at),
        enemyId: enemy.id,
        enemyName: enemy.name,
        trait,
        message,
      });
    }
  }
```

Add `EnemyTrait` to the `import type` list from `./types`.

Then at each of the four damage sites, keep the full `resolved` object instead of destructuring only `.damage`, and call the helper right after the health/hero-health update. For the three hero sites the enemy is `target`:

```ts
        noteTraitEffects(target, resolved.appliedTraits, time);
```

For the enemy-attack site the enemy is `enemy`:

```ts
        noteTraitEffects(enemy, resolved.appliedTraits, time);
```

At the enemy-attack site, place the call **before** the `heroHealth <= 0` early return, so the trait that killed the hero still appears in the log.

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- simulateCombat`
Expected: PASS.

- [ ] **Step 6: Render the events in the combat log**

In `src/App.tsx`, add `event.type === "traitEffect" ||` to the combat-log `.filter(...)` predicate, and add a render line alongside the existing ones:

```tsx
                    {event.type === "traitEffect" && `${event.enemyName} ${event.message}`}
```

The 3D replay filters events by explicit type, so it ignores the new variant without changes.

- [ ] **Step 7: Typecheck, test and commit**

Run: `npm run build && npm test`
Expected: both pass.

```bash
git add src/game/types.ts src/game/simulateCombat.ts src/game/simulateCombat.test.ts src/App.tsx
git commit -m "Announce trait effects once per enemy in the combat log"
```

---

### Task 6: Balance harness and counterplay guardrails

Turns balance into tests. The pre-change baseline has already been measured and written to `docs/superpowers/plans/2026-07-30-trait-balance-baseline.md` — read that document before starting this task; it contains the numbers every assertion here is calibrated against, and it proves three of the current `heroDamageMultipliers` point the wrong way.

Several of these guardrails are expected to FAIL at the end of this task. That is the point: Task 7 makes them pass.

**Files:**
- Create: `src/game/balance.ts`
- Create: `src/game/traitBalance.test.ts`
- Modify: `docs/superpowers/plans/2026-07-30-trait-balance-baseline.md`

**Interfaces:**
- Consumes: `simulateCombat`, `createCampaignLevel`, `heroClasses`, `applyStatModifiers`.
- Produces: `scaledHero(heroClass: HeroClass, factor: number): HeroClass`, `requiredPower(heroClass: HeroClass, levelNumber: number): number | null`, `requiredPowerByClass(levelNumber: number): Array<{ id: HeroClassId; required: number | null }>` from `src/game/balance.ts`; plus the guardrail suite that gates Task 7.

**Why required power, not win/loss:** a win/loss matrix at base stats is useless past level 3, because the campaign assumes gear. At base stats, levels 4, 7, 8, 11 and 12 are unwinnable by every class. `requiredPower` instead reports the smallest uniform gear multiplier at which a build clears a level, which stays informative at every level and makes "harder for this build shape" a number rather than a coin flip.

Archetype-to-level mapping, from `pickArchetype` (`sequence[(levelNumber - 2) % 7]`): level 2 flying, 3 glass, **4 brute (armored)**, **5 caster**, **6 swarm**, **7 shield (armored)**, 8 mixed, 10 boss.

- [ ] **Step 1: Create the balance harness**

`src/game/balance.ts`. This is production-adjacent test support, not a test file, because Task 7 iterates with it and later slices (2c, 2d) will reuse it.

```ts
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
```

A linear scan rather than a binary search: `won` is not guaranteed monotonic in the gear factor (more damage can change kill order and therefore which enemies land hits), so a binary search could return a misleading threshold. The scan costs about 200ms for the whole class matrix, which is cheap enough.

- [ ] **Step 2: Write the guardrail suite**

Create `src/game/traitBalance.test.ts`. Every number in `BASELINE_MEDIAN` and every inversion below is copied from the baseline document — do not re-derive them.

```ts
import { describe, expect, it } from "vitest";
import { heroClasses } from "./content";
import { medianPower, requiredPower, requiredPowerByClass } from "./balance";
import type { HeroClass, Stats } from "./types";

const BRUTE_LEVEL = 4;
const CASTER_LEVEL = 5;
const SWARM_LEVEL = 6;
const SHIELD_LEVEL = 7;

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

// Equal defensive budget spent two ways.
const ARMOR_STACK = shapedHero("armor-stack", { armor: 30, health: 150 });
const HEALTH_STACK = shapedHero("health-stack", { armor: 6, health: 270 });

// Equal ability budget, spread across many targets or concentrated on one.
const SPREAD = shapedHero("spread", {}, [
  { id: "nova", name: "Nova", description: "", cooldown: 4, effect: { kind: "damage", targets: 5, damageMultiplier: 1, apScaling: 0 } },
]);
const FOCUSED = shapedHero("focused", {}, [
  { id: "stab", name: "Stab", description: "", cooldown: 4, effect: { kind: "damage", targets: 1, damageMultiplier: 5, apScaling: 0 } },
]);

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
});

describe("swarm counterplay", () => {
  it("keeps multi-target ahead of single-target on Rot Tide", () => {
    // Baseline: spread 1.55, focused 2.65 — already correct. Regression guard.
    expect(power(SPREAD, SWARM_LEVEL)).toBeLessThan(power(FOCUSED, SWARM_LEVEL));
  });
});

describe("campaign balance", () => {
  it("keeps level 1 clearable by every class with no gear at all", () => {
    for (const entry of requiredPowerByClass(1)) {
      expect(entry.required, entry.id).toBe(1);
    }
  });

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
```

- [ ] **Step 3: Run the suite and record which guardrails fail**

Run: `npm test -- traitBalance`

Expect the three inversion tests to fail (armored ×2, caster ×1) and the campaign-balance tests to be in flux. Record the exact failure list in the baseline document under `## Traits wired, content not yet re-tuned`, together with the full class matrix produced by:

```bash
npx vitest run traitBalance --reporter=verbose
```

If the `leaves every class able to kill something` guardrail fails for a class/level pair, that means the pair is unwinnable even at 12× gear — note it, because Task 7 must fix it.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run build`
Expected: passes. `balance.ts` is imported only by tests, which is fine — it is not dead code to the typechecker.

```bash
git add src/game/balance.ts src/game/traitBalance.test.ts docs/superpowers/plans/2026-07-30-trait-balance-baseline.md
git commit -m "Add a required-power balance harness and trait counterplay guardrails"
```

---

### Task 7: Re-tune enemies and levels

Makes Task 6's guardrails pass by correcting content, and strips the faked counterplay from `levels.ts`.

**Files:**
- Modify: `src/game/content.ts:168-239` (enemy definitions)
- Modify: `src/game/levels.ts:124-263` (level archetypes)
- Modify: `docs/superpowers/plans/2026-07-30-trait-balance-baseline.md` (record the after matrix)

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: no new API. `LevelCombatRules` keeps its `heroDamageMultipliers` field — only Broken Wings still populates it.

- [ ] **Step 1: Re-tune the enemy definitions in `src/game/content.ts`**

Apply these starting values. They are the spec's numbers — start here, then move them only as the guardrails demand.

- `graveBrute`: `armor: 9` → `6`
- `shieldBearer`: `armor: 18` → `12`
- `gateTitan`: `armor: 18` → `14`
- `glassCultist`: `damage: 7` → `4`
- `spellWisp`: `damage: 9` → `5`
- `rotImp`: `damage: 3` → `2`

Armored enemies' raw armor comes down because plating now carries the armored identity; without this, mitigation is double-counted. The three damage reductions pay for `dangerous` doubling, `caster` bypassing 70% of armor, and `swarm` pack scaling adding up to +60%.

- [ ] **Step 2: Strip the faked counterplay from `src/game/levels.ts`**

Set `heroDamageMultipliers: {}` in `createBruteLevel`, `createShieldLevel`, `createSwarmLevel`, `createCasterLevel` and `createGlassLevel`.

**Leave `createFlyingLevel`'s multipliers exactly as they are.** `flying` is the one genuinely class-keyed trait — a melee weapon physically cannot reach a flyer — so a damage-kind multiplier is the honest model there, and the existing melee-vs-flying test depends on it.

Then lower the two `enemyDamageMultiplier` curves that now compound with a trait that roughly doubles effective incoming damage, since leaving them would stack an inflation on top of an inflation:

- `createGlassLevel`: `1.25 + levelNumber * 0.035` → `0.85 + levelNumber * 0.02` (pays for `dangerous` ×2)
- `createCasterLevel`: `1.45 + levelNumber * 0.035` → `0.95 + levelNumber * 0.02` (pays for `caster` bypassing 70% of armor)

- [ ] **Step 3: Rewrite the level notes so they stop lying**

The `notes` strings currently advertise mechanics that did not exist and now duplicate what the roster panel renders from trait data. Reduce each to level flavour only — kind, reward character, theme — and delete every counterplay claim, because the roster is now the single source of that text:

- `createBruteLevel`: `["Armored brutes", "Heavy reward chest"]`
- `createShieldLevel`: `["Armored formation", "Heavy reward chest"]`
- `createSwarmLevel`: `["Large swarm", "Lower reward per kill"]`
- `createCasterLevel`: `["Flying casters", "High reward chest"]`
- `createGlassLevel`: `["Fragile but deadly", "High reward chest"]`
- `createFlyingLevel`: `["Flying enemies", "Melee uses weak thrown attacks"]` (the melee note stays — it describes the level multiplier, which survives here)
- `createBossLevel`: `["Every tenth level", "Boss with escort", "Higher reward chest"]`

- [ ] **Step 4: Give boss levels an escort so spread resistance has something to bite on**

A lone boss can never be struck by an attack that hit more than one enemy, so `spreadResistance` would be inert. Replace `createBossLevel`'s `enemyWaves` with the titan plus a modest escort of existing enemies, and lower `enemyHealthMultiplier` to pay for them:

```ts
    combat: {
      enemyHealthMultiplier: 1 + levelNumber * 0.11,
      enemyDamageMultiplier: 1 + levelNumber * 0.05,
      rewardMultiplier: 1.9,
      heroDamageMultipliers: {},
    },
    enemyWaves: [
      { enemyId: "gateTitan", count: 1, startsAt: 0.8, interval: 1, gate: "north" },
      { enemyId: "rotImp", count: 6 + Math.floor(levelNumber / 5), startsAt: 6, interval: 0.9, gate: "east" },
      { enemyId: "skeleton", count: 4 + Math.floor(levelNumber / 10), startsAt: 14, interval: 1.2, gate: "west" },
    ],
```

- [ ] **Step 5: Run the guardrails and iterate on the numbers**

Run: `npm test`

Iterate on `content.ts` enemy stats and `levels.ts` multipliers until the whole suite passes. Rules for this loop:

- **Never** change a trait knob in `traits.ts` — those values define the design.
- **Never** weaken a guardrail assertion to make it pass. If a guardrail looks genuinely wrong rather than unmet, stop and say so instead of editing it.
- The level-1 guardrail and the determinism test are absolute.
- The `BASELINE_MEDIAN` table in `traitBalance.test.ts` is measured history. Never edit it.
- If an equal-budget fixture pair turns out to be structurally uninformative on a level — as `armor-stack` / `health-stack` already is on levels 4, 7 and 10, where both return identical values because the win threshold is set by damage output — pick a level where it does discriminate rather than forcing the assertion. The baseline document records which pairs are informative where.
- If a fixture can't clear a level at any gear factor (both defensive fixtures read `>12` on Rot Tide, since a 20-damage hero with no abilities cannot kill 48+ enemies), adjust the **fixture** so the comparison is measurable, keeping the two builds' budgets equal to each other. Adjusting a fixture to make a property testable is legitimate; adjusting an assertion to make a failure disappear is not.

- [ ] **Step 6: Record the after matrix**

Re-measure the full class matrix and the build-shape pairs, using the same fixtures the baseline document describes:

```bash
npx vitest run traitBalance --reporter=verbose
```

Append both tables to `docs/superpowers/plans/2026-07-30-trait-balance-baseline.md` under `## After trait teeth and re-tune`, followed by a paragraph comparing them to the **Original** tables: which inversions landed, what moved, and why. Every level whose median required power rose needs a sentence justifying it — the target is redistributing difficulty across build shapes, not inflating it.

- [ ] **Step 7: Typecheck and commit**

Run: `npm run build && npm test`
Expected: both pass, full suite green.

```bash
git add src/game/content.ts src/game/levels.ts docs/superpowers/plans/2026-07-30-trait-balance-baseline.md
git commit -m "Re-tune enemies and levels around real trait rules"
```

---

### Task 8: Pre-combat enemy roster panel

Gives the player the information they now need before committing to a level.

**Files:**
- Create: `src/game/roster.ts`
- Create: `src/game/roster.test.ts`
- Modify: `src/App.tsx:264-268` (replace the level-notes area with notes plus roster)
- Modify: `src/styles.css` (after the `.level-notes` block, around line 248)

**Interfaces:**
- Consumes: `describeEnemyTraits`, `hasTraitRule` from Task 1; `enemies` from `content.ts`; `LevelDefinition` from `types.ts`.
- Produces: `buildLevelRoster(level: LevelDefinition): RosterEntry[]` where `RosterEntry = { enemyId: string; name: string; count: number; traits: TraitDescription[] }`. Entries appear in first-spawn order; counts are summed across waves of the same enemy; only rule-bearing traits are described.

`roster.ts` is its own module rather than living in `traits.ts` because it needs `content.ts`, and `traits.ts` must stay dependency-free apart from types.

- [ ] **Step 1: Write the failing test**

Create `src/game/roster.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildLevelRoster } from "./roster";
import { createCampaignLevel } from "./levels";

describe("buildLevelRoster", () => {
  it("sums counts across waves of the same enemy", () => {
    const roster = buildLevelRoster(createCampaignLevel(1));

    expect(roster).toHaveLength(1);
    expect(roster[0].enemyId).toBe("skeleton");
    expect(roster[0].count).toBe(30);
  });

  it("describes only the traits that carry rules", () => {
    const roster = buildLevelRoster(createCampaignLevel(4));
    const brute = roster.find((entry) => entry.enemyId === "graveBrute")!;

    expect(brute.traits.map((trait) => trait.trait)).toEqual(["armored"]);
    expect(brute.traits[0].summary).toContain("Plated");
  });

  it("lists every distinct enemy in a multi-enemy level in first-spawn order", () => {
    const roster = buildLevelRoster(createCampaignLevel(10));

    expect(roster.map((entry) => entry.enemyId)).toEqual(["gateTitan", "rotImp", "skeleton"]);
  });

  it("returns an empty roster for a level with no waves", () => {
    expect(buildLevelRoster({ ...createCampaignLevel(1), enemyWaves: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- roster`
Expected: FAIL — cannot resolve `./roster`.

- [ ] **Step 3: Create `src/game/roster.ts`**

```ts
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
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- roster`
Expected: PASS, 4 tests.

- [ ] **Step 5: Render the roster in `src/App.tsx`**

Add the import:

```tsx
import { buildLevelRoster } from "./game/roster";
```

Add a memo next to the other `useMemo` calls that derive from `currentLevel`:

```tsx
  const levelRoster = useMemo(() => buildLevelRoster(currentLevel), [currentLevel]);
```

Then, directly after the existing `level-notes` div (`src/App.tsx:264-268`), add:

```tsx
          {levelRoster.length > 0 ? (
            <div className="enemy-roster" aria-label="Enemy roster">
              <p className="eyebrow">What you are facing</p>
              {levelRoster.map((entry) => (
                <div className="roster-entry" key={entry.enemyId}>
                  <div className="roster-head">
                    <strong>{entry.name}</strong>
                    <span>×{entry.count}</span>
                  </div>
                  {entry.traits.length > 0 ? (
                    <ul>
                      {entry.traits.map((trait) => (
                        <li key={trait.trait}>
                          <span>{trait.label}</span>
                          {trait.summary}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
```

- [ ] **Step 6: Style it in `src/styles.css`**

Add after the `.level-notes span` block, matching the existing panel idiom (translucent white fills, 800-weight labels, 11–12px type):

```css
.enemy-roster {
  display: grid;
  gap: 9px;
  margin: 0 0 14px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
}

.roster-entry {
  display: grid;
  gap: 5px;
}

.roster-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #eef2f8;
  font-size: 12px;
  font-weight: 800;
}

.roster-head span {
  color: #9ca8ba;
}

.enemy-roster ul {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.enemy-roster li {
  color: #c9d2df;
  font-size: 11px;
  line-height: 1.45;
}

.enemy-roster li span {
  margin-right: 6px;
  color: #eef2f8;
  font-weight: 800;
}
```

- [ ] **Step 7: Typecheck, test and commit**

Run: `npm run build && npm test`
Expected: both pass.

```bash
git add src/game/roster.ts src/game/roster.test.ts src/App.tsx src/styles.css
git commit -m "Show the level enemy roster with trait rules before combat"
```

---

### Task 9: Browser verification

Confirms the feature works in the real app, not only in tests.

**Files:**
- No source changes expected. If verification finds a defect, fix it here with a test that covers it.

**Interfaces:**
- Consumes: the whole feature.
- Produces: screenshots and a verification note.

- [ ] **Step 1: Read the project verify skill**

Read `.claude/skills/verify/SKILL.md` and follow it — it documents how to build, launch and drive this app in a browser, including seeding `localStorage` key `tbd-defense:campaign` to reach a specific campaign state.

- [ ] **Step 2: Verify an armored level**

Seed the campaign to reach level 4 (Grave March). Confirm:
- The roster panel lists Grave Brute with its count and the Armored rule text.
- The level notes no longer claim "Low single-target builds are slower".
- Running the fight produces at least one "blunted the hit with its plating" line in the combat log.

Screenshot the pre-combat panel and the post-combat log.

- [ ] **Step 3: Verify a swarm level**

Seed the campaign to reach level 6 (Rot Tide). Confirm the roster shows Rot Imp with the Swarm rule, and that "drew strength from its pack" appears in the log.

Screenshot both.

- [ ] **Step 4: Verify no console errors**

Check the browser console across both fights. Expected: no errors or React warnings.

- [ ] **Step 5: Run the full suite one last time**

Run: `npm run build && npm test`
Expected: both pass, everything green.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "Fix issues found during browser verification"
```

Skip this step if verification found nothing.

---

## Wrap-Up

After Task 9, use `superpowers:finishing-a-development-branch`. The expected choice for this project is **merge to `main` locally with `--no-ff`, then delete the branch**.

Then update `C:\Users\markl\.claude\projects\C--Code-HeroDefense\memory\build-depth-roadmap.md`: mark 2b done with the merge commit and the modules it added (`traits.ts`, `roster.ts`), and note that 2c (per-class passive mechanics) is next.
