// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useCart } from "../useCart";
import { api, ApiRequestError } from "../../api/client";
import type { CartSnapshot } from "../../types/cart";

const snapshot = (eggs: number): CartSnapshot => ({
  items: [],
  freeStock: { egg: eggs },
  serverTime: new Date().toISOString(),
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useCart", () => {
  it("D1: when another tab took the stock, the save fails and the cart reloads", async () => {
    const getCart = vi
      .spyOn(api, "getCart")
      .mockResolvedValueOnce(snapshot(4)) // first load: 4 eggs free
      .mockResolvedValueOnce(snapshot(0)); // other tab took them
    vi.spyOn(api, "updateItem").mockRejectedValue(
      new ApiRequestError({ code: "OUT_OF_STOCK", message: "Short: 2 egg" }, 409),
    );

    const { result } = renderHook(() => useCart());
    await waitFor(() => expect(result.current.cart?.freeStock.egg).toBe(4));

    let error: unknown;
    await act(async () => {
      await result.current.update("item-1", { fried: 2 }, 1).catch((e) => (error = e));
    });

    expect((error as Error).message).toBe("Short: 2 egg"); // shown to the user
    expect(getCart).toHaveBeenCalledTimes(2); // cart reloaded
    expect(result.current.cart?.freeStock.egg).toBe(0); // real stock now
  });

  it("a random server error does not reload the cart", async () => {
    const getCart = vi.spyOn(api, "getCart").mockResolvedValue(snapshot(4));
    vi.spyOn(api, "addItem").mockRejectedValue(
      new ApiRequestError({ code: "SERVER_ERROR", message: "Server error" }, 503),
    );

    const { result } = renderHook(() => useCart());
    await waitFor(() => expect(result.current.cart).not.toBeNull());

    await act(async () => {
      await result.current.add({ fried: 2 }, 1, "key").catch(() => {});
    });

    expect(getCart).toHaveBeenCalledTimes(1);
  });
});
