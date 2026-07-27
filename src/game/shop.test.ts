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
