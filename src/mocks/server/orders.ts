import type { MenuData } from "../../types/menu";
import type { OrdersFile, PaymentMethod, SeedOrder, StoredOrder } from "../../types/order";
import type { CartInput } from "../../types/pricing";
import { PAYMENT_METHODS } from "../../types/order";
import { priceCart } from "../../engine/pricing";
import { addIngredients } from "../../engine/stock";
import type { Result } from "./cart";
import type { ServerState } from "./state";

// Part E - checkout and orders (server side). Same style as cart.ts:
// take a state, return a NEW state, never change the old one.

// Price a cart with the engine and turn it into a stored order.
export function buildOrder(
  id: string,
  createdAt: Date,
  source: StoredOrder["source"],
  paymentMethod: PaymentMethod,
  cart: CartInput,
  menu: MenuData,
): StoredOrder {
  const price = priceCart(cart, menu, menu.pricing, createdAt);

  return {
    id,
    createdAt: createdAt.toISOString(),
    source,
    paymentMethod,
    couponCode: cart.couponCode,
    coupon: price.coupon,
    lines: cart.lines.map((line, i) => ({
      qty: line.qty,
      options: line.config,
      unitBase: price.lines[i].unitBase,
      unitDiscounts: price.lines[i].unitDiscounts,
      unitPrice: price.lines[i].unitPrice,
      lineTotal: price.lines[i].lineTotal,
    })),
    totals: {
      subtotal: price.subtotal,
      cartDiscount: price.cartDiscount,
      discountedSubtotal: price.discountedSubtotal,
      vat: price.vat,
      totalBeforeRounding: price.totalBeforeRounding,
      payable: price.payable,
    },
  };
}

// Seed orders have no prices: we price each one at its own createdAt, so
// the coupon's time window is checked against the time it was ordered.
// Seeds are past orders, so they do NOT take today's stock.
export function priceSeedOrders(seed: SeedOrder[], menu: MenuData): StoredOrder[] {
  return seed.map((order) =>
    buildOrder(
      order.id,
      new Date(order.createdAt),
      "seed",
      order.paymentMethod,
      {
        lines: order.lines.map((line) => ({ config: line.options, qty: line.qty })),
        couponCode: order.couponCode,
      },
      menu,
    ),
  );
}

// "ORD-1006" is the highest -> "ORD-1007".
export function nextOrderId(orders: StoredOrder[]): string {
  let highest = 1000;
  for (const order of orders) {
    const number = Number(order.id.replace("ORD-", ""));
    if (Number.isInteger(number)) highest = Math.max(highest, number);
  }
  return `ORD-${highest + 1}`;
}

// D4 - Pay. The SERVER creates the order id and timestamp, and the
// idempotency key makes a double click on Pay return the same order.
// Atomic: in ONE new state the reserved stock becomes sold stock, the cart
// empties, and the order is added.
export function checkout(
  state: ServerState,
  menu: MenuData,
  input: { idempotencyKey: string; paymentMethod: PaymentMethod; couponCode: string | null },
  now: number,
): Result {
  const existingOrderId = state.checkouts[input.idempotencyKey];
  if (existingOrderId) {
    return { ok: true, state, itemId: existingOrderId };
  }

  if (!PAYMENT_METHODS.includes(input.paymentMethod)) {
    return {
      ok: false,
      status: 400,
      error: { code: "BAD_REQUEST", message: `Payment method must be one of ${PAYMENT_METHODS.join(", ")}` },
    };
  }

  // Expired items hold no stock and can't be bought.
  const active = state.reservations.filter((r) => r.status === "active");
  if (active.length === 0) {
    return {
      ok: false,
      status: 400,
      error: { code: "BAD_REQUEST", message: "The cart has no active items to pay for" },
    };
  }

  const order = buildOrder(
    nextOrderId(state.orders),
    new Date(now),
    "checkout",
    input.paymentMethod,
    {
      lines: active.map((r) => ({ config: r.config, qty: r.qty })),
      couponCode: input.couponCode?.trim() || null,
    },
    menu,
  );

  // Reserved -> sold. The reservations are removed, so this stock is now
  // counted once (in `sold`) and can never be released again.
  let sold = state.sold;
  for (const r of active) sold = addIngredients(sold, r.allocation);

  return {
    ok: true,
    itemId: order.id,
    state: {
      ...state,
      sold,
      reservations: [], // the cart empties (expired items go too)
      orders: [...state.orders, order],
      checkouts: { ...state.checkouts, [input.idempotencyKey]: order.id },
    },
  };
}

export function toOrdersFile(orders: StoredOrder[], now: number): OrdersFile {
  return {
    schemaVersion: 1,
    currency: "BDT",
    moneyUnit: "poisha",
    exportedAt: new Date(now).toISOString(),
    orders,
  };
}
