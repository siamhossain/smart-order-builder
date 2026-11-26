import { describe, expect, it } from "vitest";
import { menuData } from "../../data/menu";
import { itemA, itemB, itemC } from "../../../engine/__tests__/testItems";
import { initialState, RESERVATION_MS, type ServerState } from "../state";
import {
  expireReservations,
  freeStockOf,
  removeItem,
  reserveItem,
  toSnapshot,
  updateItem,
  type Result,
} from "../cart";

const T0 = Date.parse("2026-11-25T10:00:00+06:00");

// Helper: unwrap a successful result or fail the test.
function okState(result: Result): ServerState {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.message}`);
  return result.state;
}

function add(state: ServerState, key: string, config = itemA, qty = 1, now = T0) {
  return reserveItem(state, menuData, { idempotencyKey: key, config, qty }, now);
}

// Cart B x1 + C x2, the one used by TC-08..11.
function cartBC() {
  let state = initialState(menuData);
  state = okState(add(state, "key-b", itemB, 1));
  state = okState(add(state, "key-c", itemC, 2));
  return state;
}

describe("Part D - server cart", () => {
  it("reserving holds the item's stock", () => {
    const state = okState(add(initialState(menuData), "k1"));

    expect(state.reservations).toHaveLength(1);
    expect(freeStockOf(state).egg).toBe(8); // A uses 2 eggs
  });

  it("TC-13: the same idempotency key 3 times creates exactly one item", () => {
    let state = initialState(menuData);
    const ids: (string | undefined)[] = [];

    for (let i = 0; i < 3; i++) {
      const result = add(state, "same-key");
      state = okState(result);
      if (result.ok) ids.push(result.itemId);
    }

    expect(state.reservations).toHaveLength(1);
    expect(new Set(ids).size).toBe(1);
    expect(freeStockOf(state).egg).toBe(8); // reserved once, not three times
  });

  it("TC-14: out of stock reserves nothing at all (no phantom)", () => {
    const before = cartBC();
    const snapshot = JSON.stringify(before);

    const result = add(before, "new-key", itemA); // needs 2 eggs, 0 left

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("Short: 2 egg");
    // Not even the toast or sausage was taken, and the old state is untouched.
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(freeStockOf(before).toast).toBe(20);
  });

  it("TC-14: a failed attempt does not store the key, so Retry works", () => {
    // The handler throws the new state away when the request fails mid-way,
    // so the server still has the OLD state with no key recorded.
    const oldState = initialState(menuData);
    add(oldState, "retry-key"); // result discarded = request failed

    const retry = add(oldState, "retry-key");

    expect(okState(retry).reservations).toHaveLength(1);
  });

  it("invalid configs are rejected with the rule messages", () => {
    const result = add(initialState(menuData), "k", { toast: 1, scrambled: 3, sausage: 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONFIG");
  });

  it("quantity must be 1-3", () => {
    const result = add(initialState(menuData), "k", itemA, 4);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BAD_REQUEST");
  });

  it("TC-10 on the server: edit swaps the allocation in one call", () => {
    const state = cartBC();
    const bId = state.reservations[0].id;

    const next = okState(
      updateItem(state, menuData, bId, { config: { ...itemB, omelette: 1, fried: 3 }, qty: 1 }),
    );

    expect(freeStockOf(next).egg).toBe(1);
    expect(next.reservations).toHaveLength(2);
  });

  it("TC-09 / TC-11 on the server: edits that do not fit are refused", () => {
    const state = cartBC();
    const [b, c] = state.reservations;

    const editB = updateItem(state, menuData, b.id, { config: { ...itemB, omelette: 3, fried: 1 }, qty: 1 });
    const editC = updateItem(state, menuData, c.id, { config: itemC, qty: 3 });

    expect(editB.ok === false && editB.error.message).toBe("Short: 1 egg");
    expect(editC.ok === false && editC.error.message).toBe("Short: 2 egg, 2 cheese");
  });

  it("TC-15: at exactly 5:00 server time the stock is released and the item is read-only", () => {
    const state = okState(add(initialState(menuData), "k1"));
    const item = state.reservations[0];

    const justBefore = expireReservations(state, T0 + RESERVATION_MS - 1);
    expect(justBefore.reservations[0].status).toBe("active");

    const atExpiry = expireReservations(state, T0 + RESERVATION_MS);
    expect(atExpiry.reservations[0].status).toBe("expired");
    expect(freeStockOf(atExpiry).egg).toBe(10); // released

    const edit = updateItem(atExpiry, menuData, item.id, { config: itemA, qty: 2 });
    expect(edit.ok === false && edit.error.code).toBe("EXPIRED");

    // ...but it can still be removed.
    expect(okState(removeItem(atExpiry, item.id)).reservations).toHaveLength(0);
  });

  it("editing does not reset the 5-minute timer", () => {
    const state = okState(add(initialState(menuData), "k1"));
    const item = state.reservations[0];

    const edited = okState(updateItem(state, menuData, item.id, { config: itemA, qty: 2 }));

    expect(edited.reservations[0].expiresAt).toBe(item.expiresAt);
  });

  it("removing releases the stock, and removing twice is fine", () => {
    const state = okState(add(initialState(menuData), "k1"));
    const id = state.reservations[0].id;

    const once = okState(removeItem(state, id));
    const twice = okState(removeItem(once, id));

    expect(freeStockOf(twice).egg).toBe(10);
  });

  it("snapshot sends ISO server times and free stock", () => {
    const state = okState(add(initialState(menuData), "k1"));
    const snapshot = toSnapshot(state, T0);

    expect(snapshot.serverTime).toBe(new Date(T0).toISOString());
    expect(snapshot.items[0].expiresAt).toBe(new Date(T0 + RESERVATION_MS).toISOString());
    expect(snapshot.freeStock.egg).toBe(8);
  });
});
