// The brief says the mock server's clock runs 90 seconds AHEAD of the browser.
// We fake that here. The browser must never assume the two clocks match:
// it reads `serverTime` from responses and computes the offset itself.
export const SERVER_CLOCK_AHEAD_MS = 90_000;

export function serverNow(): number {
  return Date.now() + SERVER_CLOCK_AHEAD_MS;
}
