import type { Poisha, ProductConfig } from "./menu";
import type { AppliedDiscount, CouponResult } from "./pricing";

export type PaymentMethod = "card" | "bkash" | "cash";
export const PAYMENT_METHODS: PaymentMethod[] = ["card", "bkash", "cash"];

// D6 - the shape of a stored order.
// - Money: integer poisha everywhere (same as the engine), never floats.
// - Prices are calculated ONCE (at checkout, or at createdAt for seeds) and
//   stored, so later menu or promotion changes never change old orders.
// - The coupon is stored twice on purpose:
//     couponCode = what the customer typed (or null)
//     coupon     = what happened to it (applied / expired / notBest / unknown)
//   so "entered but not applied" is visible without re-running the engine.
export interface OrderLine {
  qty: number;
  options: ProductConfig; // same key name as the seed file
  unitBase: Poisha;
  unitDiscounts: AppliedDiscount[];
  unitPrice: Poisha;
  lineTotal: Poisha;
}

export interface StoredOrder {
  id: string; // "ORD-1007" - created by the server
  createdAt: string; // ISO time - created by the server
  source: "seed" | "checkout";
  paymentMethod: PaymentMethod;
  couponCode: string | null;
  coupon: CouponResult | null;
  lines: OrderLine[];
  totals: {
    subtotal: Poisha;
    cartDiscount: AppliedDiscount | null;
    discountedSubtotal: Poisha;
    vat: Poisha;
    totalBeforeRounding: Poisha;
    payable: Poisha; // rounded to whole taka, still in poisha
  };
}

// The downloadable orders.json file.
export interface OrdersFile {
  schemaVersion: 1;
  currency: "BDT";
  moneyUnit: "poisha";
  exportedAt: string;
  orders: StoredOrder[];
}

// One order in orders.seed.json (no prices).
export interface SeedOrder {
  id: string;
  createdAt: string;
  paymentMethod: PaymentMethod;
  couponCode: string | null;
  lines: { qty: number; options: ProductConfig }[];
}
