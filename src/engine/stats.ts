import type { MenuData, Poisha } from "../types/menu";
import type { PaymentMethod, StoredOrder } from "../types/order";
import { PAYMENT_METHODS } from "../types/order";

// Part F - sales statistics. Pure functions over the stored orders.
// The chatbot NEVER calculates anything: Gemini picks one of these, our code
// runs it, and Gemini only puts the result into a sentence.

export function countOrders(orders: StoredOrder[]): number {
  return orders.length;
}

export function totalRevenue(orders: StoredOrder[]): Poisha {
  return orders.reduce((sum, order) => sum + order.totals.payable, 0);
}

// Integer poisha, rounded half-up. 499500 / 6 = 83250 (832.50 BDT).
export function averageOrderValue(orders: StoredOrder[]): Poisha {
  if (orders.length === 0) return 0;
  return Math.round(totalRevenue(orders) / orders.length);
}

export interface OptionUnits {
  optionId: string;
  name: string;
  units: number;
}

// Units sold per option = line quantity x option quantity, summed.
// ORD-1003 line 1 is qty 2 with Fried x2 -> 4 Fried units.
// Sorted best first; ties keep menu order.
export function unitsByOption(orders: StoredOrder[], menu: MenuData): OptionUnits[] {
  const result: OptionUnits[] = [];

  for (const group of menu.groups) {
    for (const option of group.options) {
      let units = 0;
      for (const order of orders) {
        for (const line of order.lines) {
          units += line.qty * (line.options[option.id] ?? 0);
        }
      }
      result.push({ optionId: option.id, name: option.name, units });
    }
  }

  return result.sort((a, b) => b.units - a.units);
}

// The best seller(s). Returns more than one only on a tie.
export function bestSellingOptions(orders: StoredOrder[], menu: MenuData): OptionUnits[] {
  const ranked = unitsByOption(orders, menu);
  if (ranked.length === 0 || ranked[0].units === 0) return [];
  return ranked.filter((o) => o.units === ranked[0].units);
}

export interface MethodRevenue {
  method: PaymentMethod;
  revenue: Poisha;
  orderCount: number;
}

export function revenueByPaymentMethod(orders: StoredOrder[]): MethodRevenue[] {
  return PAYMENT_METHODS.map((method) => {
    const matching = orders.filter((o) => o.paymentMethod === method);
    return { method, revenue: totalRevenue(matching), orderCount: matching.length };
  }).sort((a, b) => b.revenue - a.revenue);
}

export interface CouponUsage {
  code: string;
  ordersWithCode: number;
  appliedCount: number;
  // Orders where the code was typed but the discount was not given, and why.
  notApplied: { orderId: string; status: string; reason: string }[];
}

// "How many orders actually got the coupon?" - uses the stored coupon result,
// so it is exactly what the pricing engine decided at order time.
export function couponUsage(orders: StoredOrder[], code: string): CouponUsage {
  const wanted = code.trim().toUpperCase();
  const withCode = orders.filter((o) => o.couponCode?.trim().toUpperCase() === wanted);
  const applied = withCode.filter((o) => o.coupon?.status === "applied");

  return {
    code: wanted,
    ordersWithCode: withCode.length,
    appliedCount: applied.length,
    notApplied: withCode
      .filter((o) => o.coupon?.status !== "applied")
      .map((o) => ({
        orderId: o.id,
        status: o.coupon?.status ?? "unknown",
        reason: o.coupon?.message ?? "No coupon result stored",
      })),
  };
}

// "2026-11-21" for an ISO time, using Dhaka's calendar (UTC+6), so an order
// at 01:00 Dhaka time counts on the right day.
export function dhakaDate(iso: string): string {
  // en-CA formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date(iso));
}

export function ordersOnDate(orders: StoredOrder[], date: string): StoredOrder[] {
  return orders.filter((o) => dhakaDate(o.createdAt) === date);
}
