import type { MenuData, ProductConfig } from "../types/menu";
import type { ApiError, ApiErrorCode, CartSnapshot } from "../types/cart";
import type { CartInput, PriceBreakdown } from "../types/pricing";
import type { Shortage } from "../engine/stock";
import { computeOffset } from "./serverClock";

// Small fetch wrappers. Every response that has `serverTime` updates the
// clock offset, so the browser always knows the server's time.

let clockOffset = 0;

// server time = Date.now() + getClockOffset()
export function getClockOffset(): number {
  return clockOffset;
}

export class ApiRequestError extends Error {
  code: ApiErrorCode;
  status: number;
  shortages?: Shortage[];

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.code = error.code;
    this.status = status;
    this.shortages = error.shortages;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const sentAt = Date.now();
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // A cancelled request is not a network problem; let the caller see it.
    if (init.signal?.aborted) throw error;
    throw new ApiRequestError(
      { code: "NETWORK", message: "Network error. Check your connection and retry." },
      0,
    );
  }

  const receivedAt = Date.now();
  const data = await response.json().catch(() => ({}));

  if (typeof data.serverTime === "string") {
    clockOffset = computeOffset(data.serverTime, sentAt, receivedAt);
  }

  if (!response.ok) {
    const error: ApiError = data.error ?? {
      code: "SERVER_ERROR",
      message: `Request failed (${response.status})`,
    };
    throw new ApiRequestError(error, response.status);
  }

  return data as T;
}

function send<T>(method: string, path: string, body?: unknown, signal?: AbortSignal) {
  return request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

export const api = {
  getMenu: () => request<{ menu: MenuData; serverTime: string }>("/api/menu"),

  getCart: () => request<CartSnapshot>("/api/cart"),

  addItem: (config: ProductConfig, qty: number, idempotencyKey: string) =>
    send<CartSnapshot>("POST", "/api/cart/items", { config, qty, idempotencyKey }),

  updateItem: (itemId: string, config: ProductConfig, qty: number) =>
    send<CartSnapshot>("PUT", `/api/cart/items/${itemId}`, { config, qty }),

  removeItem: (itemId: string) =>
    send<CartSnapshot>("DELETE", `/api/cart/items/${itemId}`),

  getPrice: (input: CartInput, signal?: AbortSignal) =>
    send<{ breakdown: PriceBreakdown; serverTime: string }>("POST", "/api/price", input, signal),
};

// Turn any thrown value into a message for the screen.
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
