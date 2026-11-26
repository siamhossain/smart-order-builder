// The browser's clock and the server's clock are different (the mock server
// runs 90 s ahead). Countdowns and expiry must use SERVER time.
//
// offset = serverTime - browserTime. Then: server now = Date.now() + offset.
//
// The response takes some time to arrive, so we compare serverTime with the
// MIDDLE of the request (between sending and receiving). That cancels most of
// the network delay.

export function computeOffset(
  serverTimeIso: string,
  sentAt: number,
  receivedAt: number,
): number {
  const browserMidpoint = (sentAt + receivedAt) / 2;
  return Date.parse(serverTimeIso) - browserMidpoint;
}

// Milliseconds left until `expiresAtIso` (server time). Never below 0.
export function msUntil(
  expiresAtIso: string,
  offset: number,
  browserNow: number = Date.now(),
): number {
  const serverNow = browserNow + offset;
  return Math.max(0, Date.parse(expiresAtIso) - serverNow);
}

// 125000 -> "2:05"
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
