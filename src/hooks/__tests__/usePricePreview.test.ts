// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { usePricePreview } from "../usePricePreview";
import { api } from "../../api/client";
import type { CartInput, PriceBreakdown } from "../../types/pricing";

// A fake breakdown: only `payable` matters for these tests.
function fakeBreakdown(payable: number): PriceBreakdown {
  return {
    lines: [],
    subtotal: payable,
    cartDiscount: null,
    discountedSubtotal: payable,
    vat: 0,
    totalBeforeRounding: payable,
    payable,
    coupon: null,
  };
}

// Make api.getPrice return promises that WE resolve, in any order we like.
function controlGetPrice() {
  const pending: {
    input: CartInput;
    resolve: (payable: number) => void;
    reject: (error: Error) => void;
  }[] = [];

  vi.spyOn(api, "getPrice").mockImplementation(
    (input) =>
      new Promise((resolve, reject) => {
        pending.push({
          input,
          resolve: (payable) =>
            resolve({ breakdown: fakeBreakdown(payable), serverTime: new Date().toISOString() }),
          reject,
        });
      }),
  );
  return pending;
}

const configA: CartInput = { lines: [{ config: { toast: 1 }, qty: 1 }], couponCode: null };
const configB: CartInput = { lines: [{ config: { paratha: 1 }, qty: 1 }], couponCode: null };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("usePricePreview", () => {
  it("debounces: quick changes send only one request", async () => {
    const pending = controlGetPrice();
    const { rerender } = renderHook(({ input }) => usePricePreview(input), {
      initialProps: { input: configA },
    });
    rerender({ input: configB });

    await waitFor(() => expect(pending).toHaveLength(1));
    expect(pending[0].input).toEqual(configB);
  });

  it("TC-12: a late answer for an old config is never shown", async () => {
    const pending = controlGetPrice();
    const { result, rerender } = renderHook(({ input }) => usePricePreview(input), {
      initialProps: { input: configA },
    });
    await waitFor(() => expect(pending).toHaveLength(1)); // request for A sent

    rerender({ input: configB });
    await waitFor(() => expect(pending).toHaveLength(2)); // request for B sent

    // B answers first, then A's old answer arrives late.
    await act(async () => pending[1].resolve(200));
    await act(async () => pending[0].resolve(100));

    expect(result.current.preview).toEqual({ status: "ok", breakdown: fakeBreakdown(200) });
  });

  it("shows loading (not the old price) while the new price is on its way", async () => {
    const pending = controlGetPrice();
    const { result, rerender } = renderHook(({ input }) => usePricePreview(input), {
      initialProps: { input: configA },
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0].resolve(100));
    expect(result.current.preview.status).toBe("ok");

    rerender({ input: configB });

    expect(result.current.preview.status).toBe("loading");
  });

  it("on failure shows the error, and Retry asks again", async () => {
    const pending = controlGetPrice();
    const { result } = renderHook(() => usePricePreview(configA));
    await waitFor(() => expect(pending).toHaveLength(1));

    await act(async () => pending[0].reject(new Error("Could not get a price. Please retry.")));
    expect(result.current.preview).toEqual({
      status: "error",
      message: "Could not get a price. Please retry.",
    });

    act(() => result.current.retry());
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1].resolve(300));

    expect(result.current.preview).toEqual({ status: "ok", breakdown: fakeBreakdown(300) });
  });
});
