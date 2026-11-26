import type { MenuData, MenuOption, ProductConfig } from "../types/menu";

// Part B - shared ingredient stock. Pure functions.
// Ingredient id -> amount, e.g. { egg: 6, croissant: 1 }.
export type Ingredients = Record<string, number>;

// Ingredients one item uses, times its quantity.
// B x1 -> { croissant: 1, egg: 6, ... } (Omelette x2 = 4 eggs + Fried x2 = 2)
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

// Free = stock minus everything currently held.
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

// Net-difference rule: when editing, the item's own allocation is added back
// before checking. A new item passes no ownAllocation.
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

// Every ingredient we need more of, with the missing amount.
// An ingredient missing from stock counts as 0, so we never oversell.
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

// How many more units of `option` fit right now (Infinity if it uses no stock).
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
