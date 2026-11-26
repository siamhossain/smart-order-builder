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

// Live price from the mock /price endpoint while the user configures.
//
// Three problems to solve:
// 1. Too many requests: wait 300 ms after the LAST change (debounce).
// 2. Old answers arriving late: every answer is stored WITH the key of the
//    request it belongs to (the config as JSON + retry number). We only show
//    an answer whose key equals the CURRENT key, so an older configuration's
//    price can never be displayed. We also abort the old request, so most
//    stale answers never even arrive.
// 3. Failures (15%): show an error with Retry; the configuration is kept
//    because it lives in the builder, not here.
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
        // The config changed while we waited: this answer is stale, drop it
        // so it can't replace the newer config's answer.
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
