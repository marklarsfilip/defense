# Build-Loop Depth — Design

Date: 2026-07-27
Status: Approved for planning

## Problem

The equipment & economy loop now works, but build decisions are shallow:

- Gold's only sink is the shop (buy/reroll stock). Once you have gear, gold piles up.
- Progression is entirely gear-RNG driven — no permanent character-building choices.
- Set items drop and can be equipped, but wearing a matching set grants nothing, so
  there is no reason to chase one.

This deepens the single-player build loop (the priority `AGENTS.md` names before any
competitive layer) by adding three systems: a gold-sink gear upgrade/reroll, hero
stat allocation, and set bonuses.

## Goals

- Give gold a bottomless, engaging sink and gear a way to improve without new drops.
- Add permanent, respec-able character-building decisions independent of gear RNG.
- Make chasing a set worthwhile.
- Keep everything on the existing additive, deterministic, unit-tested stat pipeline.

## Non-goals (YAGNI)

- Affix-type locking on reroll (reroll re-rolls all modifiers, not a chosen one).
- Per-stat allocation caps beyond the shared point budget.
- Set-bonus *special effects* (bonuses are stat-only; special-effect sets belong to
  the later "combat depth" work item).

## Shared foundation: the effective-hero pipeline grows

Current:

```
applyEquipmentToHero(applyTalentsToHero(class, talentIds), equipment)
```

New order (all layers additive through the shared `applyStatModifiers`, same clamps):

```
base
  → talents            (applyTalentsToHero)
  → stat allocation    (applyAllocationToHero)      [new]
  → equipment mods     (applyEquipmentToHero)
  → set bonuses        (folded into applyEquipmentToHero)  [new]
```

`simulateCombat` consumes the final `effectiveHero` unchanged, so all three systems
affect combat automatically. Order is irrelevant to the summed values (all additive);
it is fixed for determinism.

## System 1: Gear upgrade + reroll (priority gold sink)

Two pure operations on a `LootItem`, each with a gold cost. Both operate on items
whether equipped or in inventory (located by id across equipment slots + inventory).

### Data model

`LootItem` gains two optional counters (default 0; migrated/validated on load):

- `upgradeLevel: number` — how many times upgraded (0..`MAX_UPGRADE_LEVEL`).
- `rerolls: number` — how many times rerolled (used only as a deterministic seed salt).

### New module `src/game/upgrade.ts`

- `MAX_UPGRADE_LEVEL = 5`.
- `canUpgrade(item): boolean` — `(item.upgradeLevel ?? 0) < MAX_UPGRADE_LEVEL`.
- `upgradeItem(item): LootItem` — returns a new item with `upgradeLevel + 1` and every
  modifier's `amount` scaled by `UPGRADE_FACTOR` (~1.15), with labels rebuilt to show
  the new value. No-op guard: if already at cap, return the item unchanged.
- `rerollItemModifiers(item): LootItem` — returns a new item with freshly rolled
  modifiers (same count/rarity power/item level as the item), `rerolls + 1`. Reuses the
  loot modifier roller with a seed derived from `(item.id, rerolls)` so it is
  deterministic and testable. `upgradeLevel` is reset to 0 on reroll (fresh mods start
  un-upgraded) — documented so the UI/cost reflect it.
- `upgradeCost(item): number` — escalates with `upgradeLevel` and scales with
  rarity × item level.
- `rerollCost(item): number` — scales with rarity × item level, **flat per attempt**
  (does not escalate with `rerolls`), keeping it a repeatable bottomless sink.

To rebuild modifier labels after scaling, `loot.ts` exposes a small helper
(`formatModifierValue(stat, amount)` or equivalent) so `upgrade.ts` composes
`"<affixName>: <formatted value>"` by preserving the affix-name prefix (text before
`": "`) of the existing label. `rerollItemModifiers` reuses the existing modifier
roller (exposed from `loot.ts`) rather than duplicating roll logic.

## System 2: Stat allocation on level-up

### Allocatable stats

Five curated stats: `health`, `damage`, `armor`, `abilityPower`, `critChance`.

### New module `src/game/allocation.ts`

- `ALLOCATABLE_STATS` — the five keys above.
- `STAT_POINT_INCREMENTS` — gain per allocated point: `health +12`, `damage +2`,
  `armor +1`, `abilityPower +2`, `critChance +0.01`.
- `getStatPointBudget(heroLevel): number` — total points available (e.g.
  `2 * (heroLevel - 1)`).
- `getAllocatedPointCount(allocation): number` — sum of allocated points.
- `applyAllocationToHero(heroClass, allocation): HeroClass` — folds
  `points * increment` per stat into the hero via `applyStatModifiers`.

### State

`CampaignState` gains `statAllocation: Record<AllocatableStat, number>` (each 0 by
default). **Free respec:** points can be added/removed at will.

### Reducers (in `progression.ts`)

- `allocateStat(state, stat)` — +1 to that stat if total allocated `< budget`;
  else no-op (same ref).
- `deallocateStat(state, stat)` — -1 if that stat `> 0`; else no-op.
- `resetAllocation(state)` — all five back to 0.

Migration: `restoreCampaign` restores/validates `statAllocation` (each entry a
non-negative integer, unknown keys dropped), and re-clamps total to the current
budget (so a reduced budget after data edits can't leave an over-allocation).

## System 3: Set bonuses

### Content

`content.ts` gains a set-bonus table keyed by `setId`, each with a 2-piece and a
3-piece bonus (`Partial<Stats>`), themed to the set. All five existing sets get
entries.

### Application

`applyEquipmentToHero` (after folding item modifiers) counts equipped pieces per
`setId`, and for each set with ≥2 pieces folds in the highest earned tier's bonus
(2-piece bonus at 2 pieces; 3-piece bonus at 3 pieces) via `applyStatModifiers`.

### Helper for UI

`equipment.ts` exposes `getActiveSetBonuses(equipment)` returning, per set with ≥2
equipped pieces, `{ setId, setName, pieces, tier }` so the equipment panel can show
the active set and tier.

## UI (`App.tsx` + `styles.css`)

- **Item cards** (inventory + equipped): add **Upgrade (N gold)** and
  **Reroll (N gold)** buttons, disabled when unaffordable; Upgrade also disabled at
  cap. Show `upgradeLevel` (e.g. "+3") on upgraded items.
- **Stat-allocation panel:** the five stats with current allocated points, a +/- per
  stat, "points remaining" (`budget - allocated`), and a **Reset** button. The
  existing "Current build" readout reflects allocation automatically.
- **Set-bonus indicator:** in the equipment panel, list active set bonuses
  (set name, tier, pieces) from `getActiveSetBonuses`.

## Testing (Vitest)

- `upgrade.ts`: `upgradeItem` scales amounts and bumps `upgradeLevel`, cap no-op;
  `rerollItemModifiers` determinism (same item+rerolls → same mods), varies across
  rerolls, resets `upgradeLevel`; `upgradeCost` escalates with level; `rerollCost`
  is flat across rerolls and monotonic in rarity/item level.
- `allocation.ts`: budget curve, increment application, sum counting.
- `equipment.ts`: set-bonus counting (0/1 piece → none, 2 → 2pc, 3 → 3pc);
  `getActiveSetBonuses` shape; `applyEquipmentToHero` still correct without sets.
- `progression.ts`: allocate/deallocate/reset reducers (budget cap, floor at 0,
  no-op identity), upgrade/reroll reducers locating items in both equipment and
  inventory, and migration of `statAllocation` + the new `LootItem` counters.

## Impact on Milestone plan

Rounds out Milestone 3 (build variety) and strengthens the single-player loop's depth
ahead of any Milestone 4 competitive layer.

## Implementation order (for the plan)

Gear upgrade/reroll first (highest synergy with the just-built economy), then stat
allocation, then set bonuses.
