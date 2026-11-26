import { describe, expect, it } from "vitest";
import { menuData } from "../../mocks/data/menu";
import seedFile from "../../mocks/data/orders.seed.json";
import { priceSeedOrders } from "../../mocks/server/orders";
import type { SeedOrder } from "../../types/order";
import {
  averageOrderValue,
  bestSellingOptions,
  countOrders,
  couponUsage,
  dhakaDate,
  ordersOnDate,
  revenueByPaymentMethod,
  totalRevenue,
  unitsByOption,
} from "../stats";

// The six seed orders, priced by our engine at their createdAt.
const seed = priceSeedOrders(seedFile.orders as SeedOrder[], menuData);

describe("Part F - stats over the seed orders", () => {
  it("how many orders: 6", () => {
    expect(countOrders(seed)).toBe(6);
  });

  it("total revenue: 4,995.00", () => {
    expect(totalRevenue(seed)).toBe(499500);
  });

  it("average order value: 832.50", () => {
    expect(averageOrderValue(seed)).toBe(83250);
    expect(averageOrderValue([])).toBe(0);
  });

  it("Q6: best-selling option by units is Fried (10)", () => {
    expect(bestSellingOptions(seed, menuData)).toEqual([
      { optionId: "fried", name: "Fried", units: 10 },
    ]);
  });

  it("units count line quantity x option quantity", () => {
    const units = Object.fromEntries(unitsByOption(seed, menuData).map((o) => [o.optionId, o.units]));

    expect(units.scrambled).toBe(8); // 2 + 2 + (2 x 2)
    expect(units.sausage).toBe(8); // 1 + 1 + 1 + (2 x 2) + 1
    expect(units.cheese).toBe(6); // (2 x 2) + 2
  });

  it("a tie returns every best seller", () => {
    const tied = seed.filter((o) => o.id === "ORD-1001"); // scrambled 2, others 1
    expect(bestSellingOptions(tied, menuData).map((o) => o.optionId)).toEqual(["scrambled"]);
    expect(bestSellingOptions([], menuData)).toEqual([]);
  });

  it("Q7: revenue by payment method, card first", () => {
    expect(revenueByPaymentMethod(seed)).toEqual([
      { method: "card", revenue: 214500, orderCount: 3 },
      { method: "bkash", revenue: 157900, orderCount: 2 },
      { method: "cash", revenue: 127100, orderCount: 1 },
    ]);
  });

  it("Q8: MORNING15 was entered 4 times but applied only 3 times", () => {
    const usage = couponUsage(seed, "morning15");

    expect(usage.ordersWithCode).toBe(4);
    expect(usage.appliedCount).toBe(3);
    expect(usage.notApplied).toEqual([
      { orderId: "ORD-1006", status: "expired", reason: "MORNING15 is not valid at this time" },
    ]);
  });

  it("orders on a given date use the Dhaka calendar", () => {
    expect(ordersOnDate(seed, "2026-11-21").map((o) => o.id)).toEqual(["ORD-1003", "ORD-1004"]);
    expect(ordersOnDate(seed, "2026-11-23")).toEqual([]);
    // 19:30 UTC on the 21st is already 01:30 on the 22nd in Dhaka
    expect(dhakaDate("2026-11-21T19:30:00Z")).toBe("2026-11-22");
  });
});
