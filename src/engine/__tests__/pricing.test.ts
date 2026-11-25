import { describe, expect, it } from "vitest";
import { menuData } from "../../mocks/data/menu";
import { isBeforeTimeOfDay, priceCart, priceLine } from "../pricing";
import type { ProductConfig } from "../../types/menu";
import type { CartInput } from "../../types/pricing";
import { itemA, itemB, itemC } from "./testItems";

const promos = menuData.pricing;

function unitPrice(config: ProductConfig) {
  return priceLine(config, 1, menuData, promos.unitPromotions).unitPrice;
}

// Dhaka is UTC+6, so we write times with +06:00.
const at = (hhmmss: string) => new Date(`2026-11-25T${hhmmss}+06:00`);

// TC-06 / TC-07 cart: B x1 + C x2, with the coupon typed in.
const cartBC: CartInput = {
  lines: [
    { config: itemB, qty: 1 },
    { config: itemC, qty: 2 },
  ],
  couponCode: "MORNING15",
};

describe("Part C - pricing engine", () => {
  it("TC-05: unit prices of A, B and C", () => {
    expect(unitPrice(itemA)).toBe(38000); // 380.00
    expect(unitPrice(itemB)).toBe(67950); // 679.50
    expect(unitPrice(itemC)).toBe(49000); // 490.00
  });

  it("B gets the 10% combo (4 egg units, 2 proteins)", () => {
    const line = priceLine(itemB, 1, menuData, promos.unitPromotions);

    expect(line.unitBase).toBe(75500);
    expect(line.unitDiscounts).toEqual([{ promotionId: "P1", amount: 7550 }]);
  });

  it("C gets the cheapest of 4 extras free (Baked Beans)", () => {
    const line = priceLine(itemC, 1, menuData, promos.unitPromotions);

    expect(line.unitBase).toBe(51500);
    expect(line.unitDiscounts).toEqual([{ promotionId: "P2", amount: 2500 }]);
  });

  it("TC-06: B x1 + C x2 at 10:59:59, MORNING15 wins", () => {
    const result = priceCart(cartBC, menuData, promos, at("10:59:59"));

    expect(result.subtotal).toBe(165950);
    expect(result.cartDiscount).toEqual({ promotionId: "C2", amount: 15000 });
    expect(result.vat).toBe(7548);
    expect(result.payable).toBe(158500);
    expect(result.coupon?.status).toBe("applied");
  });

  it("TC-07: same cart at 11:00:00, coupon rejected, C1 applies", () => {
    const result = priceCart(cartBC, menuData, promos, at("11:00:00"));

    expect(result.subtotal).toBe(165950);
    expect(result.cartDiscount).toEqual({ promotionId: "C1", amount: 10000 });
    expect(result.vat).toBe(7798);
    expect(result.payable).toBe(163700);
    expect(result.coupon?.status).toBe("expired");
  });

  it("on a tie the promotion listed first (C1) wins; coupon is notBest", () => {
    // With the real menu a valid coupon always beats C1 (15% of >= 1,200 is
    // >= 180, capped at 150, which is more than 100), so we make a custom C1
    // worth exactly 150 to test the tie rule.
    const tiePromos = {
      ...promos,
      cartPromotions: [
        { id: "C1", type: "cartAmountOff" as const, minSubtotal: 0, amountOff: 15000 },
        promos.cartPromotions[1],
      ],
    };
    const result = priceCart(cartBC, menuData, tiePromos, at("09:00:00"));

    expect(result.cartDiscount).toEqual({ promotionId: "C1", amount: 15000 });
    expect(result.coupon?.status).toBe("notBest");
  });

  it("no coupon and small subtotal: no cart discount", () => {
    const result = priceCart(
      { lines: [{ config: itemA, qty: 1 }], couponCode: null },
      menuData,
      promos,
      at("09:00:00"),
    );

    expect(result.cartDiscount).toBeNull();
    expect(result.coupon).toBeNull();
    expect(result.vat).toBe(1900);
    expect(result.payable).toBe(39900);
  });

  it("an unknown coupon code is reported, not applied", () => {
    const result = priceCart(
      { lines: [{ config: itemA, qty: 1 }], couponCode: "FREEFOOD" },
      menuData,
      promos,
      at("09:00:00"),
    );

    expect(result.cartDiscount).toBeNull();
    expect(result.coupon?.status).toBe("unknown");
  });

  it("coupon code is trimmed and case-insensitive", () => {
    const result = priceCart(
      { ...cartBC, couponCode: "  morning15 " },
      menuData,
      promos,
      at("10:00:00"),
    );

    expect(result.cartDiscount?.promotionId).toBe("C2");
  });
});

describe("isBeforeTimeOfDay", () => {
  it("uses Dhaka wall-clock time, strictly before", () => {
    expect(isBeforeTimeOfDay(at("10:59:59"), "11:00", "Asia/Dhaka")).toBe(true);
    expect(isBeforeTimeOfDay(at("11:00:00"), "11:00", "Asia/Dhaka")).toBe(false);
    // 04:59:59 UTC is 10:59:59 in Dhaka
    const utc = new Date("2026-11-25T04:59:59Z");
    expect(isBeforeTimeOfDay(utc, "11:00", "Asia/Dhaka")).toBe(true);
  });
});
