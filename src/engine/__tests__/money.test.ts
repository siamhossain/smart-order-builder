import { describe, expect, it } from "vitest";
import { formatBDT, percentOf, roundToWholeTaka } from "../money";

describe("money helpers", () => {
  it("percentOf rounds half-up to the nearest poisha", () => {
    expect(percentOf(150950, 5)).toBe(7548); // 75.475 -> 75.48 (TC-06 VAT)
    expect(percentOf(155950, 5)).toBe(7798); // 77.975 -> 77.98 (TC-07 VAT)
    expect(percentOf(165950, 15)).toBe(24893); // 248.925 -> 248.93
    expect(percentOf(100, 5)).toBe(5);
    expect(percentOf(0, 15)).toBe(0);
  });

  it("roundToWholeTaka rounds half-up", () => {
    expect(roundToWholeTaka(158498)).toBe(158500); // 1584.98 -> 1585
    expect(roundToWholeTaka(163748)).toBe(163700); // 1637.48 -> 1637
    expect(roundToWholeTaka(100050)).toBe(100100); // .50 goes up
    expect(roundToWholeTaka(100049)).toBe(100000);
  });

  it("formatBDT shows taka with two decimals", () => {
    expect(formatBDT(165950)).toBe("1,659.50");
    expect(formatBDT(38000)).toBe("380.00");
    expect(formatBDT(5)).toBe("0.05");
  });
});
