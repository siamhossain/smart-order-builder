// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "../handlers";
import { itemA } from "../../engine/__tests__/testItems";

const server = setupServer(...handlers);
const BASE = "http://localhost:3000";

function post(path: string, body: unknown) {
  return fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(async () => {
  // 0.5 is above every failure rate, so no random failures in these tests.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  await post("/api/dev/reset", {});
});
afterEach(() => vi.restoreAllMocks());

describe("mock API over HTTP", () => {
  it("TC-13: three quick Add to Cart clicks create one item", async () => {
    const body = { idempotencyKey: "click-1", config: itemA, qty: 1 };

    const responses = await Promise.all([
      post("/api/cart/items", body),
      post("/api/cart/items", body),
      post("/api/cart/items", body),
    ]);
    const cart = await (await fetch(BASE + "/api/cart")).json();

    expect(responses.every((r) => r.ok)).toBe(true);
    expect(cart.items).toHaveLength(1);
    expect(cart.freeStock.egg).toBe(8);
  });

  it("TC-14: a failure mid-way saves nothing, and Retry with the same key works", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.05); // below 10%: fail
    const body = { idempotencyKey: "click-2", config: itemA, qty: 1 };

    const failed = await post("/api/cart/items", body);
    expect(failed.status).toBe(503);
    expect((await (await fetch(BASE + "/api/cart")).json()).freeStock.egg).toBe(10);

    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const retry = await post("/api/cart/items", body);
    const cart = await retry.json();

    expect(retry.ok).toBe(true);
    expect(cart.items).toHaveLength(1);
  });

  it("every response carries serverTime about 90 s ahead", async () => {
    const before = Date.now();
    const cart = await (await fetch(BASE + "/api/cart")).json();
    const ahead = Date.parse(cart.serverTime) - before;

    expect(ahead).toBeGreaterThanOrEqual(90_000);
    expect(ahead).toBeLessThan(92_000);
  });

  it("/api/price returns the breakdown", async () => {
    const res = await post("/api/price", { lines: [{ config: itemA, qty: 1 }], couponCode: null });
    const data = await res.json();

    expect(data.breakdown.lines[0].unitPrice).toBe(38000);
  });
});
