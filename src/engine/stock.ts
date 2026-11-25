import type { MenuData, MenuOption, ProductConfig } from "../types/menu";

// Part B - ingredient-based shared stock. All pure functions.
//
// Ingredient id -> amount, e.g. { egg: 6, croissant: 1 }.
// Used for stock, for what an item uses (its "allocation"), and for what is
// still free.
export type Ingredients = Record<string, number>;

// How many ingredients ONE configured item uses, times its cart quantity.
// B x1 -> { croissant: 1, egg: 6, sausage: 1, bacon: 1, ... }
// (Omelette x2 uses 2 eggs each = 4, Fried x2 uses 1 each = 2, total 6.)
export function usageOf(
  config: ProductConfig,
  qty: number,
  menu: MenuData,
): Ingredients {
  const usage: Ingredients = {};

  for (const group of menu.groups) {
    for (const option of group.options) {
      const optionQty = config[option.id] ?? 0;
      if (optionQty === 0) continue;

      for (const [ingredient, perUnit] of Object.entries(option.ingredients)) {
        usage[ingredient] = (usage[ingredient] ?? 0) + perUnit * optionQty * qty;
      }
    }
  }

  return usage;
}

// a + b, ingredient by ingredient.
export function addIngredients(a: Ingredients, b: Ingredients): Ingredients {
  const result: Ingredients = { ...a };
  for (const [ingredient, amount] of Object.entries(b)) {
    result[ingredient] = (result[ingredient] ?? 0) + amount;
  }
  return result;
}

// What is still free: total stock minus everything currently held.
// The server calls this with every active reservation's allocation.
export function freeStock(
  stock: Ingredients,
  allocations: Ingredients[],
): Ingredients {
  const free: Ingredients = { ...stock };
  for (const allocation of allocations) {
    for (const [ingredient, amount] of Object.entries(allocation)) {
      free[ingredient] = (free[ingredient] ?? 0) - amount;
    }
  }
  return free;
}

// Net-difference rule for editing: the item's OWN current allocation counts
// as available to itself. So when editing B (which holds 6 eggs), we add
// those 6 eggs back before checking the new version of B.
// For a brand new item, pass no ownAllocation.
export function availableFor(
  free: Ingredients,
  ownAllocation: Ingredients = {},
): Ingredients {
  return addIngredients(free, ownAllocation);
}

export interface Shortage {
  ingredient: string;
  missing: number;
}

// Every ingredient where we need more than is available, with the exact
// missing amount. An ingredient not in the stock list counts as 0 available
// (safer than overselling). Options with no ingredients (Ketchup) never
// appear here, so they are unlimited.
export function findShortages(
  needed: Ingredients,
  available: Ingredients,
): Shortage[] {
  const shortages: Shortage[] = [];
  for (const [ingredient, amount] of Object.entries(needed)) {
    const missing = amount - (available[ingredient] ?? 0);
    if (missing > 0) shortages.push({ ingredient, missing });
  }
  return shortages;
}

// [{egg, 2}, {cheese, 2}] -> "Short: 2 egg, 2 cheese"
export function shortageMessage(shortages: Shortage[]): string {
  const parts = shortages.map((s) => `${s.missing} ${s.ingredient}`);
  return `Short: ${parts.join(", ")}`;
}

// How many MORE units of `option` can be added to the config being built,
// right now. The UI disables the option when this is 0.
// Returns Infinity for options that use no stock (Ketchup, Chili).
export function maxMoreUnits(
  option: MenuOption,
  config: ProductConfig,
  qty: number,
  available: Ingredients,
  menu: MenuData,
): number {
  const alreadyUsed = usageOf(config, qty, menu);
  let max = Infinity;

  for (const [ingredient, perUnit] of Object.entries(option.ingredients)) {
    const left = (available[ingredient] ?? 0) - (alreadyUsed[ingredient] ?? 0);
    // One more unit of the option costs perUnit for EACH of the qty items.
    const units = Math.floor(left / (perUnit * qty));
    max = Math.min(max, units);
  }

  return Math.max(0, max);
}
