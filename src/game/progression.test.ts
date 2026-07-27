import { describe, expect, it } from "vitest";
import { heroClasses, starterLevel } from "./content";
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
} from "./progression";
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
