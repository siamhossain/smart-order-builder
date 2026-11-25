// All money in this app is an integer number of poisha (1 BDT = 100 poisha).
// Example: 679.50 BDT is stored as 67950. Integers avoid float rounding errors.
export type Poisha = number;

export interface MenuOption {
  id: string;
  name: string;
  price: Poisha;
  // Ingredient id -> units used by ONE unit of this option.
  // Empty object means the option uses no tracked stock (e.g. Ketchup).
  ingredients: Record<string, number>;
}

export interface MenuGroup {
  id: string;
  name: string;
  min: number;
  max?: number;
  step?: number;
  maxDistinct?: number;
  maxPerOption?: number;
  options: MenuOption[];
}

export type Rule =
  | {
      id: string;
      type: "requires";
      optionId: string;
      requiredOptionIds: string[];
    }
  | {
      id: string;
      type: "excludes";
      optionId: string;
      excludedOptionIds: string[];
    }
  | {
      id: string;
      type: "overrideLimit";
      optionId: string;
      targetGroupId: string;
      max: number;
    };

// Option id -> quantity chosen. Options with 0 or missing are not selected.
export type ProductConfig = Record<string, number>;

// ----- Promotions -----

// Per unit: in a group, for every `everyN` units the cheapest unit is free.
export interface FreeCheapestPromotion {
  id: string;
  type: "freeCheapest";
  groupId: string;
  everyN: number;
}

// Per unit: if every condition is met, take percentOff off the unit price.
export interface ComboPercentPromotion {
  id: string;
  type: "comboPercent";
  conditions: { groupId: string; minUnits: number }[];
  percentOff: number;
}

// Cart: fixed amount off when the subtotal reaches minSubtotal.
export interface CartAmountOffPromotion {
  id: string;
  type: "cartAmountOff";
  minSubtotal: Poisha;
  amountOff: Poisha;
}

// Cart: coupon code, percent off with a cap, only before a time of day.
export interface CouponPercentPromotion {
  id: string;
  type: "couponPercent";
  code: string;
  percentOff: number;
  cap: Poisha;
  validBefore: string; // "HH:MM" in `timeZone`, exclusive
  timeZone: string; // e.g. "Asia/Dhaka"
}

export type UnitPromotion = FreeCheapestPromotion | ComboPercentPromotion;
export type CartPromotion = CartAmountOffPromotion | CouponPercentPromotion;

export interface PricingConfig {
  vatPercent: number;
  // Applied in list order to every unit.
  unitPromotions: UnitPromotion[];
  // Only ONE applies: the largest. On a tie, the one listed first wins.
  cartPromotions: CartPromotion[];
}

export interface MenuData {
  product: {
    id: string;
    name: string;
    basePrice: Poisha;
  };
  groups: MenuGroup[];
  rules: Rule[];
  ingredientStock: Record<string, number>;
  pricing: PricingConfig;
}

export interface ValidationViolation {
  groupId: string;
  ruleId: string;
  message: string;
}
