import type { MenuData, ProductConfig } from "../../types/menu";
import type { SeedOrder, StoredOrder } from "../../types/order";
import type { Ingredients } from "../../engine/stock";
import seedFile from "../data/orders.seed.json";
import { priceSeedOrders } from "./orders";

export const RESERVATION_MS = 5 * 60 * 1000; // 5 minutes

// A reservation holds stock for one cart item.
// `allocation` is the exact amount it holds, so releasing it gives back
// exactly that much - never more.
export interface Reservation {
  id: string;
  config: ProductConfig;
  qty: number;
  allocation: Ingredients;
  createdAt: number; // ms, server clock
  expiresAt: number; // ms, server clock
  status: "active" | "expired";
}

// Everything the fake server knows. It is a plain object so the cart
// functions can take one state and return a NEW state (never edit in place).
export interface ServerState {
  stock: Ingredients; // starting stock from the menu
  sold: Ingredients; // stock that was paid for (Part E)
  reservations: Reservation[];
  // idempotency key -> reservation id it created
  idempotency: Record<string, string>;
  orders: StoredOrder[];
  // checkout idempotency key -> order id it created
  checkouts: Record<string, string>;
}

// First start: full stock, empty cart, and the seed orders priced by our
// own engine.
export function initialState(menu: MenuData): ServerState {
  return {
    stock: { ...menu.ingredientStock },
    sold: {},
    reservations: [],
    idempotency: {},
    orders: priceSeedOrders(seedFile.orders as SeedOrder[], menu),
    checkouts: {},
  };
}

// ---- Persistence ----
// The "database" is localStorage so the server survives a page refresh.
// In tests (Node) there is no localStorage, so these do nothing.

const STORAGE_KEY = "smart-order-builder:server";

export function loadState(): ServerState | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as ServerState;
    // Saved by an older version without orders: start fresh instead.
    if (!Array.isArray(state.orders)) return null;
    return state;
  } catch {
    return null; // broken JSON or storage blocked: start fresh
  }
}

export function saveState(state: ServerState): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked: keep working in memory
  }
}

export function clearState(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
