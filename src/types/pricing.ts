import type { Poisha, ProductConfig } from "./menu";

// What priceCart needs to know about a cart: the configured items and the
// coupon the customer typed (if any).
export interface CartInput {
  lines: { config: ProductConfig; qty: number }[];
  couponCode: string | null;
}

export interface AppliedDiscount {
  promotionId: string;
  amount: Poisha;
}

export interface PricedLine {
  unitBase: Poisha; // step 1: base + options
  unitDiscounts: AppliedDiscount[]; // steps 2-3: P2, P1 ...
  unitPrice: Poisha; // after unit discounts
  qty: number;
  lineTotal: Poisha; // step 4: unitPrice * qty
}

// What happened to the coupon the customer typed.
//   applied  - it is the discount we used
//   notBest  - valid, but another discount was bigger (or tied and listed first)
//   expired  - right code, but outside its time window
//   unknown  - no promotion has this code
export type CouponStatus = "applied" | "notBest" | "expired" | "unknown";

export interface CouponResult {
  code: string;
  status: CouponStatus;
  message: string;
}

export interface PriceBreakdown {
  lines: PricedLine[];
  subtotal: Poisha;
  cartDiscount: AppliedDiscount | null; // step 5: only one
  discountedSubtotal: Poisha;
  vat: Poisha; // step 6
  totalBeforeRounding: Poisha;
  payable: Poisha; // rounded to whole taka, still in poisha (158500)
  coupon: CouponResult | null; // null when no coupon was entered
}
