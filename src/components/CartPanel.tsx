import { useEffect, useRef, useState } from "react";
import type { MenuData } from "../types/menu";
import type { CartItem, CartSnapshot } from "../types/cart";
import { PAYMENT_METHODS, type PaymentMethod, type StoredOrder } from "../types/order";
import { priceCart, priceLine } from "../engine/pricing";
import { formatBDT } from "../engine/money";
import { formatCountdown, msUntil } from "../api/serverClock";
import { errorMessage } from "../api/client";
import { useNow } from "../hooks/useNow";
import { PriceBreakdownView } from "./PriceBreakdownView";
import { describeConfig } from "./format";

interface Props {
  menu: MenuData;
  cart: CartSnapshot;
  clockOffset: number;
  editingItemId: string | null;
  couponCode: string;
  onCouponChange: (code: string) => void;
  onEdit: (item: CartItem) => void;
  onRemove: (itemId: string) => Promise<void>;
  onRefresh: () => void;
  onPay: (paymentMethod: PaymentMethod, couponCode: string | null, idempotencyKey: string) => Promise<StoredOrder>;
}

export function CartPanel({
  menu,
  cart,
  clockOffset,
  editingItemId,
  couponCode,
  onCouponChange,
  onEdit,
  onRemove,
  onRefresh,
  onPay,
}: Props) {
  const now = useNow(1000);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<StoredOrder | null>(null);

  // D4: same protection as Add to Cart. The ref blocks fast double clicks
  // in the browser, and the idempotency key makes the server return the
  // same order if a second request still gets through (or on Retry).
  const payInFlight = useRef(false);
  const checkoutKey = useRef<string | null>(null);

  async function pay() {
    if (payInFlight.current) return;
    payInFlight.current = true;
    setPaying(true);
    setPayError(null);
    try {
      checkoutKey.current ??= crypto.randomUUID();
      const order = await onPay(paymentMethod, couponCode.trim() || null, checkoutKey.current);
      checkoutKey.current = null;
      setLastOrder(order);
      onCouponChange("");
    } catch (error) {
      setPayError(errorMessage(error));
    } finally {
      payInFlight.current = false;
      setPaying(false);
    }
  }

  // An item is expired if the server says so, or if its countdown (in server
  // time) has reached 0 and the server hasn't told us yet.
  function isExpired(item: CartItem) {
    return item.status === "expired" || msUntil(item.expiresAt, clockOffset, now) === 0;
  }

  // When a countdown hits 0, ask the server once so it releases the stock
  // and sends the real state back.
  const askedAbout = useRef(new Set<string>());
  useEffect(() => {
    for (const item of cart.items) {
      if (item.status === "active" && isExpired(item) && !askedAbout.current.has(item.id)) {
        askedAbout.current.add(item.id);
        onRefresh();
      }
    }
  });

  const activeItems = cart.items.filter((item) => !isExpired(item));

  // Cart total uses the same pure pricing engine, at SERVER time. The final
  // price is calculated again by the server at checkout.
  const breakdown =
    activeItems.length > 0
      ? priceCart(
          {
            lines: activeItems.map((item) => ({ config: item.config, qty: item.qty })),
            couponCode: couponCode.trim() || null,
          },
          menu,
          menu.pricing,
          new Date(now + clockOffset),
        )
      : null;

  async function remove(itemId: string) {
    setRemoveError(null);
    try {
      await onRemove(itemId);
    } catch (error) {
      setRemoveError(errorMessage(error));
    }
  }

  return (
    <section className="panel">
      <h2>Cart</h2>

      {lastOrder && (
        <p className="notice ok" role="status">
          Order {lastOrder.id} placed: ৳ {formatBDT(lastOrder.totals.payable)} by{" "}
          {lastOrder.paymentMethod}.
        </p>
      )}

      {cart.items.length === 0 && <p className="muted">Your cart is empty.</p>}

      <ul className="cart-items">
        {cart.items.map((item) => {
          const expired = isExpired(item);
          const unit = priceLine(item.config, 1, menu, menu.pricing.unitPromotions).unitPrice;

          return (
            <li key={item.id} className={expired ? "cart-item expired" : "cart-item"}>
              <div>
                <strong>
                  {item.qty} × ৳ {formatBDT(unit)}
                </strong>{" "}
                {editingItemId === item.id && <span className="badge">editing</span>}
                <div className="muted small">{describeConfig(item.config, menu)}</div>
              </div>
              <div className="cart-item-side">
                {expired ? (
                  <span className="badge warn">Expired, read-only</span>
                ) : (
                  <span className="countdown" title="Reservation time left (server time)">
                    ⏱ {formatCountdown(msUntil(item.expiresAt, clockOffset, now))}
                  </span>
                )}
                <button type="button" disabled={expired} onClick={() => onEdit(item)}>
                  Edit
                </button>
                <button type="button" onClick={() => remove(item.id)}>
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {removeError && <p className="notice error">{removeError}</p>}

      {cart.items.length > 0 && (
        <>
          <label className="coupon">
            Coupon{" "}
            <input
              value={couponCode}
              onChange={(e) => onCouponChange(e.target.value)}
              placeholder="e.g. MORNING15"
            />
          </label>
          {breakdown?.coupon && (
            <p className={breakdown.coupon.status === "applied" ? "notice ok" : "notice warn"}>
              {breakdown.coupon.message}
            </p>
          )}
          {breakdown ? (
            <PriceBreakdownView breakdown={breakdown} menu={menu} showLines={false} />
          ) : (
            <p className="muted">No active items to pay for.</p>
          )}

          <div className="actions">
            <label>
              Payment{" "}
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="primary"
              disabled={activeItems.length === 0 || paying}
              onClick={pay}
            >
              {paying ? "Paying…" : breakdown ? `Pay ৳ ${formatBDT(breakdown.payable)}` : "Pay"}
            </button>
          </div>
          <p className="muted small">
            The final price is calculated by the server at the moment you pay.
          </p>

          {payError && (
            <p className="notice error" role="alert">
              {payError}{" "}
              <button type="button" onClick={pay} disabled={paying}>
                Retry
              </button>
            </p>
          )}
        </>
      )}
    </section>
  );
}
