import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { CartInput, PriceBreakdown } from "../types/pricing";

export type PricePreview =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; breakdown: PriceBreakdown }
  | { status: "error"; message: string };

// A finished request, tagged with the exact request it answers.
type Answer =
  | { key: string; status: "ok"; breakdown: PriceBreakdown }
  | { key: string; status: "error"; message: string };

const DEBOUNCE_MS = 300;

// Live price from /price.
// - 300 ms debounce
// - only an answer whose key matches the CURRENT config is shown; old requests are aborted
// - on failure show Retry (the config lives in the builder, so it's kept)
export function usePricePreview(input: CartInput | null) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Compare by content, so a new object with the same config does not refetch.
  const inputJson = input ? JSON.stringify(input) : null;
  const requestKey = inputJson === null ? null : `${inputJson}#${retryCount}`;

  useEffect(() => {
    if (inputJson === null || requestKey === null) return;

    const requestInput = JSON.parse(inputJson) as CartInput;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const { breakdown } = await api.getPrice(requestInput, controller.signal);
        // Stale answer for an old config: drop it.
        if (controller.signal.aborted) return;
        setAnswer({ key: requestKey, status: "ok", breakdown });
      } catch (error) {
        if (controller.signal.aborted) return; // we cancelled it ourselves
        setAnswer({ key: requestKey, status: "error", message: errorMessage(error) });
      }
    }, DEBOUNCE_MS);

    // Runs when the input changes again (or the component unmounts).
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [inputJson, requestKey]);

  // Work out what to show from the current key and the last answer.
  let preview: PricePreview;
  if (requestKey === null) preview = { status: "idle" };
  else if (answer === null || answer.key !== requestKey) preview = { status: "loading" };
  else if (answer.status === "ok") preview = { status: "ok", breakdown: answer.breakdown };
  else preview = { status: "error", message: answer.message };

  return {
    preview,
    retry: () => setRetryCount((n) => n + 1),
  };
}
