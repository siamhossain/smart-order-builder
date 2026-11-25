import type {
  CartPromotion,
  MenuData,
  MenuGroup,
  Poisha,
  PricingConfig,
  ProductConfig,
  UnitPromotion,
} from "../types/menu";
import type {
  AppliedDiscount,
  CartInput,
  CouponResult,
  PriceBreakdown,
  PricedLine,
} from "../types/pricing";
import { formatBDT, percentOf, roundToWholeTaka } from "./money";

// Part C - pricing engine.
// Pure function shared by the mock server (/price, checkout) and the tests.
// All amounts are integer poisha. Steps follow the brief in exact order:
//   1 unit subtotal  2 P2 free cheapest  3 P1 combo %  4 line totals
//   5 one cart discount  6 VAT, then round payable to whole taka
export function priceCart(
  cart: CartInput,
  menu: MenuData,
  promos: PricingConfig,
  serverTime: Date,
): PriceBreakdown {
  // Steps 1-4
  const lines = cart.lines.map((line) =>
    priceLine(line.config, line.qty, menu, promos.unitPromotions),
  );
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  // Step 5
  const { cartDiscount, coupon } = pickCartDiscount(
    subtotal,
    cart.couponCode,
    promos.cartPromotions,
    serverTime,
  );
  const discountedSubtotal = subtotal - (cartDiscount?.amount ?? 0);

  // Step 6
  const vat = percentOf(discountedSubtotal, promos.vatPercent);
  const totalBeforeRounding = discountedSubtotal + vat;

  return {
    lines,
    subtotal,
    cartDiscount,
    discountedSubtotal,
    vat,
    totalBeforeRounding,
    payable: roundToWholeTaka(totalBeforeRounding),
    coupon,
  };
}

// ---------- Steps 1-4: one cart line ----------

export function priceLine(
  config: ProductConfig,
  qty: number,
  menu: MenuData,
  unitPromotions: UnitPromotion[],
): PricedLine {
  // Step 1: base price + option price x option quantity
  let unitBase = menu.product.basePrice;
  for (const group of menu.groups) {
    for (const option of group.options) {
      unitBase += option.price * (config[option.id] ?? 0);
    }
  }

  // Steps 2-3: unit promotions, in the order they are listed.
  // Each one works on the amount left after the previous one.
  let unitPrice = unitBase;
  const unitDiscounts: AppliedDiscount[] = [];

  for (const promo of unitPromotions) {
    let amount = 0;

    if (promo.type === "freeCheapest") {
      const group = menu.groups.find((g) => g.id === promo.groupId);
      if (group) amount = freeCheapestAmount(group, config, promo.everyN);
    }

    if (promo.type === "comboPercent") {
      const allMet = promo.conditions.every((condition) => {
        const group = menu.groups.find((g) => g.id === condition.groupId);
        return group !== undefined && groupUnits(group, config) >= condition.minUnits;
      });
      if (allMet) amount = percentOf(unitPrice, promo.percentOff);
    }

    if (amount > 0) {
      unitPrice -= amount;
      unitDiscounts.push({ promotionId: promo.id, amount });
    }
  }

  // Step 4
  return { unitBase, unitDiscounts, unitPrice, qty, lineTotal: unitPrice * qty };
}

// Total units chosen in a group, e.g. Omelette x2 + Fried x2 = 4 egg units.
function groupUnits(group: MenuGroup, config: ProductConfig): number {
  return group.options.reduce((sum, o) => sum + (config[o.id] ?? 0), 0);
}

// For every N units in the group, the cheapest unit is free.
// Cheese x2, Beans x1, Mushroom x1 = 4 units -> floor(4/3) = 1 free -> Beans (25).
function freeCheapestAmount(
  group: MenuGroup,
  config: ProductConfig,
  everyN: number,
): Poisha {
  // One entry per unit: [3500, 3500, 2500, 3000]
  const unitPrices: Poisha[] = [];
  for (const option of group.options) {
    for (let i = 0; i < (config[option.id] ?? 0); i++) {
      unitPrices.push(option.price);
    }
  }

  unitPrices.sort((a, b) => a - b); // cheapest first
  const freeCount = Math.floor(unitPrices.length / everyN);

  let amount = 0;
  for (let i = 0; i < freeCount; i++) amount += unitPrices[i];
  return amount;
}

// ---------- Step 5: pick ONE cart discount ----------

function pickCartDiscount(
  subtotal: Poisha,
  couponCode: string | null,
  cartPromotions: CartPromotion[],
  serverTime: Date,
): { cartDiscount: AppliedDiscount | null; coupon: CouponResult | null } {
  const typedCode = couponCode?.trim().toUpperCase() || null;

  let best: AppliedDiscount | null = null;
  let couponPromoId: string | null = null; // the valid coupon promotion, if any
  let couponExpired = false;

  for (const promo of cartPromotions) {
    let amount = 0;

    if (promo.type === "cartAmountOff") {
      if (subtotal >= promo.minSubtotal) amount = promo.amountOff;
    }

    if (promo.type === "couponPercent") {
      if (typedCode !== promo.code.toUpperCase()) continue;

      if (isBeforeTimeOfDay(serverTime, promo.validBefore, promo.timeZone)) {
        amount = Math.min(percentOf(subtotal, promo.percentOff), promo.cap);
        couponPromoId = promo.id;
      } else {
        couponExpired = true;
      }
    }

    // Strictly bigger wins, so on a tie the promotion listed first stays.
    if (amount > 0 && (best === null || amount > best.amount)) {
      best = { promotionId: promo.id, amount };
    }
  }

  if (typedCode === null) return { cartDiscount: best, coupon: null };

  let coupon: CouponResult;
  if (couponPromoId !== null && best?.promotionId === couponPromoId) {
    coupon = {
      code: typedCode,
      status: "applied",
      message: `${typedCode} applied: ${formatBDT(best.amount)} off`,
    };
  } else if (couponPromoId !== null) {
    coupon = {
      code: typedCode,
      status: "notBest",
      message: `${typedCode} is valid, but ${best?.promotionId} gives an equal or bigger discount`,
    };
  } else if (couponExpired) {
    coupon = {
      code: typedCode,
      status: "expired",
      message: `${typedCode} is not valid at this time`,
    };
  } else {
    coupon = {
      code: typedCode,
      status: "unknown",
      message: `${typedCode} is not a valid coupon`,
    };
  }

  return { cartDiscount: best, coupon };
}

// Is `time` strictly before "HH:MM" on the clock of `timeZone`?
// 10:59:59 Dhaka -> true, 11:00:00 Dhaka -> false.
// Intl gives us the wall-clock time in that zone, so this works no matter
// which time zone the browser (or the reviewer's computer) is in.
export function isBeforeTimeOfDay(
  time: Date,
  hhmm: string,
  timeZone: string,
): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(time);

  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const nowSeconds = part("hour") * 3600 + part("minute") * 60 + part("second");
  const [limitHour, limitMinute] = hhmm.split(":").map(Number);
  const limitSeconds = limitHour * 3600 + limitMinute * 60;

  return nowSeconds < limitSeconds;
}
