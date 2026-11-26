import { useRef, useState } from "react";
import type { MenuData, ProductConfig } from "../types/menu";
import type { CartItem } from "../types/cart";
import { validate } from "../engine/rules";
import {
  availableFor,
  findShortages,
  maxMoreUnits,
  shortageMessage,
  usageOf,
  type Ingredients,
} from "../engine/stock";
import { formatBDT } from "../engine/money";
import { msUntil } from "../api/serverClock";
import { errorMessage } from "../api/client";
import { usePricePreview } from "../hooks/usePricePreview";
import { useNow } from "../hooks/useNow";
import { PriceBreakdownView } from "./PriceBreakdownView";
import { describeLimits } from "./format";

const MAX_QTY = 3;

interface Props {
  menu: MenuData;
  freeStock: Ingredients;
  clockOffset: number;
  editingItem: CartItem | null; // null = building a new item
  onAdd: (config: ProductConfig, qty: number, idempotencyKey: string) => Promise<void>;
  onUpdate: (itemId: string, config: ProductConfig, qty: number) => Promise<void>;
  onDone: () => void; // finished editing (saved or cancelled)
}

// The product configurator. Used for new items and for editing a cart item.
export function Builder({
  menu,
  freeStock,
  clockOffset,
  editingItem,
  onAdd,
  onUpdate,
  onDone,
}: Props) {
  const [config, setConfig] = useState<ProductConfig>(editingItem?.config ?? {});
  const [qty, setQty] = useState(editingItem?.qty ?? 1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // One idempotency key per "add attempt". Retry and double clicks reuse it;
  // it is cleared after success or when the configuration changes.
  const idempotencyKey = useRef<string | null>(null);

  // D3: if the reservation expires while editing, we keep the user's
  // unsaved changes and offer to add them as a new item instead.
  const now = useNow(1000);
  const editExpired =
    editingItem !== null &&
    (editingItem.status === "expired" ||
      msUntil(editingItem.expiresAt, clockOffset, now) === 0);
  const isEditing = editingItem !== null && !editExpired;

  // Stock this configuration may use. When editing, the item's own current
  // allocation counts as available to it (net-difference rule).
  const ownAllocation = isEditing ? usageOf(editingItem.config, editingItem.qty, menu) : {};
  const available = availableFor(freeStock, ownAllocation);

  const violations = validate(config, menu.groups, menu.rules);
  const shortages = findShortages(usageOf(config, qty, menu), available);
  const hasSelection = Object.values(config).some((n) => n > 0);
  const canSubmit = hasSelection && violations.length === 0 && shortages.length === 0;

  const { preview, retry } = usePricePreview(
    hasSelection ? { lines: [{ config, qty }], couponCode: null } : null,
  );

  function changeConfig(next: ProductConfig) {
    setConfig(next);
    setSubmitError(null);
    idempotencyKey.current = null; // different config = different add attempt
  }

  function changeOption(optionId: string, delta: number) {
    const nextQty = Math.max(0, (config[optionId] ?? 0) + delta);
    const next = { ...config };
    if (nextQty === 0) delete next[optionId];
    else next[optionId] = nextQty;
    changeConfig(next);
  }

  // A ref changes immediately, while state only changes on the next render,
  // so three very fast clicks can't all get past this check.
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current || !canSubmit) return;
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (isEditing) {
        await onUpdate(editingItem.id, config, qty);
      } else {
        idempotencyKey.current ??= crypto.randomUUID();
        await onAdd(config, qty, idempotencyKey.current);
        idempotencyKey.current = null;
        setConfig({});
        setQty(1);
      }
      onDone();
    } catch (error) {
      // Keep the configuration so the user can press Retry.
      setSubmitError(errorMessage(error));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <h2>{isEditing ? "Edit item" : menu.product.name}</h2>
      <p className="muted">Base price ৳ {formatBDT(menu.product.basePrice)}</p>

      {editExpired && (
        <p className="notice warn" role="alert">
          The reservation for this item expired while you were editing, so its
          stock was released. Your changes are kept below: add them as a new
          item, then remove the expired one from the cart.
        </p>
      )}

      {menu.groups.map((group) => (
        <fieldset key={group.id} className="group">
          <legend>
            {group.name} <span className="muted">({describeLimits(group)})</span>
          </legend>

          {group.options.map((option) => {
            const optionQty = config[option.id] ?? 0;
            const more = maxMoreUnits(option, config, qty, available, menu);
            const atPerOptionMax =
              group.maxPerOption !== undefined && optionQty >= group.maxPerOption;

            return (
              <div key={option.id} className="option">
                <span className="option-name">
                  {option.name}
                  <span className="muted"> +{formatBDT(option.price)}</span>
                </span>
                <span className={more === 0 ? "stock out" : "stock"}>
                  {more === Infinity ? "" : more === 0 ? "none left" : `${more} more`}
                </span>
                <span className="stepper">
                  <button
                    type="button"
                    aria-label={`Remove one ${option.name}`}
                    disabled={optionQty === 0}
                    onClick={() => changeOption(option.id, -1)}
                  >
                    −
                  </button>
                  <span className="qty" aria-label={`${option.name} quantity`}>
                    {optionQty}
                  </span>
                  <button
                    type="button"
                    aria-label={`Add one ${option.name}`}
                    disabled={more <= 0 || atPerOptionMax}
                    onClick={() => changeOption(option.id, +1)}
                  >
                    +
                  </button>
                </span>
              </div>
            );
          })}
        </fieldset>
      ))}

      <label className="item-qty">
        Item quantity{" "}
        <select
          value={qty}
          onChange={(e) => {
            setQty(Number(e.target.value));
            setSubmitError(null);
            idempotencyKey.current = null;
          }}
        >
          {Array.from({ length: MAX_QTY }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      {hasSelection && (violations.length > 0 || shortages.length > 0) && (
        <ul className="problems" aria-label="Problems">
          {violations.map((v) => (
            <li key={v.ruleId}>{v.message}</li>
          ))}
          {shortages.length > 0 && <li>{shortageMessage(shortages)}</li>}
        </ul>
      )}

      <div className="preview" aria-live="polite">
        {preview.status === "loading" && <p className="muted">Calculating price…</p>}
        {preview.status === "error" && (
          <p className="notice error">
            {preview.message}{" "}
            <button type="button" onClick={retry}>
              Retry
            </button>
          </p>
        )}
        {preview.status === "ok" && (
          <PriceBreakdownView breakdown={preview.breakdown} menu={menu} />
        )}
      </div>

      {submitError && (
        <p className="notice error" role="alert">
          {submitError}{" "}
          <button type="button" onClick={submit} disabled={submitting}>
            Retry
          </button>
        </p>
      )}

      <div className="actions">
        <button type="button" className="primary" disabled={!canSubmit || submitting} onClick={submit}>
          {submitting ? "Saving…" : isEditing ? "Save changes" : "Add to cart"}
        </button>
        {editingItem && (
          <button type="button" onClick={onDone} disabled={submitting}>
            {editExpired ? "Discard changes" : "Cancel edit"}
          </button>
        )}
      </div>
    </section>
  );
}
