import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { StoredOrder } from "../types/order";

// All orders (seed + new). The chatbot reads from here too, so after a
// checkout we refresh and every answer uses the new data at once.
export function useOrders() {
  const [orders, setOrders] = useState<StoredOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const file = await api.getOrders();
      setOrders(file.orders);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getOrders()
      .then((file) => {
        if (!cancelled) setOrders(file.orders);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { orders, error, refresh };
}
