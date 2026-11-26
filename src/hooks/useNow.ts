import { useEffect, useState } from "react";

// Re-render every `intervalMs` with the current browser time.
// Used by countdowns; they add the server clock offset themselves.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
