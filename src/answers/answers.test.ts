import { describe, expect, it } from "vitest";
import { menuData } from "../mocks/data/menu";
import seedFile from "../mocks/data/orders.seed.json";
import { priceSeedOrders } from "../mocks/server/orders";
import { initialState, type ServerState } from "../mocks/server/state";
import { reserveItem } from "../mocks/server/cart";
import { validate } from "../engine/rules";
import { priceCart, priceLine } from "../engine/pricing";
import { findShortages, usageOf } from "../engine/stock";
import { formatBDT } from "../engine/money";
import {
  bestSellingOptions,
  couponUsage,
  revenueByPaymentMethod,
  totalRevenue,
  unitsByOption,
} from "../engine/stats";
import { describeConfig } from "../components/format";
import { itemA, itemB, itemC } from "../engine/__tests__/testItems";
import type { MenuGroup, ProductConfig } from "../types/menu";
import type { CartInput, PriceBreakdown } from "../types/pricing";
import type { SeedOrder } from "../types/order";

// ANSWERS.md - every answer is printed by running our own engine.
// Run: npm run answers

const seed = priceSeedOrders(seedFile.orders as SeedOrder[], menuData);
const dhaka = (hhmm: string) => new Date(`2026-11-25T${hhmm}:00+06:00`);
const print = (...lines: string[]) => console.log(lines.join("\n"));
// "2026-11-20 09:15" in Dhaka time
const dhakaTime = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Dhaka", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

function breakdownLines(b: PriceBreakdown): string[] {
  const lines = b.lines.map(
    (l, i) =>
      `  line ${i + 1}: unit ${formatBDT(l.unitPrice)} x ${l.qty} = ${formatBDT(l.lineTotal)}`,
  );
  return [
    ...lines,
    `  subtotal            ${formatBDT(b.subtotal)}`,
    `  cart discount       ${b.cartDiscount ? `${b.cartDiscount.promotionId} -${formatBDT(b.cartDiscount.amount)}` : "none"}`,
    `  coupon              ${b.coupon ? `${b.coupon.code}: ${b.coupon.status}` : "not entered"}`,
    `  discounted subtotal ${formatBDT(b.discountedSubtotal)}`,
    `  VAT 5%              ${formatBDT(b.vat)}`,
    `  total               ${formatBDT(b.totalBeforeRounding)}`,
    `  payable             ${formatBDT(b.payable)}`,
  ];
}

describe("ANSWERS.md", () => {
  it("Q1: maximum number of item C from an empty cart", () => {
    // Keep adding C x1 on the server until a reservation is refused.
    let state: ServerState = initialState(menuData);
    let added = 0;
    let reason = "";
    for (let i = 0; i < 20; i++) {
      const result = reserveItem(state, menuData, { idempotencyKey: `c-${i}`, config: itemC, qty: 1 }, 0);
      if (!result.ok) {
        reason = result.error.message;
        break;
      }
      state = result.state;
      added++;
    }

    print(
      "Q1. Item C uses per unit: " + JSON.stringify(usageOf(itemC, 1, menuData)),
      `    Added ${added} x C, the next one was refused: "${reason}"`,
      "    Cheese is the limit: 4 in stock, 2 per C.",
    );
    expect(added).toBe(2);
    expect(reason).toBe("Short: 2 cheese");
  });

  it("Q2: cheapest valid configuration", () => {
    // Optional groups (min 0) are left empty: their options cost >= 0, so
    // adding them can never make the price lower. For required groups we try
    // every combination within the limits and keep the cheapest valid one.
    function combos(group: MenuGroup): ProductConfig[] {
      const max = group.max ?? group.min;
      const result: ProductConfig[] = [];
      function build(index: number, left: number, current: ProductConfig) {
        if (index === group.options.length) {
          if (left === 0) result.push(current);
          return;
        }
        for (let q = 0; q <= left; q++) {
          const next = q > 0 ? { ...current, [group.options[index].id]: q } : current;
          build(index + 1, left - q, next);
        }
      }
      for (let total = group.min; total <= max; total++) build(0, total, {});
      return result;
    }

    let configs: ProductConfig[] = [{}];
    for (const group of menuData.groups.filter((g) => g.min > 0)) {
      configs = configs.flatMap((c) => combos(group).map((g) => ({ ...c, ...g })));
    }

    let best: { config: ProductConfig; price: number } | null = null;
    for (const config of configs) {
      if (validate(config, menuData.groups, menuData.rules).length > 0) continue;
      if (findShortages(usageOf(config, 1, menuData), menuData.ingredientStock).length > 0) continue;
      const price = priceLine(config, 1, menuData, menuData.pricing.unitPromotions).unitPrice;
      if (best === null || price < best.price) best = { config, price };
    }

    print(
      `Q2. Checked ${configs.length} combinations of the required groups.`,
      `    Cheapest valid: ${describeConfig(best!.config, menuData)} = ${formatBDT(best!.price)} BDT`,
      "    (250 base + Toast 0 + Fried x2 60 + Tofu 50; Ketchup is free and optional)",
    );
    expect(best!.price).toBe(36000);
    expect(best!.config).toEqual({ toast: 1, fried: 2, tofu: 1 });
  });

  it("Q3: cart A x3 at 10:30 and at 11:30 (MORNING15 entered)", () => {
    const cart: CartInput = { lines: [{ config: itemA, qty: 3 }], couponCode: "MORNING15" };
    const at1030 = priceCart(cart, menuData, menuData.pricing, dhaka("10:30"));
    const at1130 = priceCart(cart, menuData, menuData.pricing, dhaka("11:30"));

    print(
      "Q3. Cart = A x3, coupon MORNING15 entered",
      "  At 10:30:",
      ...breakdownLines(at1030),
      "  At 11:30:",
      ...breakdownLines(at1130),
    );
    expect([at1030.subtotal, at1030.cartDiscount?.amount, at1030.vat, at1030.payable]).toEqual([114000, 15000, 4950, 104000]);
    expect([at1130.subtotal, at1130.cartDiscount, at1130.vat, at1130.payable]).toEqual([114000, null, 5700, 119700]);
  });

  it("Q4: payable after TC-10 at 11:30", () => {
    const newB = { ...itemB, omelette: 1, fried: 3 };
    const cart: CartInput = {
      lines: [
        { config: newB, qty: 1 },
        { config: itemC, qty: 2 },
      ],
      couponCode: "MORNING15",
    };
    const result = priceCart(cart, menuData, menuData.pricing, dhaka("11:30"));

    print("Q4. Cart = B (Omelette x1 + Fried x3) x1 + C x2 at 11:30", ...breakdownLines(result));
    expect(result.payable).toBe(160000);
  });

  it("Q5: payable of each seed order and total revenue", () => {
    print(
      "Q5. Seed orders priced at their createdAt:",
      ...seed.map(
        (o) =>
          `  ${o.id}  ${dhakaTime(o.createdAt)}  ${o.paymentMethod.padEnd(5)}  ${(o.coupon ? `${o.coupon.code}:${o.coupon.status}` : "-").padEnd(18)} payable ${formatBDT(o.totals.payable)}`,
      ),
      `  Total revenue: ${formatBDT(totalRevenue(seed))} BDT`,
    );
    expect(seed.map((o) => o.totals.payable)).toEqual([33900, 71300, 127100, 57800, 86600, 122800]);
    expect(totalRevenue(seed)).toBe(499500);
  });

  it("Q6: best-selling option by units", () => {
    const top = unitsByOption(seed, menuData).slice(0, 5);
    print(
      "Q6. Units = line qty x option qty, over all seed orders. Top 5:",
      ...top.map((o) => `  ${o.name.padEnd(16)} ${o.units}`),
      `  Best seller: ${bestSellingOptions(seed, menuData).map((o) => o.name).join(", ")}`,
    );
    expect(bestSellingOptions(seed, menuData)).toEqual([{ optionId: "fried", name: "Fried", units: 10 }]);
  });

  it("Q7: payment method with the most revenue", () => {
    const byMethod = revenueByPaymentMethod(seed);
    print(
      "Q7. Revenue by payment method:",
      ...byMethod.map((m) => `  ${m.method.padEnd(6)} ${formatBDT(m.revenue).padStart(9)}  (${m.orderCount} order${m.orderCount === 1 ? "" : "s"})`),
    );
    expect(byMethod[0]).toEqual({ method: "card", revenue: 214500, orderCount: 3 });
  });

  it("Q8: how many seed orders really got MORNING15", () => {
    const usage = couponUsage(seed, "MORNING15");
    const withCode = seed.filter((o) => o.couponCode === "MORNING15");

    print(
      `Q8. ${usage.ordersWithCode} orders entered MORNING15, ${usage.appliedCount} actually got it.`,
      "  Rule: 15% of subtotal, max 150, only strictly before 11:00 Dhaka time,",
      "        and only if it is bigger than C1 (100 off when subtotal >= 1,200).",
      ...withCode.map((o) => {
        const time = dhakaTime(o.createdAt).slice(11);
        const c2 = Math.min(Math.floor((o.totals.subtotal * 15 + 50) / 100), 15000);
        return `  ${o.id} at ${time}: subtotal ${formatBDT(o.totals.subtotal)}, 15% capped = ${formatBDT(c2)} -> ${o.coupon?.status}: ${o.coupon?.message}`;
      }),
      "  ORD-1006 was at 13:10, after 11:00, so the coupon was rejected.",
      "  Its subtotal 1,169.50 is also below 1,200, so it got no C1 either.",
    );
    expect(usage.appliedCount).toBe(3);
    expect(usage.notApplied.map((n) => n.orderId)).toEqual(["ORD-1006"]);
  });
});
