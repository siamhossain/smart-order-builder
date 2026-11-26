import { delay, http, HttpResponse } from "msw";
import { menuData } from "./data/menu";
import { priceCart } from "../engine/pricing";
import type { ApiError } from "../types/cart";
import type { CartInput } from "../types/pricing";
import type { ProductConfig } from "../types/menu";
import { serverNow } from "./server/clock";
import {
  clearState,
  initialState,
  loadState,
  saveState,
  type ServerState,
} from "./server/state";
import {
  expireReservations,
  removeItem,
  reserveItem,
  toSnapshot,
  updateItem,
  type Result,
} from "./server/cart";

// Simulated network problems (Part C and D of the brief).
const PRICE_FAIL_RATE = 0.15; // brief: 15% of /price calls fail
const CART_FAIL_RATE = 0.1; // our choice, so Retry on add/edit gets exercised

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function errorResponse(status: number, error: ApiError) {
  return HttpResponse.json({ error, serverTime: new Date(serverNow()).toISOString() }, { status });
}

// ---- The "database" ----
let db: ServerState = loadState() ?? initialState(menuData);

// Read the state with expired reservations already released.
function currentState(now: number): ServerState {
  return expireReservations(db, now);
}

// The ONLY place the state is replaced and saved. Everything before this
// works on copies, so a failure earlier leaves the old state untouched.
function commit(next: ServerState): void {
  db = next;
  saveState(next);
}

// Run a cart change. We fail randomly AFTER the work is done but BEFORE
// commit, which is exactly the "fails mid-way" case: nothing is saved.
async function runCartChange(change: (state: ServerState, now: number) => Result) {
  await delay(randomBetween(200, 700));
  const now = serverNow();
  const result = change(currentState(now), now);

  if (!result.ok) return errorResponse(result.status, result.error);

  if (Math.random() < CART_FAIL_RATE) {
    return errorResponse(503, { code: "SERVER_ERROR", message: "Server error, nothing was saved. Please retry." });
  }

  commit(result.state);
  return HttpResponse.json({ ...toSnapshot(result.state, now), itemId: result.itemId });
}

export const handlers = [
  http.get("/api/menu", async () => {
    await delay(randomBetween(100, 300));
    return HttpResponse.json({ menu: menuData, serverTime: new Date(serverNow()).toISOString() });
  }),

  http.get("/api/cart", async () => {
    await delay(randomBetween(100, 300));
    const now = serverNow();
    const state = currentState(now);
    commit(state); // save any expiries we just applied
    return HttpResponse.json(toSnapshot(state, now));
  }),

  http.post("/api/cart/items", async ({ request }) => {
    const body = (await request.json()) as {
      idempotencyKey?: string;
      config?: ProductConfig;
      qty?: number;
    };
    if (!body.idempotencyKey || !body.config || body.qty === undefined) {
      return errorResponse(400, { code: "BAD_REQUEST", message: "idempotencyKey, config and qty are required" });
    }
    const input = { idempotencyKey: body.idempotencyKey, config: body.config, qty: body.qty };

    return runCartChange((state, now) => reserveItem(state, menuData, input, now));
  }),

  http.put("/api/cart/items/:id", async ({ request, params }) => {
    const body = (await request.json()) as { config?: ProductConfig; qty?: number };
    if (!body.config || body.qty === undefined) {
      return errorResponse(400, { code: "BAD_REQUEST", message: "config and qty are required" });
    }
    const input = { config: body.config, qty: body.qty };

    return runCartChange((state) => updateItem(state, menuData, String(params.id), input));
  }),

  http.delete("/api/cart/items/:id", async ({ params }) => {
    await delay(randomBetween(100, 300));
    const now = serverNow();
    const result = removeItem(currentState(now), String(params.id));
    if (!result.ok) return errorResponse(result.status, result.error);
    commit(result.state);
    return HttpResponse.json(toSnapshot(result.state, now));
  }),

  // Price preview while configuring. Slow and unreliable on purpose.
  http.post("/api/price", async ({ request }) => {
    const body = (await request.json()) as CartInput;
    await delay(randomBetween(200, 1500));

    if (Math.random() < PRICE_FAIL_RATE) {
      return errorResponse(503, { code: "SERVER_ERROR", message: "Could not get a price. Please retry." });
    }

    const now = serverNow();
    const breakdown = priceCart(body, menuData, menuData.pricing, new Date(now));
    return HttpResponse.json({ breakdown, serverTime: new Date(now).toISOString() });
  }),

  // Dev helper: start again with full stock and an empty cart.
  http.post("/api/dev/reset", () => {
    clearState();
    db = initialState(menuData);
    return HttpResponse.json({ ok: true });
  }),
];
