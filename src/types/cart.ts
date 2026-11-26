import type { ProductConfig } from "./menu";
import type { Ingredients, Shortage } from "../engine/stock";
import type { ValidationViolation } from "./menu";

// One item in the cart, as the server sends it to the browser.
// Every cart item is backed by a server reservation that holds its stock.
export interface CartItem {
  id: string;
  config: ProductConfig;
  qty: number;
  createdAt: string; // ISO, server time
  expiresAt: string; // ISO, server time
  status: "active" | "expired"; // expired = read-only, can only be removed
}

// Every cart response returns the whole cart, so the browser never has to
// patch its own copy. `serverTime` lets the browser compute the clock offset.
export interface CartSnapshot {
  items: CartItem[];
  freeStock: Ingredients;
  serverTime: string;
}

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "INVALID_CONFIG"
  | "OUT_OF_STOCK"
  | "NOT_FOUND"
  | "EXPIRED"
  | "SERVER_ERROR";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  shortages?: Shortage[];
  violations?: ValidationViolation[];
}
