import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { CartSnapshot } from "../types/cart";
import type { ProductConfig } from "../types/menu";

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

  // add / update throw on failure so the builder can show the error + Retry.
  const add = useCallback(
    async (config: ProductConfig, qty: number, idempotencyKey: string) => {
      setCart(await api.addItem(config, qty, idempotencyKey));
    },
    [],
  );

  const update = useCallback(
    async (itemId: string, config: ProductConfig, qty: number) => {
      setCart(await api.updateItem(itemId, config, qty));
    },
    [],
  );

  const remove = useCallback(async (itemId: string) => {
    setCart(await api.removeItem(itemId));
  }, []);

  return { cart, loadError, refresh, add, update, remove };
}
