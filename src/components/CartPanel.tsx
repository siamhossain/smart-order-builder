import { useEffect, useRef, useState } from "react";
import type { MenuData } from "../types/menu";
import type { CartItem, CartSnapshot } from "../types/cart";
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
}: Props) {
  const now = useNow(1000);
  const [removeError, setRemoveError] = useState<string | null>(null);

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
        </>
      )}
    </section>
  );
}
