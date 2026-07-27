import { describe, expect, it } from "vitest";
import {
  EMPTY_EQUIPMENT,
  applyEquipmentToHero,
  autoEquipIfBetter,
  getActiveSetBonuses,
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

  it("folds the 3-piece set bonus into hero stats", () => {
    const three = {
      ...EMPTY_EQUIPMENT,
      weapon: setPiece("w", "weapon", "ninefold-road"),
      armor: setPiece("a", "armor", "ninefold-road"),
      trinket: setPiece("t", "trinket", "ninefold-road"),
    };
    const hero = applyEquipmentToHero(berserker, three);
    // ninefold-road 3pc = { armor: 8, health: 70, damage: 6 }
    expect(hero.stats.armor).toBe(berserker.stats.armor + 8);
    expect(hero.stats.health).toBe(berserker.stats.health + 70);
    expect(hero.stats.damage).toBe(berserker.stats.damage + 6);
  });

  it("clamps critChance at 0.95 when set bonus + item mods exceed the cap", () => {
    const bigCrit = (id: string, slot: LootItem["slot"]) => ({
      id, name: `bic ${slot}`, rarity: "set" as const, slot, itemLevel: 5,
      modifiers: [{ stat: "critChance" as const, label: "Precise: +80% critical chance", amount: 0.8 }],
      setId: "black-ice-vigil", setName: "Black Ice Vigil",
    });
    const eq = { ...EMPTY_EQUIPMENT, weapon: bigCrit("w", "weapon"), armor: bigCrit("a", "armor"), trinket: bigCrit("t", "trinket") };
    const hero = applyEquipmentToHero(berserker, eq);
    expect(hero.stats.critChance).toBe(0.95);
  });
});
