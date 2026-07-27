# Equipment & Economy Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make looted gear affect combat and add a full economy loop (equip / salvage / shop), closing the dead-end loot loop.

**Architecture:** Gear folds into an "effective hero" the same way talents already do, via a shared additive stat helper. New pure, deterministic domain modules (`stats.ts`, `equipment.ts`, `shop.ts`) hold all logic; `progression.ts` gains reducers + save migration; `App.tsx` gets thin UI wiring. Shop stock is derived from `(heroLevel, shopRerolls)`, never stored.

**Tech Stack:** TypeScript, Vite, React 19, React Three Fiber, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-equipment-economy-loop-design.md`

**Conventions in this repo:**
- Tests are colocated: `src/game/foo.ts` → `src/game/foo.test.ts`.
- Run a single test file: `npx vitest run src/game/foo.test.ts`
- Run everything: `npm test`
- Typecheck + build: `npm run build`
- Percent-style stats (`attackSpeed`, `critChance`, `critDamage`, `cooldownReduction`) are stored as fractions and stacked additively; `critChance` clamps to `[0, 0.95]`, `cooldownReduction` to `[0, 0.75]`.

---

## File Structure

- **Create** `src/game/stats.ts` — shared `applyStatModifiers` + clamp (extracted from `talents.ts`).
- **Modify** `src/game/talents.ts` — import the shared helper, delete the local copy.
- **Modify** `src/game/types.ts` — add `Equipment` and `ShopOffer` interfaces.
- **Create** `src/game/equipment.ts` — `EMPTY_EQUIPMENT`, `applyEquipmentToHero`, `itemPowerScore`, `autoEquipIfBetter`, `salvageValue`.
- **Modify** `src/game/loot.ts` — add exported `generateLootItem` (shop reuse; leaves `generateChestReward`'s RNG order untouched).
- **Create** `src/game/shop.ts` — `SHOP_SIZE`, `rollShopStock`, `shopItemPrice`, `getRerollCost`.
- **Modify** `src/game/progression.ts` — extend `CampaignState`, migration, reducers, and `applyCombatRewards`.
- **Modify** `src/App.tsx` — effective-hero pipeline + equipment/inventory/shop UI.
- **Modify** `src/styles.css` — styles for the new UI (additive).

---

## Task 1: Extract shared stat helper

**Files:**
- Create: `src/game/stats.ts`
- Create: `src/game/stats.test.ts`
- Modify: `src/game/talents.ts:42-58` (remove local `applyStatModifiers` + `clamp`, import from `./stats`)

- [ ] **Step 1: Write the failing test**

Create `src/game/stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyStatModifiers } from "./stats";
import type { Stats } from "./types";

const BASE: Stats = {
  health: 100,
  armor: 5,
  damage: 20,
  attackSpeed: 1,
  range: 3,
  critChance: 0.9,
  critDamage: 1.5,
  abilityPower: 0,
  cooldownReduction: 0.7,
};

describe("applyStatModifiers", () => {
  it("adds flat stats additively", () => {
    const result = applyStatModifiers(BASE, { damage: 5, health: 30 });
    expect(result.damage).toBe(25);
    expect(result.health).toBe(130);
  });

  it("clamps critChance to 0.95 and cooldownReduction to 0.75", () => {
    const result = applyStatModifiers(BASE, { critChance: 0.2, cooldownReduction: 0.2 });
    expect(result.critChance).toBe(0.95);
    expect(result.cooldownReduction).toBe(0.75);
  });

  it("does not mutate the input", () => {
    applyStatModifiers(BASE, { damage: 5 });
    expect(BASE.damage).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/stats.test.ts`
Expected: FAIL — cannot resolve `./stats`.

- [ ] **Step 3: Write the implementation**

Create `src/game/stats.ts`:

```ts
import type { Stats } from "./types";

export function applyStatModifiers(stats: Stats, modifiers: Partial<Stats>): Stats {
  return {
    health: stats.health + (modifiers.health ?? 0),
    armor: stats.armor + (modifiers.armor ?? 0),
    damage: stats.damage + (modifiers.damage ?? 0),
    attackSpeed: stats.attackSpeed + (modifiers.attackSpeed ?? 0),
    range: stats.range + (modifiers.range ?? 0),
    critChance: clamp(stats.critChance + (modifiers.critChance ?? 0), 0, 0.95),
    critDamage: stats.critDamage + (modifiers.critDamage ?? 0),
    abilityPower: stats.abilityPower + (modifiers.abilityPower ?? 0),
    cooldownReduction: clamp(stats.cooldownReduction + (modifiers.cooldownReduction ?? 0), 0, 0.75),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
```

- [ ] **Step 4: Refactor `talents.ts` to use the shared helper**

In `src/game/talents.ts`, add to the top imports:

```ts
import { applyStatModifiers } from "./stats";
```

Then delete the local `applyStatModifiers` function and the `clamp` function (currently lines 42-58). The `applyTalentsToHero` call site (`applyStatModifiers(stats, talent.statModifiers)`) is unchanged.

- [ ] **Step 5: Run tests to verify both pass**

Run: `npx vitest run src/game/stats.test.ts src/game/talents.test.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 6: Commit**

```bash
git add src/game/stats.ts src/game/stats.test.ts src/game/talents.ts
git commit -m "Extract shared applyStatModifiers helper"
```

---

## Task 2: Add Equipment & ShopOffer types

**Files:**
- Modify: `src/game/types.ts` (append after the existing `LootItem`/`ChestReward` block)

- [ ] **Step 1: Add the types**

In `src/game/types.ts`, add these interfaces (place after the `ChestReward` interface, around line 172):

```ts
export interface Equipment {
  weapon: LootItem | null;
  armor: LootItem | null;
  trinket: LootItem | null;
}

export interface ShopOffer {
  item: LootItem;
  price: number;
}
```

Note: `EquipmentSlot` already exists as `"weapon" | "armor" | "trinket"` — the `Equipment` keys match it exactly, so `equipment[item.slot]` indexes correctly.

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/game/types.ts
git commit -m "Add Equipment and ShopOffer types"
```

---

## Task 3: Equipment module — apply, power score, auto-equip, salvage

**Files:**
- Create: `src/game/equipment.ts`
- Create: `src/game/equipment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/game/equipment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EMPTY_EQUIPMENT,
  applyEquipmentToHero,
  autoEquipIfBetter,
  itemPowerScore,
  salvageValue,
} from "./equipment";
import { heroClasses } from "./content";
import type { Equipment, LootItem } from "./types";

const berserker = heroClasses[0];

function weapon(id: string, damage: number): LootItem {
  return {
    id,
    name: `Test ${id}`,
    rarity: "rare",
    slot: "weapon",
    itemLevel: 5,
    modifiers: [{ stat: "damage", label: `+${damage} damage`, amount: damage }],
  };
}

describe("applyEquipmentToHero", () => {
  it("folds equipped modifiers into stats additively", () => {
    const equipment: Equipment = { ...EMPTY_EQUIPMENT, weapon: weapon("w1", 10) };
    const hero = applyEquipmentToHero(berserker, equipment);
    expect(hero.stats.damage).toBe(berserker.stats.damage + 10);
  });

  it("returns base stats unchanged with empty equipment", () => {
    const hero = applyEquipmentToHero(berserker, EMPTY_EQUIPMENT);
    expect(hero.stats.damage).toBe(berserker.stats.damage);
  });

  it("clamps percent stats via the shared helper", () => {
    const critRing: LootItem = {
      id: "r1", name: "Crit Ring", rarity: "epic", slot: "trinket", itemLevel: 5,
      modifiers: [{ stat: "critChance", label: "+90% crit", amount: 0.9 }],
    };
    const equipment: Equipment = { ...EMPTY_EQUIPMENT, trinket: critRing };
    const hero = applyEquipmentToHero(berserker, equipment);
    expect(hero.stats.critChance).toBe(0.95);
  });
});

describe("itemPowerScore", () => {
  it("scores a stronger item higher", () => {
    expect(itemPowerScore(weapon("a", 20))).toBeGreaterThan(itemPowerScore(weapon("b", 10)));
  });
});

describe("autoEquipIfBetter", () => {
  it("equips into an empty slot", () => {
    const result = autoEquipIfBetter(EMPTY_EQUIPMENT, weapon("w", 10));
    expect(result.equipped).toBe(true);
    expect(result.replaced).toBeNull();
    expect(result.equipment.weapon?.id).toBe("w");
  });

  it("replaces a weaker equipped item and returns it", () => {
    const equipment: Equipment = { ...EMPTY_EQUIPMENT, weapon: weapon("old", 5) };
    const result = autoEquipIfBetter(equipment, weapon("new", 20));
    expect(result.equipped).toBe(true);
    expect(result.equipment.weapon?.id).toBe("new");
    expect(result.replaced?.id).toBe("old");
  });

  it("keeps the equipped item when the new one is not strictly better", () => {
    const equipment: Equipment = { ...EMPTY_EQUIPMENT, weapon: weapon("old", 20) };
    const result = autoEquipIfBetter(equipment, weapon("new", 20));
    expect(result.equipped).toBe(false);
    expect(result.replaced).toBeNull();
    expect(result.equipment.weapon?.id).toBe("old");
  });
});

describe("salvageValue", () => {
  it("is higher for rarer and higher item-level gear", () => {
    const common: LootItem = { ...weapon("c", 1), rarity: "common", itemLevel: 3 };
    const legendary: LootItem = { ...weapon("l", 1), rarity: "legendary", itemLevel: 3 };
    expect(salvageValue(legendary)).toBeGreaterThan(salvageValue(common));

    const low: LootItem = { ...weapon("x", 1), rarity: "rare", itemLevel: 2 };
    const high: LootItem = { ...weapon("y", 1), rarity: "rare", itemLevel: 8 };
    expect(salvageValue(high)).toBeGreaterThan(salvageValue(low));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/equipment.test.ts`
Expected: FAIL — cannot resolve `./equipment`.

- [ ] **Step 3: Write the implementation**

Create `src/game/equipment.ts`:

```ts
import { applyStatModifiers } from "./stats";
import type { Equipment, HeroClass, LootItem, LootRarity, StatKey } from "./types";

export const EMPTY_EQUIPMENT: Equipment = { weapon: null, armor: null, trinket: null };

const POWER_WEIGHTS: Record<StatKey, number> = {
  damage: 1,
  abilityPower: 1,
  health: 0.1,
  armor: 1.5,
  range: 3,
  attackSpeed: 110,
  critDamage: 55,
  critChance: 220,
  cooldownReduction: 320,
};

const SALVAGE_RARITY_VALUE: Record<LootRarity, number> = {
  common: 4,
  uncommon: 7,
  rare: 12,
  epic: 20,
  legendary: 35,
  set: 28,
};

export interface AutoEquipResult {
  equipment: Equipment;
  replaced: LootItem | null;
  equipped: boolean;
}

export function applyEquipmentToHero(heroClass: HeroClass, equipment: Equipment): HeroClass {
  const equipped = [equipment.weapon, equipment.armor, equipment.trinket].filter(
    (item): item is LootItem => item !== null,
  );

  const stats = equipped.reduce(
    (current, item) =>
      item.modifiers.reduce(
        (accumulated, modifier) => applyStatModifiers(accumulated, { [modifier.stat]: modifier.amount }),
        current,
      ),
    heroClass.stats,
  );

  return { ...heroClass, stats };
}

export function itemPowerScore(item: LootItem): number {
  return item.modifiers.reduce((total, modifier) => total + modifier.amount * POWER_WEIGHTS[modifier.stat], 0);
}

export function autoEquipIfBetter(equipment: Equipment, item: LootItem): AutoEquipResult {
  const current = equipment[item.slot];
  const isBetter = current === null || itemPowerScore(item) > itemPowerScore(current);

  if (!isBetter) {
    return { equipment, replaced: null, equipped: false };
  }

  return {
    equipment: { ...equipment, [item.slot]: item },
    replaced: current,
    equipped: true,
  };
}

export function salvageValue(item: LootItem): number {
  return Math.max(1, Math.round(SALVAGE_RARITY_VALUE[item.rarity] * item.itemLevel));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/equipment.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/equipment.ts src/game/equipment.test.ts
git commit -m "Add equipment module: apply, power score, auto-equip, salvage"
```

---

## Task 4: Reusable loot item generator

**Files:**
- Modify: `src/game/loot.ts` (add exported `generateLootItem`)
- Modify: `src/game/loot.test.ts` (add determinism test)

**Why:** The shop needs to generate standalone items. `generateChestReward` rolls gold *between* item and modifiers, so we must NOT refactor its internals (that would shift its RNG sequence and change existing drops). We add a new, additive function that reuses the existing private helpers `rollRarity`, `rollItem`, `rollModifiers`.

- [ ] **Step 1: Write the failing test**

Add to `src/game/loot.test.ts`:

```ts
import { generateLootItem } from "./loot";
import type { LootRarity } from "./types";

const ALL_RARE: Record<LootRarity, number> = {
  common: 0, uncommon: 0, rare: 1, epic: 0, legendary: 0, set: 0,
};

describe("generateLootItem", () => {
  it("is deterministic for the same seed", () => {
    const a = generateLootItem(12345, ALL_RARE, 5);
    const b = generateLootItem(12345, ALL_RARE, 5);
    expect(a).toEqual(b);
  });

  it("produces different items for different seeds", () => {
    const a = generateLootItem(1, ALL_RARE, 5);
    const b = generateLootItem(2, ALL_RARE, 5);
    expect(a.id).not.toBe(b.id);
  });

  it("respects rarity weights", () => {
    expect(generateLootItem(999, ALL_RARE, 5).rarity).toBe("rare");
  });
});
```

(Keep the file's existing `import { describe, expect, it } from "vitest";` — do not duplicate it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/loot.test.ts`
Expected: FAIL — `generateLootItem` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/game/loot.ts`, add this exported function (e.g. directly after `generateChestReward`, around line 50). It reuses the existing private `rollRarity`, `rollItem`, and `rollModifiers`:

```ts
export function generateLootItem(
  seed: number,
  rarityWeights: Record<LootRarity, number>,
  itemLevel: number,
): LootItem {
  const random = createSeededRandom(seed);
  const rarity = rollRarity(rarityWeights, random);
  const rarityDefinition = lootRarities[rarity];
  const base = rollItem(seed, rarity, itemLevel, random);

  return {
    ...base,
    modifiers: rollModifiers(itemLevel, rarityDefinition.powerMultiplier, rarityDefinition.modifierCount, random),
  };
}
```

`LootItem` is already imported in `loot.ts`; `LootRarity` is too. No other import changes needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/loot.test.ts`
Expected: PASS (existing chest tests + new generator tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/loot.ts src/game/loot.test.ts
git commit -m "Add reusable generateLootItem for shop stock"
```

---

## Task 5: Shop module

**Files:**
- Create: `src/game/shop.ts`
- Create: `src/game/shop.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/game/shop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SHOP_SIZE, getRerollCost, rollShopStock, shopItemPrice } from "./shop";

describe("rollShopStock", () => {
  it("returns SHOP_SIZE offers", () => {
    expect(rollShopStock(3, 0)).toHaveLength(SHOP_SIZE);
  });

  it("is deterministic for the same inputs", () => {
    expect(rollShopStock(3, 0)).toEqual(rollShopStock(3, 0));
  });

  it("changes stock when rerolls change", () => {
    const a = rollShopStock(3, 0).map((offer) => offer.item.id);
    const b = rollShopStock(3, 1).map((offer) => offer.item.id);
    expect(a).not.toEqual(b);
  });

  it("scales item level with hero level", () => {
    expect(rollShopStock(8, 0)[0].item.itemLevel).toBe(8);
  });

  it("prices every offer at least 1 gold", () => {
    for (const offer of rollShopStock(5, 0)) {
      expect(offer.price).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("shopItemPrice", () => {
  it("charges more for rarer gear at the same item level", () => {
    const common = { id: "c", name: "c", rarity: "common" as const, slot: "weapon" as const, itemLevel: 5, modifiers: [] };
    const epic = { ...common, rarity: "epic" as const };
    expect(shopItemPrice(epic)).toBeGreaterThan(shopItemPrice(common));
  });
});

describe("getRerollCost", () => {
  it("escalates with each reroll", () => {
    expect(getRerollCost(1)).toBeGreaterThan(getRerollCost(0));
    expect(getRerollCost(2)).toBeGreaterThan(getRerollCost(1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/shop.test.ts`
Expected: FAIL — cannot resolve `./shop`.

- [ ] **Step 3: Write the implementation**

Create `src/game/shop.ts`:

```ts
import { generateLootItem } from "./loot";
import type { LootItem, LootRarity, ShopOffer } from "./types";

export const SHOP_SIZE = 4;

const SHOP_RARITY_WEIGHTS: Record<LootRarity, number> = {
  common: 30,
  uncommon: 34,
  rare: 22,
  epic: 10,
  legendary: 3,
  set: 4,
};

const BUY_RARITY_BASE: Record<LootRarity, number> = {
  common: 12,
  uncommon: 20,
  rare: 36,
  epic: 62,
  legendary: 105,
  set: 82,
};

export function rollShopStock(heroLevel: number, shopRerolls: number): ShopOffer[] {
  const itemLevel = Math.max(1, heroLevel);
  const offers: ShopOffer[] = [];

  for (let index = 0; index < SHOP_SIZE; index += 1) {
    const seed = buildShopSeed(heroLevel, shopRerolls, index);
    const item = generateLootItem(seed, SHOP_RARITY_WEIGHTS, itemLevel);
    offers.push({ item, price: shopItemPrice(item) });
  }

  return offers;
}

export function shopItemPrice(item: LootItem): number {
  return Math.max(1, Math.round(BUY_RARITY_BASE[item.rarity] * item.itemLevel));
}

export function getRerollCost(shopRerolls: number): number {
  return 25 + shopRerolls * 20;
}

function buildShopSeed(heroLevel: number, shopRerolls: number, index: number): number {
  let hash = Math.imul(heroLevel + 1, 2654435761);
  hash = Math.imul(hash ^ (shopRerolls + 1), 2246822519);
  hash = Math.imul(hash ^ (index + 1), 3266489917);
  return hash >>> 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/shop.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/shop.ts src/game/shop.test.ts
git commit -m "Add shop module: rotating stock, pricing, reroll cost"
```

---

## Task 6: Extend campaign state + save migration

**Files:**
- Modify: `src/game/progression.ts` (`CampaignState`, `createInitialCampaign`, `restoreCampaign`)
- Modify: `src/game/progression.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/game/progression.test.ts`:

```ts
describe("campaign state migration", () => {
  it("initializes empty equipment, zero rerolls, zero purchases", () => {
    const campaign = createInitialCampaign();
    expect(campaign.equipment).toEqual({ weapon: null, armor: null, trinket: null });
    expect(campaign.shopRerolls).toBe(0);
    expect(campaign.purchases).toBe(0);
  });

  it("restores missing equipment/shop fields from an old save", () => {
    const restored = restoreCampaign({ gold: 50, heroLevel: 3 });
    expect(restored.equipment).toEqual({ weapon: null, armor: null, trinket: null });
    expect(restored.shopRerolls).toBe(0);
    expect(restored.purchases).toBe(0);
  });

  it("drops an equipped item whose slot does not match its key", () => {
    const restored = restoreCampaign({
      equipment: {
        weapon: { id: "bad", name: "Mislotted", rarity: "rare", slot: "armor", itemLevel: 2, modifiers: [] },
        armor: null,
        trinket: null,
      },
    });
    expect(restored.equipment.weapon).toBeNull();
  });
});
```

Ensure `createInitialCampaign` and `restoreCampaign` are imported at the top of the test file (they already are — verify).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/progression.test.ts`
Expected: FAIL — `equipment`/`shopRerolls`/`purchases` do not exist.

- [ ] **Step 3: Update the state shape**

In `src/game/progression.ts`:

Add imports at the top:

```ts
import type { ChestReward, CombatResult, Equipment, EquipmentSlot, HeroClassId, LootItem, LootRarity, ShopOffer } from "./types";
import { EMPTY_EQUIPMENT, autoEquipIfBetter, salvageValue } from "./equipment";
import { getRerollCost } from "./shop";
```

(This replaces the existing `import type { ChestReward, ... } from "./types";` line and the existing talents import stays as-is.)

Add three fields to the `CampaignState` interface, after `inventory: LootItem[];`:

```ts
  equipment: Equipment;
  shopRerolls: number;
  purchases: number;
```

In `createInitialCampaign`, add to the returned object (after `inventory: [],`):

```ts
    equipment: { ...EMPTY_EQUIPMENT },
    shopRerolls: 0,
    purchases: 0,
```

In `restoreCampaign`, add to the returned object (after the `inventory:` line):

```ts
    equipment: restoreEquipment(candidate.equipment),
    shopRerolls: clampInteger(candidate.shopRerolls, 0, Number.MAX_SAFE_INTEGER, initial.shopRerolls),
    purchases: clampInteger(candidate.purchases, 0, Number.MAX_SAFE_INTEGER, initial.purchases),
```

Add these helper functions at the bottom of the file (next to the other private helpers):

```ts
function restoreEquipment(value: unknown): Equipment {
  const empty: Equipment = { weapon: null, armor: null, trinket: null };

  if (!value || typeof value !== "object") {
    return empty;
  }

  const candidate = value as Partial<Record<EquipmentSlot, unknown>>;

  return {
    weapon: restoreEquipmentSlot(candidate.weapon, "weapon"),
    armor: restoreEquipmentSlot(candidate.armor, "armor"),
    trinket: restoreEquipmentSlot(candidate.trinket, "trinket"),
  };
}

function restoreEquipmentSlot(value: unknown, slot: EquipmentSlot): LootItem | null {
  return isLootItem(value) && value.slot === slot ? value : null;
}
```

Note: `isLootItem`, `clampInteger`, `LootRarity`, and `ShopOffer` are referenced by later tasks; importing `ShopOffer`/`LootRarity` now is harmless. If `npx tsc --noEmit` flags an unused import at this task, leave it — Task 7 uses them. (Vite/Vitest do not fail on unused imports.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/progression.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/progression.ts src/game/progression.test.ts
git commit -m "Add equipment/shop fields to campaign state with migration"
```

---

## Task 7: Campaign reducers + reward acquisition

**Files:**
- Modify: `src/game/progression.ts` (new reducers + `applyCombatRewards`)
- Modify: `src/game/progression.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/game/progression.test.ts`. This uses two small helpers — define them near the top of the file if not present:

```ts
import {
  buyShopOffer,
  equipFromInventory,
  rerollShop,
  salvageItem,
  unequipToInventory,
} from "./progression";
import type { LootItem, ShopOffer } from "./types";

function makeItem(id: string, damage: number, slot: LootItem["slot"] = "weapon"): LootItem {
  return {
    id,
    name: `Item ${id}`,
    rarity: "rare",
    slot,
    itemLevel: 5,
    modifiers: [{ stat: "damage", label: `+${damage} damage`, amount: damage }],
  };
}

describe("equip / unequip / salvage reducers", () => {
  it("equips an inventory item into its slot", () => {
    const base = { ...createInitialCampaign(), inventory: [makeItem("w1", 10)] };
    const next = equipFromInventory(base, "w1");
    expect(next.equipment.weapon?.id).toBe("w1");
    expect(next.inventory).toHaveLength(0);
  });

  it("returns the displaced item to inventory when equipping over a slot", () => {
    const base = {
      ...createInitialCampaign(),
      equipment: { weapon: makeItem("old", 5), armor: null, trinket: null },
      inventory: [makeItem("new", 20)],
    };
    const next = equipFromInventory(base, "new");
    expect(next.equipment.weapon?.id).toBe("new");
    expect(next.inventory.map((i) => i.id)).toContain("old");
  });

  it("unequips a slot back to inventory", () => {
    const base = {
      ...createInitialCampaign(),
      equipment: { weapon: makeItem("w1", 10), armor: null, trinket: null },
    };
    const next = unequipToInventory(base, "weapon");
    expect(next.equipment.weapon).toBeNull();
    expect(next.inventory.map((i) => i.id)).toContain("w1");
  });

  it("salvages an inventory item for gold and removes it", () => {
    const item = makeItem("junk", 3);
    const base = { ...createInitialCampaign(), gold: 100, inventory: [item] };
    const next = salvageItem(base, "junk");
    expect(next.gold).toBeGreaterThan(100);
    expect(next.inventory).toHaveLength(0);
  });
});

describe("shop reducers", () => {
  const offer: ShopOffer = { item: makeItem("shop-1", 30), price: 40 };

  it("buys an offer: deducts gold and acquires the item", () => {
    const base = { ...createInitialCampaign(), gold: 100 };
    const next = buyShopOffer(base, offer);
    expect(next.gold).toBe(60);
    // stronger than empty weapon slot => auto-equipped
    expect(next.equipment.weapon?.id).toBe("shop-1-p0");
    expect(next.purchases).toBe(1);
  });

  it("gives purchased items unique ids across repeat buys", () => {
    const base = { ...createInitialCampaign(), gold: 1000 };
    const once = buyShopOffer(base, offer);
    const twice = buyShopOffer(once, offer);
    const ids = [twice.equipment.weapon?.id, ...twice.inventory.map((i) => i.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no-ops a purchase the player cannot afford", () => {
    const base = { ...createInitialCampaign(), gold: 10 };
    expect(buyShopOffer(base, offer)).toBe(base);
  });

  it("rerolls: deducts the reroll cost and increments rerolls", () => {
    const base = { ...createInitialCampaign(), gold: 100, shopRerolls: 0 };
    const next = rerollShop(base);
    expect(next.shopRerolls).toBe(1);
    expect(next.gold).toBe(100 - 25);
  });

  it("no-ops a reroll the player cannot afford", () => {
    const base = { ...createInitialCampaign(), gold: 5 };
    expect(rerollShop(base)).toBe(base);
  });
});

describe("applyCombatRewards acquisition", () => {
  it("auto-equips a won chest item into an empty slot", () => {
    const base = createInitialCampaign();
    const result = {
      won: true, level: { id: "l1", kind: "normal", levelNumber: 1 }, xp: 10, gold: 5,
      enemiesDefeated: 3,
    } as unknown as CombatResult;
    const chest = { item: makeItem("drop", 12), goldBonus: 0, seed: 1, levelId: "l1" };
    const next = applyCombatRewards(base, result, chest);
    expect(next.equipment.weapon?.id).toBe("drop");
  });

  it("resets shopRerolls to 0 on hero level-up", () => {
    const base = { ...createInitialCampaign(), heroLevel: 1, experience: 0, shopRerolls: 3 };
    const result = {
      won: true, level: { id: "l1", kind: "normal", levelNumber: 1 }, xp: 100000, gold: 0,
      enemiesDefeated: 1,
    } as unknown as CombatResult;
    const next = applyCombatRewards(base, result);
    expect(next.heroLevel).toBeGreaterThan(1);
    expect(next.shopRerolls).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/progression.test.ts`
Expected: FAIL — the reducers are not exported.

- [ ] **Step 3: Implement the reducers**

In `src/game/progression.ts`, add these exported reducers (place after `learnCampaignTalent`):

```ts
export function equipFromInventory(state: CampaignState, itemId: string): CampaignState {
  const item = state.inventory.find((entry) => entry.id === itemId);

  if (!item) {
    return state;
  }

  const displaced = state.equipment[item.slot];
  const inventoryWithoutItem = state.inventory.filter((entry) => entry.id !== itemId);

  return {
    ...state,
    equipment: { ...state.equipment, [item.slot]: item },
    inventory: displaced ? [displaced, ...inventoryWithoutItem] : inventoryWithoutItem,
  };
}

export function unequipToInventory(state: CampaignState, slot: EquipmentSlot): CampaignState {
  const equipped = state.equipment[slot];

  if (!equipped) {
    return state;
  }

  return {
    ...state,
    equipment: { ...state.equipment, [slot]: null },
    inventory: [equipped, ...state.inventory],
  };
}

export function salvageItem(state: CampaignState, itemId: string): CampaignState {
  const item = state.inventory.find((entry) => entry.id === itemId);

  if (!item) {
    return state;
  }

  return {
    ...state,
    gold: state.gold + salvageValue(item),
    inventory: state.inventory.filter((entry) => entry.id !== itemId),
  };
}

export function buyShopOffer(state: CampaignState, offer: ShopOffer): CampaignState {
  if (state.gold < offer.price) {
    return state;
  }

  const purchasedItem: LootItem = { ...offer.item, id: `${offer.item.id}-p${state.purchases}` };
  const acquired = acquireItem(state.equipment, state.inventory, purchasedItem);

  return {
    ...state,
    gold: state.gold - offer.price,
    purchases: state.purchases + 1,
    equipment: acquired.equipment,
    inventory: acquired.inventory,
  };
}

export function rerollShop(state: CampaignState): CampaignState {
  const cost = getRerollCost(state.shopRerolls);

  if (state.gold < cost) {
    return state;
  }

  return {
    ...state,
    gold: state.gold - cost,
    shopRerolls: state.shopRerolls + 1,
  };
}

function acquireItem(
  equipment: Equipment,
  inventory: LootItem[],
  item: LootItem,
): { equipment: Equipment; inventory: LootItem[] } {
  const result = autoEquipIfBetter(equipment, item);

  if (result.equipped) {
    return {
      equipment: result.equipment,
      inventory: result.replaced ? [result.replaced, ...inventory] : inventory,
    };
  }

  return { equipment, inventory: [item, ...inventory] };
}
```

- [ ] **Step 4: Route rewards through acquisition + reset rerolls on level-up**

In `src/game/progression.ts`, replace the `return { ... }` object at the end of `applyCombatRewards` (the block that currently sets `inventory: chestReward ? [chestReward.item, ...state.inventory] : state.inventory`) with:

```ts
  const acquired = chestReward
    ? acquireItem(state.equipment, state.inventory, chestReward.item)
    : { equipment: state.equipment, inventory: state.inventory };

  return {
    ...state,
    heroLevel: leveled.heroLevel,
    experience: leveled.experience,
    gold: state.gold + result.gold + (chestReward?.goldBonus ?? 0),
    victories: state.victories + 1,
    totalEnemiesDefeated: state.totalEnemiesDefeated + result.enemiesDefeated,
    completedLevelIds,
    nextLevelNumber:
      result.level.kind === "bonus"
        ? state.nextLevelNumber
        : Math.max(state.nextLevelNumber, result.level.levelNumber + 1),
    queuedBonusLevelAfter: result.level.kind === "bonus" ? null : queuedBonusLevelAfter ?? null,
    chestsOpened: state.chestsOpened + (chestReward ? 1 : 0),
    equipment: acquired.equipment,
    inventory: acquired.inventory,
    shopRerolls: leveled.heroLevel > state.heroLevel ? 0 : state.shopRerolls,
  };
```

(The `leveled` and `completedLevelIds` `const`s above this block are unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/game/progression.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite + typecheck**

Run: `npm test`
Expected: all files pass.
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/progression.ts src/game/progression.test.ts
git commit -m "Add equip/salvage/shop reducers and route rewards through auto-equip"
```

---

## Task 8: Wire the effective-hero pipeline and UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

UI is verified visually (per AGENTS.md), not with unit tests — the combat stage renders an R3F `Canvas` that does not run in jsdom. All logic this UI drives is already unit-tested in Tasks 3–7.

- [ ] **Step 1: Feed equipment into the effective hero**

In `src/App.tsx`, update the imports:

```ts
import { applyEquipmentToHero } from "./game/equipment";
import { rollShopStock, getRerollCost } from "./game/shop";
import {
  applyCombatRewards,
  buyShopOffer,
  createInitialCampaign,
  equipFromInventory,
  getExperienceForNextLevel,
  learnCampaignTalent,
  rerollShop,
  restoreCampaign,
  salvageItem,
  selectCampaignClass,
  unequipToInventory,
  type CampaignState,
} from "./game/progression";
```

Replace the `effectiveHero` memo (currently lines 31-34):

```ts
  const effectiveHero = useMemo(
    () => applyEquipmentToHero(applyTalentsToHero(selectedClass, campaign.selectedTalentIds), campaign.equipment),
    [selectedClass, campaign.selectedTalentIds, campaign.equipment],
  );
```

Add derived shop state near the other memos:

```ts
  const shopOffers = useMemo(
    () => rollShopStock(campaign.heroLevel, campaign.shopRerolls),
    [campaign.heroLevel, campaign.shopRerolls],
  );
  const rerollCost = getRerollCost(campaign.shopRerolls);
```

- [ ] **Step 2: Add UI handlers**

In `src/App.tsx`, add these handlers alongside the existing ones (e.g. after `learnTalent`):

```ts
  function equip(itemId: string) {
    setCampaign((current) => equipFromInventory(current, itemId));
  }

  function unequip(slot: "weapon" | "armor" | "trinket") {
    setCampaign((current) => unequipToInventory(current, slot));
  }

  function salvage(itemId: string) {
    setCampaign((current) => salvageItem(current, itemId));
  }

  function buy(offer: (typeof shopOffers)[number]) {
    setCampaign((current) => buyShopOffer(current, offer));
  }

  function reroll() {
    setCampaign((current) => rerollShop(current));
  }
```

- [ ] **Step 3: Add the outfitting UI section**

In `src/App.tsx`, add this `<section>` immediately after the closing `</section>` of `game-layout` (before the closing `</main>`). It reuses the existing `getRarityColor`/`formatRarity` helpers already defined in the file:

```tsx
      <section className="outfitting" aria-label="Gear and economy">
        <aside className="panel gear-panel" aria-label="Equipment">
          <div className="panel-heading">
            <p className="eyebrow">Loadout</p>
            <h2>Equipment</h2>
          </div>
          <div className="equip-slots">
            {(["weapon", "armor", "trinket"] as const).map((slot) => {
              const item = campaign.equipment[slot];
              return (
                <div className="equip-slot" key={slot}>
                  <span className="slot-label">{slot}</span>
                  {item ? (
                    <div className="slot-item" style={{ "--rarity": getRarityColor(item.rarity) } as React.CSSProperties}>
                      <strong>{item.name}</strong>
                      <ul>
                        {item.modifiers.map((modifier) => (
                          <li key={`${item.id}-${modifier.stat}`}>{modifier.label}</li>
                        ))}
                      </ul>
                      <button className="text-action" onClick={() => unequip(slot)} type="button">
                        Unequip
                      </button>
                    </div>
                  ) : (
                    <span className="slot-empty">Empty</span>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <aside className="panel inventory-panel" aria-label="Inventory">
          <div className="panel-heading">
            <p className="eyebrow">Backpack</p>
            <h2>Inventory ({campaign.inventory.length})</h2>
          </div>
          <div className="inventory-list">
            {campaign.inventory.length === 0 ? <p>No unequipped items.</p> : null}
            {campaign.inventory.map((item) => (
              <div
                className={`inventory-item rarity-${item.rarity}`}
                key={item.id}
                style={{ "--rarity": getRarityColor(item.rarity) } as React.CSSProperties}
              >
                <div className="loot-card-heading">
                  <span>{formatRarity(item.rarity)}</span>
                  <strong>{item.name}</strong>
                </div>
                <div className="loot-meta">
                  <span>{item.slot}</span>
                  <span>Item level {item.itemLevel}</span>
                </div>
                <ul>
                  {item.modifiers.map((modifier) => (
                    <li key={`${item.id}-${modifier.stat}`}>{modifier.label}</li>
                  ))}
                </ul>
                <div className="inventory-actions">
                  <button className="secondary-action" onClick={() => equip(item.id)} type="button">
                    Equip
                  </button>
                  <button className="text-action" onClick={() => salvage(item.id)} type="button">
                    Salvage
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <aside className="panel shop-panel" aria-label="Shop">
          <div className="panel-heading">
            <p className="eyebrow">Merchant</p>
            <h2>Shop</h2>
          </div>
          <button
            className="secondary-action"
            disabled={campaign.gold < rerollCost}
            onClick={reroll}
            type="button"
          >
            Reroll stock ({rerollCost} gold)
          </button>
          <div className="shop-list">
            {shopOffers.map((offer) => (
              <div
                className={`shop-offer rarity-${offer.item.rarity}`}
                key={offer.item.id}
                style={{ "--rarity": getRarityColor(offer.item.rarity) } as React.CSSProperties}
              >
                <div className="loot-card-heading">
                  <span>{formatRarity(offer.item.rarity)}</span>
                  <strong>{offer.item.name}</strong>
                </div>
                <div className="loot-meta">
                  <span>{offer.item.slot}</span>
                  <span>Item level {offer.item.itemLevel}</span>
                </div>
                <ul>
                  {offer.item.modifiers.map((modifier) => (
                    <li key={`${offer.item.id}-${modifier.stat}`}>{modifier.label}</li>
                  ))}
                </ul>
                <button
                  className="secondary-action"
                  disabled={campaign.gold < offer.price}
                  onClick={() => buy(offer)}
                  type="button"
                >
                  Buy ({offer.price} gold)
                </button>
              </div>
            ))}
          </div>
        </aside>
      </section>
```

- [ ] **Step 4: Add styles**

Append to `src/styles.css`:

```css
.outfitting {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  margin-top: 16px;
}

.equip-slots {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.equip-slot {
  border: 1px solid #2b303c;
  border-radius: 10px;
  padding: 10px;
}

.slot-label {
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #8b93a7;
}

.slot-empty {
  display: block;
  color: #6b7280;
  font-style: italic;
  margin-top: 4px;
}

.slot-item strong,
.inventory-item strong,
.shop-offer strong {
  color: var(--rarity, #e5e7eb);
}

.inventory-list,
.shop-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 340px;
  overflow-y: auto;
}

.inventory-item,
.shop-offer {
  border: 1px solid #2b303c;
  border-left: 3px solid var(--rarity, #2b303c);
  border-radius: 10px;
  padding: 10px;
}

.inventory-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

@media (max-width: 960px) {
  .outfitting {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run build`
Expected: `tsc --noEmit` passes and Vite build succeeds.

- [ ] **Step 6: Visual verification**

Invoke the `run` skill (or `npm run dev`) to launch the app, then confirm in the browser:
- Selecting a class shows base stats; equipping a weapon from the shop/inventory changes the "Damage/Speed/Health" readout in the left panel.
- Winning a level with an empty slot auto-equips the drop; winning with a weaker drop sends it to inventory.
- Salvage increases gold and removes the item.
- Buying deducts gold; reroll changes the four offers and deducts the shown cost.
- After a hero level-up, the shop shows fresh stock and the reroll cost is back to 25.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "Wire gear into combat and add equipment/inventory/shop UI"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success, no type errors.

- [ ] **Step 3: Confirm the loop end-to-end in the browser**

Play from a fresh save (use "Reset local progress"): win a level → receive/auto-equip loot → stats change → earn gold → buy/reroll in shop → salvage a junk item. Confirm gold rises and falls correctly and equipped gear visibly changes the hero's effective stats and combat outcome.

---

## Self-Review Notes

- **Spec coverage:** core pipeline (Task 8 §1 + Task 3), `equipment.ts` (Task 3), `shop.ts` (Task 5), state + migration (Task 6), one-rule acquisition for drops + purchases (Task 7 `acquireItem`), free-refresh cadence / rerolls reset on level-up (Task 7 §4), UI (Task 8), testing (Tasks 1,3,4,5,6,7). YAGNI items (set bonuses, class restrictions) intentionally absent.
- **Determinism preserved:** `generateChestReward` internals are untouched; `generateLootItem` is additive, so existing loot/save behavior is unchanged.
- **Type consistency:** `Equipment`/`ShopOffer` defined in Task 2; `AutoEquipResult` in Task 3; reducer names (`equipFromInventory`, `unequipToInventory`, `salvageItem`, `buyShopOffer`, `rerollShop`) match between Task 7 implementation and Task 8 imports.
- **Purchase id uniqueness:** the `purchases` counter suffixes bought-item ids so repeat buys never collide (verified by a Task 7 test).
