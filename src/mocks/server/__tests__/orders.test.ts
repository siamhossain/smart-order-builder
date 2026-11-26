import { describe, expect, it } from "vitest";
import { menuData } from "../../data/menu";
import seedFile from "../../data/orders.seed.json";
import { itemB, itemC } from "../../../engine/__tests__/testItems";
import { initialState, type ServerState } from "../state";
import { expireReservations, freeStockOf, reserveItem, type Result } from "../cart";
import { checkout, nextOrderId, priceSeedOrders, toOrdersFile } from "../orders";
import type { SeedOrder } from "../../../types/order";

const at = (hhmmss: string) => Date.parse(`2026-11-25T${hhmmss}+06:00`);

function okState(result: Result): ServerState {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.message}`);
  return result.state;
}

// Empty seed orders so these tests only see their own orders.
function cartBC(now = at("10:00:00")): ServerState {
  let state: ServerState = { ...initialState(menuData), orders: [] };
  state = okState(reserveItem(state, menuData, { idempotencyKey: "b", config: itemB, qty: 1 }, now));
  state = okState(reserveItem(state, menuData, { idempotencyKey: "c", config: itemC, qty: 2 }, now));
  return state;
}

function pay(state: ServerState, key: string, now: number, couponCode: string | null = "MORNING15") {
  return checkout(state, menuData, { idempotencyKey: key, paymentMethod: "card", couponCode }, now);
}

describe("Part E - seed orders", () => {
  const orders = priceSeedOrders(seedFile.orders as SeedOrder[], menuData);
  const payable = (id: string) => orders.find((o) => o.id === id)?.totals.payable;

  it("prices every seed order at its own createdAt", () => {
    expect(payable("ORD-1001")).toBe(33900);
    expect(payable("ORD-1002")).toBe(71300);
    expect(payable("ORD-1003")).toBe(127100);
    expect(payable("ORD-1004")).toBe(57800);
    expect(payable("ORD-1005")).toBe(86600);
    expect(payable("ORD-1006")).toBe(122800);
  });

  it("total revenue of the six seed orders is 4,995 BDT", () => {
    const total = orders.reduce((sum, o) => sum + o.totals.payable, 0);
    expect(total).toBe(499500);
  });

  it("ORD-1006 has the code but the coupon expired (13:10)", () => {
    const order = orders.find((o) => o.id === "ORD-1006");
    expect(order?.couponCode).toBe("MORNING15");
    expect(order?.coupon?.status).toBe("expired");
    expect(order?.totals.cartDiscount).toBeNull();
  });

  it("first start loads the seed orders into the store", () => {
    expect(initialState(menuData).orders.map((o) => o.id)).toEqual([
      "ORD-1001",
      "ORD-1002",
      "ORD-1003",
      "ORD-1004",
      "ORD-1005",
      "ORD-1006",
    ]);
  });
});

describe("Part E - checkout", () => {
  it("TC-06 at checkout: the order stores the totals and the applied coupon", () => {
    const state = okState(pay(cartBC(), "pay-1", at("10:59:59")));
    const order = state.orders[0];

    expect(order.totals.subtotal).toBe(165950);
    expect(order.totals.cartDiscount).toEqual({ promotionId: "C2", amount: 15000 });
    expect(order.totals.payable).toBe(158500);
    expect(order.coupon?.status).toBe("applied");
  });

  it("TC-07 at checkout: price is locked at Pay time, so 11:00 rejects the coupon", () => {
    const state = okState(pay(cartBC(), "pay-1", at("11:00:00")));
    const order = state.orders[0];

    expect(order.totals.payable).toBe(163700);
    expect(order.couponCode).toBe("MORNING15"); // entered...
    expect(order.coupon?.status).toBe("expired"); // ...but not applied
  });

  it("checkout is atomic: reserved stock becomes sold, cart empties, one order", () => {
    const before = cartBC();
    const after = okState(pay(before, "pay-1", at("10:30:00")));

    expect(after.reservations).toHaveLength(0);
    expect(after.orders).toHaveLength(1);
    expect(after.sold.egg).toBe(10);
    expect(freeStockOf(after).egg).toBe(0); // same as before paying
    expect(freeStockOf(before).egg).toBe(0);
  });

  it("TC-16: Pay twice with the same key gives exactly one order", () => {
    let state = cartBC();
    const first = pay(state, "pay-1", at("10:30:00"));
    state = okState(first);
    const second = pay(state, "pay-1", at("10:30:01"));

    expect(okState(second)).toBe(state); // nothing changed
    expect(second.ok && second.itemId).toBe(first.ok && first.itemId);
    expect(state.orders).toHaveLength(1);
  });

  it("TC-16: sold stock is not released again, even after the old expiry time", () => {
    const paid = okState(pay(cartBC(), "pay-1", at("10:30:00")));

    const muchLater = expireReservations(paid, at("12:00:00"));

    expect(freeStockOf(muchLater).egg).toBe(0);
    expect(freeStockOf(muchLater).cheese).toBe(0);
  });

  it("Pay with an empty cart is refused", () => {
    const paid = okState(pay(cartBC(), "pay-1", at("10:30:00")));
    const again = pay(paid, "pay-2", at("10:30:05"));

    expect(again.ok).toBe(false);
  });

  it("expired items are not paid for and their stock is not sold", () => {
    const state = cartBC(at("10:00:00"));
    const later = expireReservations(state, at("10:05:00")); // both expired

    expect(pay(later, "pay-1", at("10:05:00")).ok).toBe(false);
  });

  it("the server creates sequential order ids after the seeds", () => {
    const seeds = initialState(menuData).orders;
    expect(nextOrderId(seeds)).toBe("ORD-1007");
    expect(nextOrderId([])).toBe("ORD-1001");
  });

  it("TC-17: orders.json is valid JSON in the documented shape", () => {
    const state = okState(pay({ ...cartBC(), orders: initialState(menuData).orders }, "p", at("10:30:00")));
    const text = JSON.stringify(toOrdersFile(state.orders, at("10:31:00")));
    const file = JSON.parse(text);

    expect(file.schemaVersion).toBe(1);
    expect(file.moneyUnit).toBe("poisha");
    expect(file.orders).toHaveLength(7);
    expect(file.orders[6].id).toBe("ORD-1007");
    expect(file.orders[6].source).toBe("checkout");
  });
});
