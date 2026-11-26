import type { MenuData, ProductConfig } from "../../types/menu";
import type { ApiError, CartItem, CartSnapshot } from "../../types/cart";
import { validate } from "../../engine/rules";
import {
  availableFor,
  findShortages,
  freeStock,
  shortageMessage,
  usageOf,
  type Ingredients,
} from "../../engine/stock";
import { RESERVATION_MS, type Reservation, type ServerState } from "./state";

// Part D - server side of the cart. Each function returns a NEW state and the
// handler saves only at the end, so a failure leaves nothing half done.

export type Result =
  | { ok: true; state: ServerState; itemId?: string }
  | { ok: false; status: number; error: ApiError };

const MAX_ITEM_QTY = 3;

// Mark timed-out reservations expired. They stop holding stock but stay visible.
export function expireReservations(state: ServerState, now: number): ServerState {
  const hasExpired = state.reservations.some(
    (r) => r.status === "active" && r.expiresAt <= now,
  );
  if (!hasExpired) return state;

  return {
    ...state,
    reservations: state.reservations.map((r) =>
      r.status === "active" && r.expiresAt <= now
        ? { ...r, status: "expired" as const }
        : r,
    ),
  };
}

// Free = starting stock - sold - everything held by ACTIVE reservations.
export function freeStockOf(state: ServerState): Ingredients {
  const held = state.reservations
    .filter((r) => r.status === "active")
    .map((r) => r.allocation);
  return freeStock(state.stock, [state.sold, ...held]);
}

// Checks shared by "add" and "edit": quantity range and menu rules.
function checkItem(
  config: ProductConfig,
  qty: number,
  menu: MenuData,
): ApiError | null {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_ITEM_QTY) {
    return { code: "BAD_REQUEST", message: `Quantity must be 1-${MAX_ITEM_QTY}` };
  }
  const violations = validate(config, menu.groups, menu.rules);
  if (violations.length > 0) {
    return {
      code: "INVALID_CONFIG",
      message: violations.map((v) => v.message).join("; "),
      violations,
    };
  }
  return null;
}

// Add to Cart. The same idempotency key returns the same item (no duplicates).
export function reserveItem(
  state: ServerState,
  menu: MenuData,
  input: { idempotencyKey: string; config: ProductConfig; qty: number },
  now: number,
): Result {
  const existingId = state.idempotency[input.idempotencyKey];
  if (existingId) {
    return { ok: true, state, itemId: existingId };
  }

  const problem = checkItem(input.config, input.qty, menu);
  if (problem) return { ok: false, status: 400, error: problem };

  // All or nothing: check EVERY ingredient first, reserve only if all fit.
  const allocation = usageOf(input.config, input.qty, menu);
  const shortages = findShortages(allocation, freeStockOf(state));
  if (shortages.length > 0) {
    return {
      ok: false,
      status: 409,
      error: { code: "OUT_OF_STOCK", message: shortageMessage(shortages), shortages },
    };
  }

  const reservation: Reservation = {
    id: crypto.randomUUID(),
    config: input.config,
    qty: input.qty,
    allocation,
    createdAt: now,
    expiresAt: now + RESERVATION_MS,
    status: "active",
  };

  return {
    ok: true,
    itemId: reservation.id,
    state: {
      ...state,
      reservations: [...state.reservations, reservation],
      idempotency: { ...state.idempotency, [input.idempotencyKey]: reservation.id },
    },
  };
}

// Edit swaps the old allocation for the new one (net difference).
// The expiry is not reset, so editing can't hold stock forever.
export function updateItem(
  state: ServerState,
  menu: MenuData,
  itemId: string,
  input: { config: ProductConfig; qty: number },
): Result {
  const current = state.reservations.find((r) => r.id === itemId);
  if (!current) {
    return { ok: false, status: 404, error: { code: "NOT_FOUND", message: "This item is no longer in the cart" } };
  }
  if (current.status === "expired") {
    return {
      ok: false,
      status: 409,
      error: { code: "EXPIRED", message: "This item's reservation has expired. Remove it and add it again." },
    };
  }

  const problem = checkItem(input.config, input.qty, menu);
  if (problem) return { ok: false, status: 400, error: problem };

  const newAllocation = usageOf(input.config, input.qty, menu);
  const available = availableFor(freeStockOf(state), current.allocation);
  const shortages = findShortages(newAllocation, available);
  if (shortages.length > 0) {
    return {
      ok: false,
      status: 409,
      error: { code: "OUT_OF_STOCK", message: shortageMessage(shortages), shortages },
    };
  }

  return {
    ok: true,
    itemId,
    state: {
      ...state,
      reservations: state.reservations.map((r) =>
        r.id === itemId
          ? { ...r, config: input.config, qty: input.qty, allocation: newAllocation }
          : r,
      ),
    },
  };
}

// Remove releases the stock. Removing a missing item is fine (double click).
export function removeItem(state: ServerState, itemId: string): Result {
  return {
    ok: true,
    state: {
      ...state,
      reservations: state.reservations.filter((r) => r.id !== itemId),
    },
  };
}

// What the browser receives after every cart call.
export function toSnapshot(state: ServerState, now: number): CartSnapshot {
  const items: CartItem[] = state.reservations.map((r) => ({
    id: r.id,
    config: r.config,
    qty: r.qty,
    createdAt: new Date(r.createdAt).toISOString(),
    expiresAt: new Date(r.expiresAt).toISOString(),
    status: r.status,
  }));

  return { items, freeStock: freeStockOf(state), serverTime: new Date(now).toISOString() };
}
