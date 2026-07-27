# Build-Loop Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the build loop with a gold-sink gear upgrade/reroll, respec-able hero stat allocation, and set bonuses.

**Architecture:** Three systems, all folded into the existing additive effective-hero pipeline via the shared `applyStatModifiers`. New pure modules `upgrade.ts` and `allocation.ts`; set bonuses extend `equipment.ts` + `content.ts`; `progression.ts` gains reducers + migration; `App.tsx` gets UI. Order in the pipeline: base → talents → allocation → equipment mods → set bonuses.

**Tech Stack:** TypeScript, Vite, React 19, React Three Fiber, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-build-loop-depth-design.md`

**Conventions:** Colocated tests (`foo.ts` → `foo.test.ts`). One file: `npx vitest run <path>`. All: `npm test`. Typecheck+build: `npm run build`. Percent-style stats (`attackSpeed`, `critChance`, `critDamage`, `cooldownReduction`) are fractions stacked additively; `critChance` clamps to `[0,0.95]`, `cooldownReduction` to `[0,0.75]` (handled inside `applyStatModifiers`).

---

## File Structure

- **Modify** `src/game/types.ts` — add `LootItem.upgradeLevel?`/`rerolls?`, `AllocatableStat`, `SetBonus`.
- **Modify** `src/game/loot.ts` — export `rollItemModifiers`, `formatModifierValue`, `quantizeModifierAmount` (extracted, behavior-preserving).
- **Create** `src/game/upgrade.ts` — upgrade/reroll operations + cost functions.
- **Create** `src/game/allocation.ts` — allocatable stats, budget, `applyAllocationToHero`.
- **Modify** `src/game/content.ts` — `setBonuses` table for the 5 sets.
- **Modify** `src/game/equipment.ts` — `getActiveSetBonuses` + fold set bonuses into `applyEquipmentToHero`.
- **Modify** `src/game/progression.ts` — `statAllocation` state + migration; reducers `allocateStat`/`deallocateStat`/`resetAllocation`/`upgradeItemById`/`rerollItemById`.
- **Modify** `src/App.tsx` + `src/styles.css` — pipeline wiring + allocation panel + item upgrade/reroll buttons + set-bonus indicator.

---

## Task 1: Loot helpers for reroll + upgrade relabeling

**Files:** Modify `src/game/loot.ts`, `src/game/loot.test.ts`, `src/game/types.ts`.

- [ ] **Step 1: Add optional counters to `LootItem`.** In `src/game/types.ts`, add to the `LootItem` interface (after `modifiers: LootModifier[];`):

```ts
  upgradeLevel?: number;
  rerolls?: number;
```

- [ ] **Step 2: Write the failing test.** Add to `src/game/loot.test.ts`:

```ts
import { rollItemModifiers, formatModifierValue, quantizeModifierAmount } from "./loot";

describe("rollItemModifiers", () => {
  it("is deterministic for the same seed and yields the rarity's modifier count", () => {
    const a = rollItemModifiers("rare", 5, 4242);
    const b = rollItemModifiers("rare", 5, 4242);
    expect(a).toEqual(b);
    expect(a).toHaveLength(2); // rare => modifierCount 2
  });

  it("varies with the seed", () => {
    const a = rollItemModifiers("rare", 5, 1);
    const b = rollItemModifiers("rare", 5, 2);
    expect(a).not.toEqual(b);
  });
});

describe("quantizeModifierAmount", () => {
  it("floors flat stats at 1 integer", () => {
    expect(quantizeModifierAmount("damage", 0.2)).toBe(1);
    expect(quantizeModifierAmount("damage", 7.6)).toBe(8);
  });
  it("keeps percent stats as rounded fractions", () => {
    expect(quantizeModifierAmount("critChance", 0.12345)).toBe(0.123);
  });
});

describe("formatModifierValue", () => {
  it("formats flat and percent stats", () => {
    expect(formatModifierValue("damage", 8)).toContain("8");
    expect(formatModifierValue("critChance", 0.15)).toContain("%");
  });
});
```

- [ ] **Step 3: Run test to verify it fails.** `npx vitest run src/game/loot.test.ts` → FAIL (exports missing).

- [ ] **Step 4: Implement.** In `src/game/loot.ts`:

First, extract the quantization from `rollModifierAmount`. Replace the body of `rollModifierAmount` (the `if (PERCENT_STATS...) ... return Math.max(1, ...)` tail) so it delegates:

```ts
function rollModifierAmount(
  affix: LootAffixDefinition,
  itemLevel: number,
  powerMultiplier: number,
  random: () => number,
): number {
  const rawValue = (affix.minPerLevel + (affix.maxPerLevel - affix.minPerLevel) * random()) * itemLevel * powerMultiplier;
  return quantizeModifierAmount(affix.stat, rawValue);
}

export function quantizeModifierAmount(stat: StatKey, rawValue: number): number {
  if (PERCENT_STATS.has(stat)) {
    return Math.round(rawValue * 1000) / 1000;
  }
  return Math.max(1, Math.round(rawValue));
}
```

Then add these two exports (near `generateLootItem`):

```ts
export function rollItemModifiers(rarity: LootRarity, itemLevel: number, seed: number): LootModifier[] {
  const random = createSeededRandom(seed);
  const definition = lootRarities[rarity];
  return rollModifiers(itemLevel, definition.powerMultiplier, definition.modifierCount, random);
}

export function formatModifierValue(stat: StatKey, amount: number): string {
  return formatModifier(stat, amount);
}
```

(`StatKey`, `LootModifier`, `LootRarity`, `createSeededRandom`, `lootRarities`, `PERCENT_STATS`, `formatModifier`, `rollModifiers` all already exist in `loot.ts`. Do not duplicate imports.)

- [ ] **Step 5: Run tests.** `npx vitest run src/game/loot.test.ts` → PASS (existing + new). Then `npm test` to confirm no regression in loot/chest determinism.

- [ ] **Step 6: Commit.**

```bash
git add src/game/loot.ts src/game/loot.test.ts src/game/types.ts
git commit -m "Expose loot modifier roller and formatter for upgrade/reroll"
```

---

## Task 2: Upgrade + reroll module

**Files:** Create `src/game/upgrade.ts`, `src/game/upgrade.test.ts`.

- [ ] **Step 1: Write the failing test.** Create `src/game/upgrade.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_UPGRADE_LEVEL,
  canUpgrade,
  rerollCost,
  rerollItemModifiers,
  upgradeCost,
  upgradeItem,
} from "./upgrade";
import type { LootItem } from "./types";

function item(overrides: Partial<LootItem> = {}): LootItem {
  return {
    id: "itm-1",
    name: "Test Blade",
    rarity: "rare",
    slot: "weapon",
    itemLevel: 5,
    modifiers: [
      { stat: "damage", label: "Brutal: +10 damage", amount: 10 },
      { stat: "critChance", label: "Precise: +5% critical chance", amount: 0.05 },
    ],
    ...overrides,
  };
}

describe("upgradeItem", () => {
  it("scales modifier amounts up and bumps upgradeLevel", () => {
    const up = upgradeItem(item());
    expect(up.upgradeLevel).toBe(1);
    expect(up.modifiers[0].amount).toBeGreaterThan(10);
    expect(up.modifiers[0].label).toContain("Brutal");
  });

  it("does not upgrade past the cap", () => {
    const maxed = item({ upgradeLevel: MAX_UPGRADE_LEVEL });
    expect(canUpgrade(maxed)).toBe(false);
    expect(upgradeItem(maxed)).toBe(maxed);
  });
});

describe("rerollItemModifiers", () => {
  it("is deterministic per (id, rerolls) and increments rerolls", () => {
    const a = rerollItemModifiers(item());
    const b = rerollItemModifiers(item());
    expect(a.modifiers).toEqual(b.modifiers);
    expect(a.rerolls).toBe(1);
  });

  it("varies across successive rerolls and resets upgradeLevel", () => {
    const first = rerollItemModifiers(item({ upgradeLevel: 3 }));
    const second = rerollItemModifiers(first);
    expect(first.upgradeLevel).toBe(0);
    expect(second.modifiers).not.toEqual(first.modifiers);
  });
});

describe("costs", () => {
  it("upgradeCost escalates with upgradeLevel", () => {
    expect(upgradeCost(item({ upgradeLevel: 1 }))).toBeGreaterThan(upgradeCost(item({ upgradeLevel: 0 })));
  });
  it("rerollCost is flat across rerolls but scales with rarity", () => {
    expect(rerollCost(item({ rerolls: 5 }))).toBe(rerollCost(item({ rerolls: 0 })));
    expect(rerollCost(item({ rarity: "legendary" }))).toBeGreaterThan(rerollCost(item({ rarity: "common" })));
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** `npx vitest run src/game/upgrade.test.ts` → FAIL (cannot resolve `./upgrade`).

- [ ] **Step 3: Implement.** Create `src/game/upgrade.ts`:

```ts
import { formatModifierValue, quantizeModifierAmount, rollItemModifiers } from "./loot";
import type { LootItem, LootModifier, LootRarity } from "./types";

export const MAX_UPGRADE_LEVEL = 5;
const UPGRADE_FACTOR = 1.15;

const UPGRADE_BASE: Record<LootRarity, number> = {
  common: 15,
  uncommon: 25,
  rare: 45,
  epic: 75,
  legendary: 130,
  set: 100,
};

const REROLL_BASE: Record<LootRarity, number> = {
  common: 10,
  uncommon: 18,
  rare: 32,
  epic: 55,
  legendary: 95,
  set: 75,
};

export function canUpgrade(item: LootItem): boolean {
  return (item.upgradeLevel ?? 0) < MAX_UPGRADE_LEVEL;
}

export function upgradeItem(item: LootItem): LootItem {
  if (!canUpgrade(item)) {
    return item;
  }

  return {
    ...item,
    upgradeLevel: (item.upgradeLevel ?? 0) + 1,
    modifiers: item.modifiers.map(scaleModifier),
  };
}

export function rerollItemModifiers(item: LootItem): LootItem {
  const rerolls = (item.rerolls ?? 0) + 1;
  const seed = buildRerollSeed(item.id, rerolls);

  return {
    ...item,
    modifiers: rollItemModifiers(item.rarity, item.itemLevel, seed),
    rerolls,
    upgradeLevel: 0,
  };
}

export function upgradeCost(item: LootItem): number {
  const level = item.upgradeLevel ?? 0;
  return Math.max(1, Math.round(UPGRADE_BASE[item.rarity] * item.itemLevel * (level + 1)));
}

export function rerollCost(item: LootItem): number {
  return Math.max(1, Math.round(REROLL_BASE[item.rarity] * item.itemLevel));
}

function scaleModifier(modifier: LootModifier): LootModifier {
  const amount = quantizeModifierAmount(modifier.stat, modifier.amount * UPGRADE_FACTOR);
  const prefix = modifier.label.includes(":") ? modifier.label.slice(0, modifier.label.indexOf(":")) : modifier.stat;
  return {
    stat: modifier.stat,
    amount,
    label: `${prefix}: ${formatModifierValue(modifier.stat, amount)}`,
  };
}

function buildRerollSeed(id: string, rerolls: number): number {
  let hash = 2166136261;
  for (const character of id) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  hash = Math.imul(hash ^ (rerolls + 1), 16777619);
  return hash >>> 0;
}
```

- [ ] **Step 4: Run test to verify it passes.** `npx vitest run src/game/upgrade.test.ts` → PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit.**

```bash
git add src/game/upgrade.ts src/game/upgrade.test.ts
git commit -m "Add gear upgrade and reroll module with costs"
```

---

## Task 3: Stat allocation module

**Files:** Create `src/game/allocation.ts`, `src/game/allocation.test.ts`; modify `src/game/types.ts`.

- [ ] **Step 1: Add the `AllocatableStat` type.** In `src/game/types.ts`, add (after `StatKey`):

```ts
export type AllocatableStat = "health" | "damage" | "armor" | "abilityPower" | "critChance";
```

- [ ] **Step 2: Write the failing test.** Create `src/game/allocation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ALLOCATABLE_STATS,
  EMPTY_ALLOCATION,
  applyAllocationToHero,
  getAllocatedPointCount,
  getStatPointBudget,
} from "./allocation";
import { heroClasses } from "./content";

const berserker = heroClasses[0];

describe("stat point budget", () => {
  it("is 0 at level 1 and grows with level", () => {
    expect(getStatPointBudget(1)).toBe(0);
    expect(getStatPointBudget(5)).toBeGreaterThan(getStatPointBudget(2));
  });
});

describe("getAllocatedPointCount", () => {
  it("sums allocated points", () => {
    expect(getAllocatedPointCount({ ...EMPTY_ALLOCATION, damage: 2, health: 3 })).toBe(5);
  });
});

describe("applyAllocationToHero", () => {
  it("adds increments for allocated stats", () => {
    const hero = applyAllocationToHero(berserker, { ...EMPTY_ALLOCATION, damage: 3 });
    expect(hero.stats.damage).toBe(berserker.stats.damage + 6); // damage +2/point
  });
  it("is a no-op with an empty allocation", () => {
    const hero = applyAllocationToHero(berserker, EMPTY_ALLOCATION);
    expect(hero.stats.damage).toBe(berserker.stats.damage);
  });
  it("covers exactly the five allocatable stats", () => {
    expect(ALLOCATABLE_STATS.slice().sort()).toEqual(["abilityPower", "armor", "critChance", "damage", "health"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails.** `npx vitest run src/game/allocation.test.ts` → FAIL.

- [ ] **Step 4: Implement.** Create `src/game/allocation.ts`:

```ts
import { applyStatModifiers } from "./stats";
import type { AllocatableStat, HeroClass, Stats } from "./types";

export const ALLOCATABLE_STATS: AllocatableStat[] = ["health", "damage", "armor", "abilityPower", "critChance"];

export const STAT_POINT_INCREMENTS: Record<AllocatableStat, number> = {
  health: 12,
  damage: 2,
  armor: 1,
  abilityPower: 2,
  critChance: 0.01,
};

export type StatAllocation = Record<AllocatableStat, number>;

export const EMPTY_ALLOCATION: StatAllocation = {
  health: 0,
  damage: 0,
  armor: 0,
  abilityPower: 0,
  critChance: 0,
};

export function getStatPointBudget(heroLevel: number): number {
  return Math.max(0, (heroLevel - 1) * 2);
}

export function getAllocatedPointCount(allocation: StatAllocation): number {
  return ALLOCATABLE_STATS.reduce((total, stat) => total + (allocation[stat] ?? 0), 0);
}

export function applyAllocationToHero(heroClass: HeroClass, allocation: StatAllocation): HeroClass {
  const modifiers: Partial<Stats> = {};

  for (const stat of ALLOCATABLE_STATS) {
    const points = allocation[stat] ?? 0;
    if (points > 0) {
      modifiers[stat] = points * STAT_POINT_INCREMENTS[stat];
    }
  }

  return { ...heroClass, stats: applyStatModifiers(heroClass.stats, modifiers) };
}
```

- [ ] **Step 5: Run test to verify it passes.** `npx vitest run src/game/allocation.test.ts` → PASS. Then `npx tsc --noEmit`.

- [ ] **Step 6: Commit.**

```bash
git add src/game/allocation.ts src/game/allocation.test.ts src/game/types.ts
git commit -m "Add hero stat allocation module"
```

---

## Task 4: Set bonuses

**Files:** Modify `src/game/types.ts`, `src/game/content.ts`, `src/game/equipment.ts`, `src/game/equipment.test.ts`.

- [ ] **Step 1: Add the `SetBonus` type.** In `src/game/types.ts` (after `LootSetDefinition`):

```ts
export interface SetBonus {
  two: Partial<Stats>;
  three: Partial<Stats>;
}
```

- [ ] **Step 2: Add the content table.** In `src/game/content.ts`, add (after `lootSets`), importing `SetBonus` in the existing type import:

```ts
export const setBonuses: Record<string, SetBonus> = {
  "ninefold-road": { two: { armor: 4, health: 30 }, three: { armor: 8, health: 70, damage: 6 } },
  "black-ice-vigil": { two: { critChance: 0.04, critDamage: 0.1 }, three: { critChance: 0.08, critDamage: 0.25, damage: 5 } },
  "pale-contract": { two: { damage: 6 }, three: { damage: 14, attackSpeed: 0.08 } },
  "last-road": { two: { attackSpeed: 0.06 }, three: { attackSpeed: 0.14, damage: 6 } },
  "far-star": { two: { abilityPower: 10 }, three: { abilityPower: 24, cooldownReduction: 0.06 } },
};
```

- [ ] **Step 3: Write the failing test.** Add to `src/game/equipment.test.ts`:

```ts
import { getActiveSetBonuses } from "./equipment";

function setPiece(id: string, slot: LootItem["slot"], setId: string): LootItem {
  return { id, name: `${setId} ${slot}`, rarity: "set", slot, itemLevel: 5, modifiers: [], setId, setName: "Ninefold Road Relics" };
}

describe("set bonuses", () => {
  it("no bonus with fewer than 2 set pieces", () => {
    const eq = { ...EMPTY_EQUIPMENT, weapon: setPiece("w", "weapon", "ninefold-road") };
    expect(getActiveSetBonuses(eq)).toHaveLength(0);
  });

  it("2-piece bonus at 2 matching pieces, 3-piece at 3", () => {
    const two = { ...EMPTY_EQUIPMENT, weapon: setPiece("w", "weapon", "ninefold-road"), armor: setPiece("a", "armor", "ninefold-road") };
    const bonuses2 = getActiveSetBonuses(two);
    expect(bonuses2).toHaveLength(1);
    expect(bonuses2[0].tier).toBe(2);

    const three = { ...two, trinket: setPiece("t", "trinket", "ninefold-road") };
    expect(getActiveSetBonuses(three)[0].tier).toBe(3);
  });

  it("folds the set bonus into hero stats via applyEquipmentToHero", () => {
    const two = { ...EMPTY_EQUIPMENT, weapon: setPiece("w", "weapon", "ninefold-road"), armor: setPiece("a", "armor", "ninefold-road") };
    const hero = applyEquipmentToHero(berserker, two);
    // ninefold-road 2pc = { armor: 4, health: 30 }; set pieces above have no item modifiers
    expect(hero.stats.armor).toBe(berserker.stats.armor + 4);
    expect(hero.stats.health).toBe(berserker.stats.health + 30);
  });
});
```

(`EMPTY_EQUIPMENT`, `applyEquipmentToHero`, `berserker`, and `LootItem` are already imported at the top of `equipment.test.ts` from Task 3 of the previous feature — verify and reuse; add `getActiveSetBonuses` to the existing `./equipment` import.)

- [ ] **Step 4: Run test to verify it fails.** `npx vitest run src/game/equipment.test.ts` → FAIL.

- [ ] **Step 5: Implement.** In `src/game/equipment.ts`:

Add `setBonuses` to the existing `./content` import and `Stats` to the `./types` import. Add the interface + function:

```ts
export interface ActiveSetBonus {
  setId: string;
  setName: string;
  pieces: number;
  tier: 2 | 3;
  modifiers: Partial<Stats>;
}

export function getActiveSetBonuses(equipment: Equipment): ActiveSetBonus[] {
  const counts = new Map<string, { setName: string; pieces: number }>();

  for (const item of [equipment.weapon, equipment.armor, equipment.trinket]) {
    if (!item?.setId) {
      continue;
    }
    const current = counts.get(item.setId) ?? { setName: item.setName ?? item.setId, pieces: 0 };
    current.pieces += 1;
    counts.set(item.setId, current);
  }

  const active: ActiveSetBonus[] = [];
  for (const [setId, { setName, pieces }] of counts) {
    const definition = setBonuses[setId];
    if (!definition || pieces < 2) {
      continue;
    }
    const tier: 2 | 3 = pieces >= 3 ? 3 : 2;
    active.push({ setId, setName, pieces, tier, modifiers: tier === 3 ? definition.three : definition.two });
  }

  return active;
}
```

Then fold set bonuses into `applyEquipmentToHero`. Change its body so that after reducing the item modifiers into `stats`, it also applies each active set bonus:

```ts
export function applyEquipmentToHero(heroClass: HeroClass, equipment: Equipment): HeroClass {
  const equipped = [equipment.weapon, equipment.armor, equipment.trinket].filter(
    (item): item is LootItem => item !== null,
  );

  // Applied one modifier at a time to preserve additivity through applyStatModifiers.
  // Correct as long as modifiers are non-negative: incremental clamping then equals
  // clamping the summed total. Revisit if penalty/negative affixes are ever added.
  let stats = equipped.reduce(
    (current, item) =>
      item.modifiers.reduce(
        (accumulated, modifier) => applyStatModifiers(accumulated, { [modifier.stat]: modifier.amount }),
        current,
      ),
    heroClass.stats,
  );

  for (const bonus of getActiveSetBonuses(equipment)) {
    stats = applyStatModifiers(stats, bonus.modifiers);
  }

  return { ...heroClass, stats };
}
```

- [ ] **Step 6: Run test to verify it passes.** `npx vitest run src/game/equipment.test.ts` → PASS (existing equipment tests + new set-bonus tests). Then `npm test`.

- [ ] **Step 7: Commit.**

```bash
git add src/game/types.ts src/game/content.ts src/game/equipment.ts src/game/equipment.test.ts
git commit -m "Add set bonuses folded into effective hero stats"
```

---

## Task 5: Campaign state — stat allocation + migration

**Files:** Modify `src/game/progression.ts`, `src/game/progression.test.ts`.

- [ ] **Step 1: Write the failing test.** Add to `src/game/progression.test.ts`:

```ts
describe("stat allocation migration", () => {
  it("initializes an empty allocation", () => {
    expect(createInitialCampaign().statAllocation).toEqual({ health: 0, damage: 0, armor: 0, abilityPower: 0, critChance: 0 });
  });

  it("restores and sanitizes allocation, dropping unknown keys and clamping to budget", () => {
    const restored = restoreCampaign({
      heroLevel: 3, // budget = (3-1)*2 = 4
      statAllocation: { damage: 3, health: 10, bogus: 5, armor: -2 },
    });
    // unknown 'bogus' dropped, negative floored to 0, total clamped to budget 4
    const a = restored.statAllocation;
    expect(a.armor).toBe(0);
    expect(Object.keys(a).sort()).toEqual(["abilityPower", "armor", "critChance", "damage", "health"]);
    expect(a.damage + a.health + a.armor + a.abilityPower + a.critChance).toBeLessThanOrEqual(4);
  });

  it("defaults allocation for an old save without the field", () => {
    expect(restoreCampaign({ gold: 5 }).statAllocation).toEqual({ health: 0, damage: 0, armor: 0, abilityPower: 0, critChance: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** `npx vitest run src/game/progression.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In `src/game/progression.ts`:

Add imports:

```ts
import { ALLOCATABLE_STATS, EMPTY_ALLOCATION, getAllocatedPointCount, getStatPointBudget, type StatAllocation } from "./allocation";
import type { AllocatableStat } from "./types";
```

Add to `CampaignState` (after `purchases: number;`):

```ts
  statAllocation: StatAllocation;
```

In `createInitialCampaign`, add to the returned object (after `purchases: 0,`):

```ts
    statAllocation: { ...EMPTY_ALLOCATION },
```

In `restoreCampaign`, add to the returned object:

```ts
    statAllocation: restoreAllocation(candidate.statAllocation, clampInteger(candidate.heroLevel, 1, MAX_HERO_LEVEL, initial.heroLevel)),
```

Add the private helper at the bottom:

```ts
function restoreAllocation(value: unknown, heroLevel: number): StatAllocation {
  const allocation: StatAllocation = { ...EMPTY_ALLOCATION };

  if (value && typeof value === "object") {
    const candidate = value as Partial<Record<AllocatableStat, unknown>>;
    for (const stat of ALLOCATABLE_STATS) {
      allocation[stat] = clampInteger(candidate[stat], 0, Number.MAX_SAFE_INTEGER, 0);
    }
  }

  // Clamp total down to the current budget, trimming from the end deterministically.
  const budget = getStatPointBudget(heroLevel);
  let overflow = getAllocatedPointCount(allocation) - budget;
  if (overflow > 0) {
    for (let i = ALLOCATABLE_STATS.length - 1; i >= 0 && overflow > 0; i -= 1) {
      const stat = ALLOCATABLE_STATS[i];
      const reduce = Math.min(allocation[stat], overflow);
      allocation[stat] -= reduce;
      overflow -= reduce;
    }
  }

  return allocation;
}
```

(`clampInteger`, `MAX_HERO_LEVEL` already exist in the file.)

- [ ] **Step 4: Harden `isLootItem` for the new counters.** The new `upgradeLevel`/`rerolls` feed arithmetic in `upgrade.ts`, so a corrupt persisted value (e.g. a string) would break `upgradeCost`/`upgradeItem`. In `isLootItem` (in `progression.ts`), add a guard that any present counter is a finite non-negative number. Add this to the boolean expression returned by `isLootItem` (both counters are optional, so `undefined` is valid):

```ts
    (candidate.upgradeLevel === undefined ||
      (typeof candidate.upgradeLevel === "number" && Number.isFinite(candidate.upgradeLevel) && candidate.upgradeLevel >= 0)) &&
    (candidate.rerolls === undefined ||
      (typeof candidate.rerolls === "number" && Number.isFinite(candidate.rerolls) && candidate.rerolls >= 0))
```

Add a test to `progression.test.ts`:

```ts
it("drops a persisted item whose upgradeLevel is not a number", () => {
  const restored = restoreCampaign({
    inventory: [{ id: "z", name: "Bad", rarity: "rare", slot: "weapon", itemLevel: 3, modifiers: [], upgradeLevel: "3" }],
  });
  expect(restored.inventory).toHaveLength(0);
});
```

- [ ] **Step 5: Run test to verify it passes.** `npx vitest run src/game/progression.test.ts` → PASS. Then `npx tsc --noEmit`.

- [ ] **Step 6: Commit.**

```bash
git add src/game/progression.ts src/game/progression.test.ts
git commit -m "Add stat allocation to campaign state with sanitizing migration"
```

---

## Task 6: Reducers — allocate/deallocate/reset + upgrade/reroll items

**Files:** Modify `src/game/progression.ts`, `src/game/progression.test.ts`.

- [ ] **Step 1: Write the failing tests.** Add to `src/game/progression.test.ts` (reuse the existing `makeItem` helper from the prior feature; ensure the new imports are merged into the existing `./progression` / `./types` imports):

```ts
import { allocateStat, deallocateStat, resetAllocation, upgradeItemById, rerollItemById } from "./progression";
import { getStatPointBudget } from "./allocation";
import { upgradeCost, rerollCost, MAX_UPGRADE_LEVEL } from "./upgrade";

describe("allocation reducers", () => {
  it("allocates up to budget then no-ops", () => {
    let s = { ...createInitialCampaign(), heroLevel: 2 }; // budget = 2
    s = allocateStat(s, "damage");
    s = allocateStat(s, "damage");
    expect(s.statAllocation.damage).toBe(2);
    const capped = allocateStat(s, "health");
    expect(capped).toBe(s); // budget exhausted -> no-op identity
  });

  it("deallocates with a floor of 0", () => {
    let s = { ...createInitialCampaign(), heroLevel: 4, statAllocation: { ...createInitialCampaign().statAllocation, armor: 1 } };
    s = deallocateStat(s, "armor");
    expect(s.statAllocation.armor).toBe(0);
    expect(deallocateStat(s, "armor")).toBe(s); // already 0 -> no-op
  });

  it("resets all allocation to 0", () => {
    const s = { ...createInitialCampaign(), heroLevel: 6, statAllocation: { health: 2, damage: 1, armor: 0, abilityPower: 0, critChance: 0 } };
    expect(resetAllocation(s).statAllocation).toEqual({ health: 0, damage: 0, armor: 0, abilityPower: 0, critChance: 0 });
  });
});

describe("upgrade / reroll reducers", () => {
  it("upgrades an equipped item, deducting gold and bumping upgradeLevel", () => {
    const weapon = makeItem("w1", 10);
    const base = { ...createInitialCampaign(), gold: 100000, equipment: { weapon, armor: null, trinket: null } };
    const cost = upgradeCost(weapon);
    const next = upgradeItemById(base, "w1");
    expect(next.gold).toBe(100000 - cost);
    expect(next.equipment.weapon?.upgradeLevel).toBe(1);
  });

  it("rerolls an inventory item, deducting gold and incrementing rerolls", () => {
    const it = makeItem("inv1", 8);
    const base = { ...createInitialCampaign(), gold: 100000, inventory: [it] };
    const cost = rerollCost(it);
    const next = rerollItemById(base, "inv1");
    expect(next.gold).toBe(100000 - cost);
    expect(next.inventory[0].rerolls).toBe(1);
  });

  it("no-ops upgrade when unaffordable, item missing, or at cap", () => {
    const poor = { ...createInitialCampaign(), gold: 0, inventory: [makeItem("x", 5)] };
    expect(upgradeItemById(poor, "x")).toBe(poor);
    expect(upgradeItemById({ ...poor, gold: 100000 }, "missing")).toEqual({ ...poor, gold: 100000 });
    const maxed = { ...createInitialCampaign(), gold: 100000, inventory: [{ ...makeItem("m", 5), upgradeLevel: MAX_UPGRADE_LEVEL }] };
    expect(upgradeItemById(maxed, "m")).toBe(maxed);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** `npx vitest run src/game/progression.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In `src/game/progression.ts`:

Add imports:

```ts
import { canUpgrade, rerollCost, rerollItemModifiers, upgradeCost, upgradeItem } from "./upgrade";
```

Add the allocation reducers (after `learnCampaignTalent` or near the other reducers):

```ts
export function allocateStat(state: CampaignState, stat: AllocatableStat): CampaignState {
  if (getAllocatedPointCount(state.statAllocation) >= getStatPointBudget(state.heroLevel)) {
    return state;
  }
  return {
    ...state,
    statAllocation: { ...state.statAllocation, [stat]: (state.statAllocation[stat] ?? 0) + 1 },
  };
}

export function deallocateStat(state: CampaignState, stat: AllocatableStat): CampaignState {
  if ((state.statAllocation[stat] ?? 0) <= 0) {
    return state;
  }
  return {
    ...state,
    statAllocation: { ...state.statAllocation, [stat]: state.statAllocation[stat] - 1 },
  };
}

export function resetAllocation(state: CampaignState): CampaignState {
  return { ...state, statAllocation: { ...EMPTY_ALLOCATION } };
}
```

Add a private item-locator + the upgrade/reroll reducers:

```ts
type ItemLocation =
  | { source: "equipment"; slot: EquipmentSlot; item: LootItem }
  | { source: "inventory"; index: number; item: LootItem };

function locateItem(state: CampaignState, itemId: string): ItemLocation | null {
  for (const slot of ["weapon", "armor", "trinket"] as EquipmentSlot[]) {
    const item = state.equipment[slot];
    if (item && item.id === itemId) {
      return { source: "equipment", slot, item };
    }
  }
  const index = state.inventory.findIndex((entry) => entry.id === itemId);
  if (index >= 0) {
    return { source: "inventory", index, item: state.inventory[index] };
  }
  return null;
}

function placeItem(state: CampaignState, location: ItemLocation, next: LootItem): CampaignState {
  if (location.source === "equipment") {
    return { ...state, equipment: { ...state.equipment, [location.slot]: next } };
  }
  return { ...state, inventory: state.inventory.map((entry, i) => (i === location.index ? next : entry)) };
}

export function upgradeItemById(state: CampaignState, itemId: string): CampaignState {
  const location = locateItem(state, itemId);
  if (!location || !canUpgrade(location.item)) {
    return state;
  }
  const cost = upgradeCost(location.item);
  if (state.gold < cost) {
    return state;
  }
  return { ...placeItem(state, location, upgradeItem(location.item)), gold: state.gold - cost };
}

export function rerollItemById(state: CampaignState, itemId: string): CampaignState {
  const location = locateItem(state, itemId);
  if (!location) {
    return state;
  }
  const cost = rerollCost(location.item);
  if (state.gold < cost) {
    return state;
  }
  return { ...placeItem(state, location, rerollItemModifiers(location.item)), gold: state.gold - cost };
}
```

- [ ] **Step 4: Run test to verify it passes.** `npx vitest run src/game/progression.test.ts` → PASS. Then `npm test` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit.**

```bash
git add src/game/progression.ts src/game/progression.test.ts
git commit -m "Add allocation and item upgrade/reroll reducers"
```

---

## Task 7: Wire pipeline + stat-allocation UI

**Files:** Modify `src/App.tsx`, `src/styles.css`. Verified by build + browser (see Task 9).

- [ ] **Step 1: Wire allocation into the effective hero.** In `src/App.tsx`:

Add imports:

```ts
import { applyAllocationToHero, ALLOCATABLE_STATS, STAT_POINT_INCREMENTS, getStatPointBudget, getAllocatedPointCount } from "./game/allocation";
```

Extend the `./game/progression` import to also include `allocateStat`, `deallocateStat`, `resetAllocation`, `upgradeItemById`, `rerollItemById` (single merged import statement).

Replace the `effectiveHero` memo with the allocation layer inserted between talents and equipment:

```ts
  const effectiveHero = useMemo(
    () =>
      applyEquipmentToHero(
        applyAllocationToHero(applyTalentsToHero(selectedClass, campaign.selectedTalentIds), campaign.statAllocation),
        campaign.equipment,
      ),
    [selectedClass, campaign.selectedTalentIds, campaign.statAllocation, campaign.equipment],
  );
```

Add derived allocation values near the other memos:

```ts
  const statBudget = getStatPointBudget(campaign.heroLevel);
  const pointsSpent = getAllocatedPointCount(campaign.statAllocation);
  const pointsRemaining = statBudget - pointsSpent;
```

- [ ] **Step 2: Add handlers** (near the existing handlers):

```ts
  function addPoint(stat: (typeof ALLOCATABLE_STATS)[number]) {
    setCampaign((current) => allocateStat(current, stat));
  }
  function removePoint(stat: (typeof ALLOCATABLE_STATS)[number]) {
    setCampaign((current) => deallocateStat(current, stat));
  }
  function resetPoints() {
    setCampaign((current) => resetAllocation(current));
  }
```

- [ ] **Step 3: Add the stat-allocation panel.** Insert into the left `class-panel` aside, after the talent panel `</div>` and before the `Start` button (so it sits with the other build controls):

```tsx
          <div className="allocation-panel" aria-label="Stat points">
            <div className="progress-row">
              <span>Stat points</span>
              <strong>{pointsRemaining} left</strong>
            </div>
            <div className="allocation-list">
              {ALLOCATABLE_STATS.map((stat) => (
                <div className="allocation-row" key={stat}>
                  <span>{stat}</span>
                  <div className="allocation-controls">
                    <button disabled={campaign.statAllocation[stat] <= 0} onClick={() => removePoint(stat)} type="button">
                      −
                    </button>
                    <strong>{campaign.statAllocation[stat]}</strong>
                    <button disabled={pointsRemaining <= 0} onClick={() => addPoint(stat)} type="button">
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {pointsSpent > 0 ? (
              <button className="text-action" onClick={resetPoints} type="button">
                Reset points
              </button>
            ) : null}
          </div>
```

- [ ] **Step 4: Add styles.** Append to `src/styles.css`:

```css
.allocation-panel {
  border-top: 1px solid #2b303c;
  padding-top: 12px;
  margin-top: 4px;
}

.allocation-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0;
}

.allocation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-transform: capitalize;
  font-size: 13px;
}

.allocation-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.allocation-controls button {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid #2b303c;
  background: #1b1f27;
  color: #e5e7eb;
  cursor: pointer;
}

.allocation-controls button:disabled {
  opacity: 0.4;
  cursor: default;
}
```

- [ ] **Step 5: Build.** `npm run build` → green.

- [ ] **Step 6: Commit.**

```bash
git add src/App.tsx src/styles.css
git commit -m "Wire stat allocation into effective hero with allocation panel"
```

---

## Task 8: Item upgrade/reroll buttons + set-bonus indicator UI

**Files:** Modify `src/App.tsx`, `src/styles.css`. Verified by build + browser.

- [ ] **Step 1: Imports + handlers + derived data.** In `src/App.tsx`:

```ts
import { getActiveSetBonuses } from "./game/equipment";
import { upgradeCost, rerollCost, canUpgrade } from "./game/upgrade";
```

Add handlers:

```ts
  function upgradeItemAction(itemId: string) {
    setCampaign((current) => upgradeItemById(current, itemId));
  }
  function rerollItemAction(itemId: string) {
    setCampaign((current) => rerollItemById(current, itemId));
  }
```

Add derived set bonuses near the other memos:

```ts
  const activeSetBonuses = useMemo(() => getActiveSetBonuses(campaign.equipment), [campaign.equipment]);
```

- [ ] **Step 2: Add an upgrade/reroll control block usable for any item.** Define a small inline renderer helper inside the component (before `return`), so both the inventory cards and the equipped-slot items can show the buttons without duplicating markup:

```tsx
  function itemUpgradeControls(item: (typeof campaign.inventory)[number]) {
    return (
      <div className="item-actions">
        <button
          disabled={!canUpgrade(item) || campaign.gold < upgradeCost(item)}
          onClick={() => upgradeItemAction(item.id)}
          type="button"
        >
          {canUpgrade(item) ? `Upgrade (${upgradeCost(item)}g)` : "Max"}
        </button>
        <button disabled={campaign.gold < rerollCost(item)} onClick={() => rerollItemAction(item.id)} type="button">
          Reroll ({rerollCost(item)}g)
        </button>
      </div>
    );
  }
```

- [ ] **Step 3: Show upgrade level + controls on equipped items and inventory items.**

In the equipment-slot `.slot-item` block, after the `<ul>` of modifiers and before the Unequip button, add the upgrade badge and controls:

```tsx
                      {item.upgradeLevel ? <span className="upgrade-badge">+{item.upgradeLevel}</span> : null}
                      {itemUpgradeControls(item)}
```

In the inventory `.inventory-item` block, replace the existing `.inventory-actions` div contents to also include the upgrade controls, and add the badge to the heading. Specifically, after the modifiers `<ul>` add:

```tsx
                {item.upgradeLevel ? <span className="upgrade-badge">+{item.upgradeLevel}</span> : null}
                {itemUpgradeControls(item)}
```

(Keep the existing Equip/Salvage buttons in `.inventory-actions`.)

- [ ] **Step 4: Add the set-bonus indicator** to the Equipment panel, after the `.equip-slots` div:

```tsx
          {activeSetBonuses.length > 0 ? (
            <div className="set-bonuses" aria-label="Active set bonuses">
              <p className="eyebrow">Set bonuses</p>
              {activeSetBonuses.map((bonus) => (
                <div className="set-bonus-row" key={bonus.setId}>
                  <strong>{bonus.setName}</strong>
                  <span>
                    {bonus.pieces}-piece ({bonus.tier}pc bonus):{" "}
                    {Object.entries(bonus.modifiers)
                      .map(([stat, value]) => `+${value} ${stat}`)
                      .join(", ")}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
```

- [ ] **Step 5: Add styles.** Append to `src/styles.css`:

```css
.item-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.item-actions button {
  flex: 1;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #2b303c;
  background: #1b1f27;
  color: #e5e7eb;
  font-size: 12px;
  cursor: pointer;
}

.item-actions button:disabled {
  opacity: 0.4;
  cursor: default;
}

.upgrade-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: #f59e0b;
  margin-right: 6px;
}

.set-bonuses {
  border-top: 1px solid #2b303c;
  margin-top: 12px;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.set-bonus-row {
  display: flex;
  flex-direction: column;
  font-size: 12px;
}

.set-bonus-row strong {
  color: #2dd4bf;
}
```

- [ ] **Step 6: Build.** `npm run build` → green.

- [ ] **Step 7: Commit.**

```bash
git add src/App.tsx src/styles.css
git commit -m "Add item upgrade/reroll buttons and set-bonus indicator UI"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full suite.** `npm test` → all pass.
- [ ] **Step 2: Build.** `npm run build` → green.
- [ ] **Step 3: Browser end-to-end** (use the project `verify` skill's recipe — `.claude/skills/verify/SKILL.md`). From a fresh save (Reset local progress):
  - Win level 1 a few times to bank gold + gear.
  - Allocate stat points (+ Damage) → the "Current build" Damage readout increases; Reset zeroes it.
  - Upgrade an equipped/inventory item → gold drops by the shown cost, the item's modifier values increase, and a "+N" badge appears; repeat until "Max" at +5.
  - Reroll an item → gold drops, modifiers change (and any upgrade badge clears).
  - Equip 2 then 3 pieces of the same set (buy/reroll from shop until a set drops, or via chests) → the set-bonus indicator appears with the 2pc then 3pc bonus, and the stat readout reflects it.
- [ ] **Step 4:** Confirm no console errors during the session.

---

## Self-Review Notes

- **Spec coverage:** pipeline growth (Task 7 §1 + Task 4 fold), gear upgrade/reroll module (Task 2) + reducers (Task 6), `LootItem` counters + loot helpers (Task 1), allocation module (Task 3) + state/migration (Task 5) + reducers (Task 6), set bonuses content+application+UI (Tasks 4, 8), UI (Tasks 7–8), testing (Tasks 1–6). YAGNI: no affix locking, no per-stat caps, no set special-effects.
- **Determinism preserved:** `quantizeModifierAmount` is a behavior-preserving extraction of existing rounding; `rollItemModifiers` reuses the existing roller; reroll seeds from `(id, rerolls)`.
- **Type/name consistency:** `AllocatableStat`, `StatAllocation`, `EMPTY_ALLOCATION`, `ALLOCATABLE_STATS`, `getStatPointBudget`, `getAllocatedPointCount`, `applyAllocationToHero` (allocation); `MAX_UPGRADE_LEVEL`, `canUpgrade`, `upgradeItem`, `rerollItemModifiers`, `upgradeCost`, `rerollCost` (upgrade); `getActiveSetBonuses`, `ActiveSetBonus`, `SetBonus`, `setBonuses` (set bonuses); reducers `allocateStat`/`deallocateStat`/`resetAllocation`/`upgradeItemById`/`rerollItemById` — names match between definition (progression.ts) and use (App.tsx).
- **Migration safety:** `restoreAllocation` drops unknown keys, floors negatives, clamps total to the current budget; new `LootItem` counters are optional and default via `?? 0`.
