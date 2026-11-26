import { useState } from "react";
import { useMenu } from "./hooks/useMenu";
import { useCart } from "./hooks/useCart";
import { getClockOffset } from "./api/client";
import { Builder } from "./components/Builder";
import { CartPanel } from "./components/CartPanel";
import { OrdersPanel } from "./components/OrdersPanel";
import { useOrders } from "./hooks/useOrders";
import type { CartItem } from "./types/cart";

function App() {
  const { menu, error: menuError, retry: retryMenu } = useMenu();
  const { cart, loadError, refresh, add, update, remove, checkout } = useCart();
  const { orders, refresh: refreshOrders } = useOrders();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");

  if (menuError || loadError) {
    return (
      <main className="page">
        <p className="notice error">
          {menuError ?? loadError}{" "}
          <button type="button" onClick={() => (menuError ? retryMenu() : refresh())}>
            Retry
          </button>
        </p>
      </main>
    );
  }

  if (!menu || !cart) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  // Always read the item from the latest cart snapshot, so the builder sees
  // when the server marks it expired.
  const editingItem: CartItem | null =
    cart.items.find((item) => item.id === editingId) ?? null;

  return (
    <main className="page">
      <header className="page-header">
        <h1>Smart Order Builder</h1>
      </header>

      <div className="layout">
        <Builder
          // A new key resets the builder's state when we start/stop editing.
          key={editingItem?.id ?? "new"}
          menu={menu}
          freeStock={cart.freeStock}
          clockOffset={getClockOffset()}
          editingItem={editingItem}
          onAdd={add}
          onUpdate={update}
          onDone={() => setEditingId(null)}
        />

        <CartPanel
          menu={menu}
          cart={cart}
          clockOffset={getClockOffset()}
          editingItemId={editingItem?.id ?? null}
          couponCode={couponCode}
          onCouponChange={setCouponCode}
          onEdit={(item) => setEditingId(item.id)}
          onRemove={async (itemId) => {
            await remove(itemId);
            if (itemId === editingId) setEditingId(null);
          }}
          onRefresh={refresh}
          onPay={async (paymentMethod, couponCode, idempotencyKey) => {
            const order = await checkout(paymentMethod, couponCode, idempotencyKey);
            setEditingId(null);
            await refreshOrders(); // orders list (and later the chatbot) update at once
            return order;
          }}
        />
      </div>

      <OrdersPanel orders={orders} menu={menu} />
    </main>
  );
}

export default App;
