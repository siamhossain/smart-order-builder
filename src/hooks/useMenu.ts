import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { MenuData } from "../types/menu";

// The whole menu (groups, rules, stock, promotions) comes from the API.
export function useMenu() {
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // bump to retry

  useEffect(() => {
    let cancelled = false;
    api
      .getMenu()
      .then((data) => {
        if (cancelled) return;
        setMenu(data.menu);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { menu, error, retry: () => setAttempt((n) => n + 1) };
}
