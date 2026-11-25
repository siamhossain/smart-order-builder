import type { ProductConfig } from "../../types/menu";

// The three items used by the acceptance tests in Section 9 of the brief.

// A = Toast, Scrambled x2, Chicken Sausage x1, Ketchup
export const itemA: ProductConfig = {
  toast: 1,
  scrambled: 2,
  sausage: 1,
  ketchup: 1,
};

// B = Croissant, Omelette x2, Fried x2, Chicken Sausage x1, Beef Bacon x1,
//     Hash Brown x1, Mushroom x1, Hollandaise
export const itemB: ProductConfig = {
  croissant: 1,
  omelette: 2,
  fried: 2,
  sausage: 1,
  bacon: 1,
  hashbrown: 1,
  mushroom: 1,
  hollandaise: 1,
};

// C = Paratha, Fried x2, Tofu x1, Cheese x2, Baked Beans x1, Mushroom x1, Chili
export const itemC: ProductConfig = {
  paratha: 1,
  fried: 2,
  tofu: 1,
  cheese: 2,
  beans: 1,
  mushroom: 1,
  chili: 1,
};
