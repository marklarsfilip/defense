import { describe, expect, it } from "vitest";
import { heroClasses, starterLevel } from "./content";
import {
  allocateStat,
  applyCombatRewards,
  buyShopOffer,
  createInitialCampaign,
  deallocateStat,
  equipFromInventory,
  getExperienceForNextLevel,
  learnCampaignTalent,
  rerollItemById,
  rerollShop,
  resetAllocation,
  restoreCampaign,
  salvageItem,
  selectCampaignClass,
  unequipToInventory,
  upgradeItemById,
} from "./progression";
import { getStatPointBudget } from "./allocation";
import { upgradeCost, rerollCost, MAX_UPGRADE_LEVEL } from "./upgrade";
import { salvageValue } from "./equipment";
import type { CombatResult, LootItem, ShopOffer } from "./types";

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

const victoryResult: CombatResult = {
  heroClass: heroClasses[0],
  level: starterLevel,
  won: true,
  duration: 12,
  heroHealthRemaining: 100,
  enemiesDefeated: 30,
  xp: 150,
  gold: 90,
  events: [],
};

const chestReward = {
  seed: 123,
  levelId: starterLevel.id,
  goldBonus: 7,
  item: {
    id: "item-1",
    name: "Rare Test Axe",
    rarity: "rare" as const,
    slot: "weapon" as const,
    itemLevel: 1,
    modifiers: [{ stat: "damage" as const, label: "Brutal: +3 damage", amount: 3 }],
  },
};

describe("progression", () => {
  it("applies victory rewards and records completed levels", () => {
    const campaign = applyCombatRewards(createInitialCampaign(), victoryResult);

    expect(campaign.gold).toBe(90);
    expect(campaign.victories).toBe(1);
    expect(campaign.totalEnemiesDefeated).toBe(30);
    expect(campaign.completedLevelIds).toEqual([starterLevel.id]);
    expect(campaign.nextLevelNumber).toBe(2);
  });

  it("levels up from earned experience", () => {
    const campaign = applyCombatRewards(createInitialCampaign(), victoryResult);

    expect(getExperienceForNextLevel(1)).toBe(100);
    expect(campaign.heroLevel).toBe(2);
    expect(campaign.experience).toBe(50);
  });

  it("banks chest gold and auto-equips the chest item into its empty slot", () => {
    const campaign = applyCombatRewards(createInitialCampaign(), victoryResult, chestReward);

    expect(campaign.gold).toBe(97);
    expect(campaign.chestsOpened).toBe(1);
    expect(campaign.equipment.weapon).toEqual(chestReward.item);
    expect(campaign.inventory).toEqual([]);
  });

  it("queues bonus levels without consuming the next normal level until cleared", () => {
    const queuedCampaign = applyCombatRewards(createInitialCampaign(), victoryResult, chestReward, 1);
    const bonusCampaign = applyCombatRewards(queuedCampaign, {
      ...victoryResult,
      level: {
        ...victoryResult.level,
        id: "bonus-pasture-after-1",
        kind: "bonus",
      },
    });

    expect(queuedCampaign.nextLevelNumber).toBe(2);
    expect(queuedCampaign.queuedBonusLevelAfter).toBe(1);
    expect(bonusCampaign.nextLevelNumber).toBe(2);
    expect(bonusCampaign.queuedBonusLevelAfter).toBeNull();
  });

  it("does not apply rewards for defeats", () => {
    const defeatedCampaign = applyCombatRewards(createInitialCampaign(), {
      ...victoryResult,
      won: false,
      xp: 40,
      gold: 20,
    });

    expect(defeatedCampaign).toEqual(createInitialCampaign());
  });

  it("learns talents up to the current point budget", () => {
    const levelTwoCampaign = {
      ...createInitialCampaign(),
      heroLevel: 2,
    };
    const firstTalent = learnCampaignTalent(levelTwoCampaign, "battle-hardened");
    const overspent = learnCampaignTalent(firstTalent, "sharpened-instincts");

    expect(firstTalent.selectedTalentIds).toEqual(["battle-hardened"]);
    expect(overspent.selectedTalentIds).toEqual(["battle-hardened"]);
  });

  it("drops incompatible class talents when changing class", () => {
    const campaign = selectCampaignClass(
      {
        ...createInitialCampaign(),
        selectedTalentIds: ["battle-hardened", "throwing-drills"],
      },
      "arcanist",
    );

    expect(campaign.selectedTalentIds).toEqual(["battle-hardened"]);
  });

  it("restores save data defensively", () => {
    const campaign = restoreCampaign({
      selectedClassId: "ranger",
      heroLevel: 3.8,
      experience: 42,
      gold: 500,
      victories: 2,
      totalEnemiesDefeated: 60,
      completedLevelIds: [starterLevel.id, 123],
      nextLevelNumber: 4,
      queuedBonusLevelAfter: 3,
      selectedTalentIds: ["battle-hardened", 123],
    });

    expect(campaign.selectedClassId).toBe("ranger");
    expect(campaign.heroLevel).toBe(3);
    expect(campaign.completedLevelIds).toEqual([starterLevel.id]);
    expect(campaign.nextLevelNumber).toBe(4);
    expect(campaign.queuedBonusLevelAfter).toBe(3);
    expect(campaign.selectedTalentIds).toEqual(["battle-hardened"]);
  });
});

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

  it("keeps a correctly-slotted equipped item on restore", () => {
    const item = { id: "w1", name: "Good Axe", rarity: "rare", slot: "weapon", itemLevel: 4, modifiers: [] };
    const restored = restoreCampaign({ equipment: { weapon: item, armor: null, trinket: null } });
    expect(restored.equipment.weapon).toEqual(item);
  });

  it("keeps an equipped item with a valid finite modifier on restore", () => {
    const item = {
      id: "w2",
      name: "Modded Axe",
      rarity: "rare",
      slot: "weapon",
      itemLevel: 4,
      modifiers: [{ stat: "damage", label: "Sharp: +5", amount: 5 }],
    };
    const restored = restoreCampaign({ equipment: { weapon: item, armor: null, trinket: null } });
    expect(restored.equipment.weapon).toEqual(item);
  });

  it("drops an equipped item whose modifier amount is not a finite number", () => {
    const restored = restoreCampaign({
      equipment: {
        weapon: { id: "x", name: "Corrupt", rarity: "rare", slot: "weapon", itemLevel: 3, modifiers: [{ stat: "damage", label: "bad", amount: "5" }] },
        armor: null, trinket: null,
      },
      inventory: [{ id: "y", name: "CorruptInv", rarity: "rare", slot: "armor", itemLevel: 3, modifiers: [{ stat: "health", label: "bad", amount: null }] }],
    });
    expect(restored.equipment.weapon).toBeNull();
    expect(restored.inventory).toHaveLength(0);
  });

  it("degrades non-object equipment values to empty equipment", () => {
    const empty = { weapon: null, armor: null, trinket: null };
    expect(restoreCampaign({ equipment: [] }).equipment).toEqual(empty);
    expect(restoreCampaign({ equipment: "nope" }).equipment).toEqual(empty);
  });
});

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
    expect(next.gold).toBe(100 + salvageValue(item));
    expect(next.inventory).toHaveLength(0);
  });

  it("no-ops equip/salvage when id is not in inventory (e.g. it's equipped)", () => {
    const base = { ...createInitialCampaign(), equipment: { weapon: makeItem("eq", 10), armor: null, trinket: null } };
    expect(equipFromInventory(base, "eq")).toBe(base); // "eq" is equipped, not in inventory
    expect(salvageItem(base, "eq")).toBe(base);
    expect(unequipToInventory({ ...createInitialCampaign() }, "weapon")).toEqual(createInitialCampaign()); // empty slot no-op
  });
});

describe("shop reducers", () => {
  const offer: ShopOffer = { item: makeItem("shop-1", 30), price: 40 };

  it("buys an offer: deducts gold and acquires the item", () => {
    const base = { ...createInitialCampaign(), gold: 100 };
    const next = buyShopOffer(base, offer);
    expect(next.gold).toBe(60);
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

describe("stat allocation migration", () => {
  it("initializes an empty allocation", () => {
    expect(createInitialCampaign().statAllocation).toEqual({ health: 0, damage: 0, armor: 0, abilityPower: 0, critChance: 0 });
  });

  it("restores and sanitizes allocation, dropping unknown keys and clamping to budget", () => {
    const restored = restoreCampaign({
      heroLevel: 3, // budget = (3-1)*2 = 4
      statAllocation: { damage: 3, health: 10, bogus: 5, armor: -2 },
    });
    const a = restored.statAllocation;
    expect(a.armor).toBe(0); // negative floored
    expect(Object.keys(a).sort()).toEqual(["abilityPower", "armor", "critChance", "damage", "health"]); // no 'bogus'
    expect(a.damage + a.health + a.armor + a.abilityPower + a.critChance).toBeLessThanOrEqual(4); // clamped to budget
  });

  it("defaults allocation for an old save without the field", () => {
    expect(restoreCampaign({ gold: 5 }).statAllocation).toEqual({ health: 0, damage: 0, armor: 0, abilityPower: 0, critChance: 0 });
  });

  it("drops a persisted item whose upgradeLevel is not a number", () => {
    const restored = restoreCampaign({
      inventory: [{ id: "z", name: "Bad", rarity: "rare", slot: "weapon", itemLevel: 3, modifiers: [], upgradeLevel: "3" }],
    });
    expect(restored.inventory).toHaveLength(0);
  });

  it("drops a persisted item whose rerolls is not a number", () => {
    const restored = restoreCampaign({
      inventory: [{ id: "z", name: "Bad", rarity: "rare", slot: "weapon", itemLevel: 3, modifiers: [], rerolls: "2" }],
    });
    expect(restored.inventory).toHaveLength(0);
  });

  it("preserves a within-budget allocation unchanged", () => {
    const allocation = { health: 2, damage: 1, armor: 0, abilityPower: 0, critChance: 0 };
    // budget at level 10 is (10-1)*2 = 18, so nothing is trimmed.
    expect(restoreCampaign({ heroLevel: 10, statAllocation: allocation }).statAllocation).toEqual(allocation);
  });

  it("trims later stats before earlier ones when over budget", () => {
    // heroLevel 2 => budget 2. Total allocated is 10, so 8 must be trimmed from the end first.
    const restored = restoreCampaign({
      heroLevel: 2,
      statAllocation: { health: 5, damage: 0, armor: 0, abilityPower: 0, critChance: 5 },
    });
    expect(restored.statAllocation.health).toBe(2);
    expect(restored.statAllocation.critChance).toBe(0);
  });
});

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
    const rich = { ...poor, gold: 100000 };
    expect(upgradeItemById(rich, "missing")).toBe(rich);
    const maxed = { ...createInitialCampaign(), gold: 100000, inventory: [{ ...makeItem("m", 5), upgradeLevel: MAX_UPGRADE_LEVEL }] };
    expect(upgradeItemById(maxed, "m")).toBe(maxed);
  });

  it("no-ops reroll when unaffordable or item missing", () => {
    const poor = { ...createInitialCampaign(), gold: 0, inventory: [makeItem("r", 5)] };
    expect(rerollItemById(poor, "r")).toBe(poor); // can't afford
    const rich = { ...poor, gold: 100000 };
    expect(rerollItemById(rich, "missing")).toBe(rich); // not found
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

  it("sends a weaker chest drop to inventory without displacing a stronger equipped item", () => {
    const base = { ...createInitialCampaign(), equipment: { weapon: makeItem("strong", 50), armor: null, trinket: null } };
    const result = { won: true, level: { id: "l2", kind: "normal", levelNumber: 2 }, xp: 0, gold: 0, enemiesDefeated: 0 } as unknown as CombatResult;
    const chest = { item: makeItem("weak", 5), goldBonus: 0, seed: 1, levelId: "l2" };
    const next = applyCombatRewards(base, result, chest);
    expect(next.equipment.weapon?.id).toBe("strong");
    expect(next.inventory.map((i) => i.id)).toContain("weak");
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
