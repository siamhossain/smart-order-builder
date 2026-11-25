import { describe, expect, it } from "vitest";
import { menuData } from "../../mocks/data/menu";
import { priceLine } from "../pricing";
import {
  availableFor,
  findShortages,
  freeStock,
  maxMoreUnits,
  shortageMessage,
  usageOf,
} from "../stock";
import type { MenuOption, ProductConfig } from "../../types/menu";
import { itemA, itemB, itemC } from "./testItems";

const stock = menuData.ingredientStock;

function option(id: string): MenuOption {
  const found = menuData.groups
    .flatMap((g) => g.options)
    .find((o) => o.id === id);
  if (!found) throw new Error(`no option ${id}`);
  return found;
}

// The cart used by TC-08 to TC-11: B x1 + C x2.
const allocationB = usageOf(itemB, 1, menuData);
const allocationC = usageOf(itemC, 2, menuData);
const free = freeStock(stock, [allocationB, allocationC]);

describe("Part B - shared stock", () => {
  it("usageOf multiplies option usage and cart quantity", () => {
    expect(allocationB.egg).toBe(6); // omelette 2x2 + fried 2x1
    expect(allocationC).toMatchObject({ egg: 4, cheese: 4, tofu: 2 });
    expect(usageOf(itemA, 3, menuData)).toMatchObject({ egg: 6, sausage: 3 });
  });

  it("TC-08: B x1 + C x2 leaves egg 0, cheese 0, croissant 1", () => {
    expect(free.egg).toBe(0);
    expect(free.cheese).toBe(0);
    expect(free.croissant).toBe(1);
  });

  it("TC-08: a new item needing eggs is blocked with the reason", () => {
    const shortages = findShortages(usageOf(itemA, 1, menuData), free);

    expect(shortageMessage(shortages)).toBe("Short: 2 egg");
  });

  it("TC-08: egg options show 0 more units, Ketchup is unlimited", () => {
    const building: ProductConfig = { toast: 1 };

    expect(maxMoreUnits(option("fried"), building, 1, free, menuData)).toBe(0);
    expect(maxMoreUnits(option("omelette"), building, 1, free, menuData)).toBe(0);
    expect(maxMoreUnits(option("ketchup"), building, 1, free, menuData)).toBe(
      Infinity,
    );
  });

  it("TC-09: edit B to Omelette x3 + Fried x1 is short 1 egg", () => {
    const newB = { ...itemB, omelette: 3, fried: 1 }; // needs 7 eggs
    const available = availableFor(free, allocationB); // B's own 6 eggs count

    const shortages = findShortages(usageOf(newB, 1, menuData), available);

    expect(shortageMessage(shortages)).toBe("Short: 1 egg");
  });

  it("TC-10: edit B to Omelette x1 + Fried x3 is allowed, 643.50, 1 egg left", () => {
    const newB = { ...itemB, omelette: 1, fried: 3 }; // needs 5 eggs
    const newAllocation = usageOf(newB, 1, menuData);
    const available = availableFor(free, allocationB);

    expect(findShortages(newAllocation, available)).toEqual([]);
    expect(priceLine(newB, 1, menuData, menuData.pricing.unitPromotions).unitPrice).toBe(
      64350,
    );

    // After the swap the cart holds new B + C.
    const after = freeStock(stock, [newAllocation, allocationC]);
    expect(after.egg).toBe(1);
  });

  it("TC-11: C quantity 2 -> 3 lists every shortage", () => {
    const available = availableFor(free, allocationC); // C's own allocation

    const shortages = findShortages(usageOf(itemC, 3, menuData), available);

    expect(shortageMessage(shortages)).toBe("Short: 2 egg, 2 cheese");
  });

  it("maxMoreUnits counts what the config being built already uses", () => {
    // Empty cart, 10 eggs. Building with Omelette x2 (4 eggs) at qty 1.
    const building: ProductConfig = { omelette: 2 };

    expect(maxMoreUnits(option("omelette"), building, 1, stock, menuData)).toBe(3);
    expect(maxMoreUnits(option("fried"), building, 1, stock, menuData)).toBe(6);
    // Same config at qty 2 uses 8 eggs, 2 left, one more Fried costs 2.
    expect(maxMoreUnits(option("fried"), building, 2, stock, menuData)).toBe(1);
  });

  it("freeStock and availableFor never change their inputs", () => {
    const before = { ...stock };
    freeStock(stock, [allocationB]);
    availableFor(free, allocationB);

    expect(stock).toEqual(before);
  });
});
