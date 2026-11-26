import { describe, expect, it } from "vitest";
import { computeOffset, formatCountdown, msUntil } from "../serverClock";

describe("server clock offset", () => {
  it("finds the 90 s offset using the middle of the request", () => {
    const sentAt = 1_000_000;
    const receivedAt = 1_000_400; // 400 ms round trip
    // Server answered at the midpoint (1_000_200) on a clock 90 s ahead.
    const serverTime = new Date(1_000_200 + 90_000).toISOString();

    expect(computeOffset(serverTime, sentAt, receivedAt)).toBe(90_000);
  });

  it("TC-15: countdown follows server time, not the browser clock", () => {
    const offset = 90_000;
    const browserNow = Date.parse("2026-11-25T04:00:00Z");
    // Item created at server time browserNow + 90 s, lives 5 minutes.
    const expiresAt = new Date(browserNow + offset + 5 * 60_000).toISOString();

    // Using the offset: a full 5:00 left.
    expect(msUntil(expiresAt, offset, browserNow)).toBe(5 * 60_000);
    // Wrongly using Date.now() alone would show 6:30.
    expect(msUntil(expiresAt, 0, browserNow)).toBe(6 * 60_000 + 30_000);
  });

  it("never goes below zero", () => {
    expect(msUntil("2026-01-01T00:00:00Z", 0, Date.parse("2026-02-01T00:00:00Z"))).toBe(0);
  });

  it("formats mm:ss", () => {
    expect(formatCountdown(300_000)).toBe("5:00");
    expect(formatCountdown(125_000)).toBe("2:05");
    expect(formatCountdown(400)).toBe("0:01");
    expect(formatCountdown(0)).toBe("0:00");
  });
});
