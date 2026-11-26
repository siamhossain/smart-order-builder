// The server clock is 90 s ahead, so countdowns use server time.
// offset = serverTime - middle of the request (cancels most network delay).

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
