import { useCallback, useEffect, useState } from "react";
import { api, ApiRequestError, errorMessage } from "../api/client";
import type { CartSnapshot } from "../types/cart";
import type { ProductConfig } from "../types/menu";
import type { PaymentMethod } from "../types/order";

// The cart lives on the server. We only keep the LAST snapshot it sent us,
// and every action replaces it with the server's new snapshot.
export function useCart() {
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCart(await api.getCart());
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  // First load. (State is only set inside the promise callbacks.)
  useEffect(() => {
    let cancelled = false;
    api
      .getCart()
      .then((snapshot) => {
        if (!cancelled) setCart(snapshot);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // D1: if the server says our view is out of date (another tab took the
  // stock, the item expired or is gone), reload the cart so the screen shows
  // the real stock and status. The error is still thrown so the builder can
  // show it - and the user's configuration stays in the builder.
  const reloadIfStale = useCallback(
    async (error: unknown) => {
      if (
        error instanceof ApiRequestError &&
        ["OUT_OF_STOCK", "EXPIRED", "NOT_FOUND"].includes(error.code)
      ) {
        await refresh();
      }
      throw error;
    },
    [refresh],
  );

  // add / update throw on failure so the builder can show the error + Retry.
  const add = useCallback(
    async (config: ProductConfig, qty: number, idempotencyKey: string) => {
      try {
        setCart(await api.addItem(config, qty, idempotencyKey));
      } catch (error) {
        await reloadIfStale(error);
      }
    },
    [reloadIfStale],
  );

  const update = useCallback(
    async (itemId: string, config: ProductConfig, qty: number) => {
      try {
        setCart(await api.updateItem(itemId, config, qty));
      } catch (error) {
        await reloadIfStale(error);
      }
    },
    [reloadIfStale],
  );

  const remove = useCallback(async (itemId: string) => {
    setCart(await api.removeItem(itemId));
  }, []);

  // Pay. Returns the new order; the server also sends back the empty cart.
  const checkout = useCallback(
    async (paymentMethod: PaymentMethod, couponCode: string | null, idempotencyKey: string) => {
      const result = await api.checkout(paymentMethod, couponCode, idempotencyKey);
      setCart(result.cart);
      return result.order;
    },
    [],
  );

  return { cart, loadError, refresh, add, update, remove, checkout };
}
