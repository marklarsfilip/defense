# Equipment & Economy Loop — Design

Date: 2026-07-27
Status: Approved for planning

## Problem

Loot already generates fully-formed items with real stat modifiers, but the loop
is a dead end:

- Items land in `campaign.inventory` and are never equipped.
- `simulateCombat` only sees class stats + talents — `LootItem.modifiers` never
  affect combat, so gear is cosmetic text.
- Gold accumulates with no sink (no shop, no way to spend it).
- The `weapon` / `armor` / `trinket` slots exist in the type system but nothing
  uses them.

This blocks the "is the loop fun?" question that `AGENTS.md` says must be answered
before any competitive/multiplayer work, and completes the remaining gap in
Milestone 2 ("basic gear slots and stat modifiers").

## Goals

- Equipped gear changes combat outcomes.
- A full economy loop: drops → equip/salvage → gold → shop → better gear.
- Everything derives from pure, deterministic, testable modules, matching the
  existing codebase pattern (pure TS domain modules + Vitest + thin React shell).

## Non-goals (YAGNI)

- Set bonuses. Set items still work — as normal items carrying their own
  modifiers — but equipping multiple pieces grants no extra bonus yet.
- Class-restricted gear. Gear is global to the campaign and persists across class
  switches.
- Rich item-comparison tooltips beyond showing each item's modifiers.

## Core mechanic: gear affects combat

Current pipeline:

```
simulateCombat(applyTalentsToHero(class, talentIds), level)
```

New pipeline:

```
simulateCombat(
  applyEquipmentToHero(applyTalentsToHero(class, talentIds), equipment),
  level,
)
```

Equipment modifiers fold into stats using the **same additive rule and clamps**
that talents already use (`critChance` clamped to `[0, 0.95]`,
`cooldownReduction` clamped to `[0, 0.75]`). The existing private
`applyStatModifiers` helper in `talents.ts` is extracted into a shared location
(e.g. `stats.ts`) so talents and equipment share one implementation — there is no
second stacking system. Loot modifiers are already stored in the shape this
helper consumes (`{ stat, amount }`), so they apply directly. Application order
is base → talents → equipment; order is irrelevant because all modifiers are
additive, but the pipeline is defined this way for determinism.

## New pure modules

### `equipment.ts`

- `EMPTY_EQUIPMENT` — `{ weapon: null, armor: null, trinket: null }`.
- `applyEquipmentToHero(heroClass, equipment): HeroClass` — folds every equipped
  item's modifiers into `heroClass.stats` via the shared stat helper.
- `itemPowerScore(item): number` — weighted, normalized sum of the item's
  modifiers so different stats are comparable on one scale. Used to decide
  auto-equip.
- `autoEquipIfBetter(equipment, item): { equipment, replaced: LootItem | null, equipped: boolean }`
  — if `item` beats the piece currently in its slot by power score (strictly
  greater; empty slot always loses), equip it and return the displaced item as
  `replaced`; otherwise return unchanged equipment with `equipped: false`.
- `salvageValue(item): number` — gold value scaling with rarity and item level.

### `shop.ts`

- `SHOP_SIZE` — number of offers shown (default 4).
- `rollShopStock(heroLevel, shopRerolls): ShopOffer[]` — deterministic seeded
  list of `{ item: LootItem, price: number }`, reusing the existing loot
  generator with a shop-specific seed derived from `(heroLevel, shopRerolls)`.
  Item level scales with `heroLevel`.
- `getRerollCost(shopRerolls): number` — escalating gold cost per reroll within a
  level.
- `ShopOffer` type: `{ item: LootItem, price: number }`.

Shop stock is **derived, never stored** — it is purely a function of
`(heroLevel, shopRerolls)`, so it is fully reproducible and testable.

## State changes (`CampaignState`)

Add:

- `equipment: { weapon: LootItem | null; armor: LootItem | null; trinket: LootItem | null }`
- `shopRerolls: number`
- `purchases: number` — a monotonic counter used only to give each purchased item a unique id suffix (`-p<n>`), so buying the same shop offer more than once never collides in inventory. Seeded to 0, persisted, and clamped on restore like the other counters.

`createInitialCampaign` seeds `equipment: EMPTY_EQUIPMENT` and `shopRerolls: 0`.
`restoreCampaign` gains migration defaults for both (equipped items validated with
the existing `isLootItem` guard; `shopRerolls` clamped to a non-negative integer).

## Acquisition rule (one rule, both sources)

Both chest drops and shop purchases run `autoEquipIfBetter`:

- If the item beats what's in its slot, it auto-equips and the displaced piece
  drops to inventory.
- Otherwise it goes straight to inventory.

The player can always manually swap or salvage afterward. This is the single
acquisition rule — no separate handling for drops vs. purchases.

New pure reducers on `CampaignState` (all return new state, never mutate):

- `equipFromInventory(state, itemId)` — move an inventory item into its slot;
  displaced item returns to inventory.
- `unequipToInventory(state, slot)` — move an equipped item back to inventory.
- `salvageItem(state, itemId)` — remove an inventory item, add `salvageValue` gold.
- `buyShopOffer(state, offer)` — if affordable, deduct `price`, acquire the item
  via the shared acquisition rule (auto-equip-if-better), no-op if too expensive.
- `rerollShop(state)` — if affordable, deduct `getRerollCost(shopRerolls)` and
  increment `shopRerolls`; no-op if too expensive.

`applyCombatRewards` routes any chest item through the acquisition rule instead of
unconditionally prepending to inventory.

## Free-refresh cadence (gold sink + source)

- Shop stock is seeded by `(heroLevel, shopRerolls)`.
- `shopRerolls` resets to `0` on level-up, so leveling grants fresh stock for free
  and naturally scales item level with the hero.
- Within a level, paid rerolls (escalating cost) let the player push for more.

This makes rerolls the **primary gold sink** and salvage the **gold source** that
feeds it.

## UI (`App.tsx`)

Three additions; exact placement (tab vs. dedicated panel) settled during
planning to avoid over-cramming the existing three-column layout:

- **Equipment slots** — weapon / armor / trinket, each showing the equipped item
  and its modifiers (or empty).
- **Inventory list** — items with their modifiers, equip / salvage buttons, and a
  marker on currently-equipped pieces.
- **Shop panel** — offers with prices and buy buttons, plus a reroll button
  showing its current gold cost.

The existing "current build" stat readout already displays effective hero stats,
so it reflects equipped gear automatically once the pipeline change lands.

## Testing (Vitest)

Pure functions get direct coverage:

- `applyEquipmentToHero`: additive stacking and both clamps.
- `itemPowerScore`: ordering (a strictly stronger item scores higher).
- `autoEquipIfBetter`: empty slot equips; strictly-better replaces and returns the
  displaced item; worse/equal does not replace.
- `salvageValue`: monotonic with rarity and item level.
- `rollShopStock`: determinism (same inputs → same stock) and item-level scaling.
- `getRerollCost`: escalates.
- Reducers: `buyShopOffer` / `rerollShop` gold math and affordability no-ops,
  `salvageItem` gold + inventory changes, `equipFromInventory` /
  `unequipToInventory` slot + inventory correctness.
- `restoreCampaign`: migration defaults for `equipment` and `shopRerolls` from old
  saves.

## Impact on Milestone plan

Completes the outstanding Milestone 2 item (gear slots + stat modifiers) and adds
the between-levels economic decisions the whole design is built around.
