# DECISIONS

## C1: why floats are risky, and how the VAT of 75.48 is rounded

I use integer poisha instead of floating-point decimal values because JavaScript can produce precision errors during percentage calculations. This is especially risky for discounts and VAT. I calculate money using integer arithmetic and apply half-up rounding when needed. This keeps the financial calculations predictable and accurate.

VAT in TC-06 by hand:

- subtotal 1,659.50 − C2 150.00 = 1,509.50 → `150950` poisha
- 5% of it: `150950 × 5 = 754750`
- divide by 100 with half-up (add 50 then floor): `floor((754750 + 50) / 100) = 7548`
- `7548` poisha = **75.48 BDT**
- payable: 1,509.50 + 75.48 = 1,584.98 → rounded to whole taka = **1,585**

---

## C2: questions the bot supports and the function behind each

I used function calling because the numbers should come from our code not from the AI. Gemini only gets the question and the tool declarations, never the orders. It picks a tool, our TypeScript function runs on the real orders and Gemini just turns the result into a sentence. Money is sent back as ready BDT strings like "4,995.00" so the model doesnt have to add or convert anything.

| Question                                 | Tool name                | Input                               | Output                                                                            |
| ---------------------------------------- | ------------------------ | ----------------------------------- | --------------------------------------------------------------------------------- |
| How many orders?                         | `countOrders`            | none                                | `{ orderCount }`                                                                  |
| Total revenue?                           | `totalRevenue`           | none                                | `{ totalRevenueBDT, orderCount }`                                                 |
| Best-selling option (by units)?          | `bestSellingOption`      | none                                | `{ bestSellers: [{option, units}], top5 }`                                        |
| Revenue by payment method?               | `revenueByPaymentMethod` | none                                | `{ byMethod: [{method, revenueBDT, orderCount}] }`                                |
| Average order value?                     | `averageOrderValue`      | none                                | `{ averageOrderValueBDT, orderCount }`                                            |
| How many orders actually got the coupon? | `couponUsage`            | `code`                              | `{ code, ordersWithCode, appliedCount, notApplied: [{orderId, status, reason}] }` |
| Orders on a given date?                  | `ordersOnDate`           | `date` (YYYY-MM-DD, Dhaka calendar) | `{ date, orderCount, revenueBDT, orders: [{id, paymentMethod, payableBDT}] }`     |
| Can the data answer this? (used for D5)  | `describeAvailableData`  | none                                | `{ eachOrderHas, notInTheData, dateRange }`                                       |

---

## D1: two tabs, tab B takes the last eggs while tab A is editing

Both browser tabs use the same mock server state so the server is the source of truth for stock availability. When an item is edited, the server calculates only the additional stock needed compared with its existing reservation. If another tab has already taken that stock, the edit is rejected and the old reservation remains unchanged. The user's changes are preserved, and the cart reloads to show the latest availability.

---

## D2: when is a price locked?

At checkout. When Pay is pressed the server prices the cart again with server time and stores that price in the order, after that its never recalculated. I didnt lock it at Add to Cart because then someone could add items at 10:59 and still get MORNING15 hours later. Before paying the cart shows a live estimate using the same `priceCart` with the server clock, so the coupon disappears from the estimate at 11:00 and the UI says the final price is calculated when you pay. Same cart paid at 10:59:59 gets 1,585 and at 11:00:00 gets 1,637 (TC-06/TC-07).

---

## D3: the reservation expires while the user is editing that item

If the reservation expires while the customer is editing, their unsaved changes stay in the builder, so nothing is lost. The builder checks the expiry using server time, not the browser clock. When it expires, a notice explains that the stock was released, and the "Save changes" button becomes "Add to cart". Saving then creates a new reservation with a fresh stock check. I did this because the old stock is already free and another customer might have taken it, so saving into the expired item would be wrong. If the server rejects the edit with EXPIRED first, the cart reloads and the same notice appears.

---

## D4: who creates the order id and timestamp, and how is a double Pay stopped?

The server creates the order ID and timestamp because the browser clock can be incorrect and multiple tabs could generate duplicate IDs. I use a useRef flag on the frontend to prevent rapid repeated Pay clicks. On the server, an idempotency key ensures that repeated requests return the existing order instead of creating another one. This protects against duplicate orders even when network requests are retried.

---

## D5: "Who is our best customer?" but orders have no customer

The orders dont have any customer name or id so the honest answer is that we cant tell. Theres no customer tool at all, and the `describeAvailableData` tool tells Gemini what is in the data and what isnt (customers, staff, profit, refunds). The system instruction says every number must come from a tool and to say clearly when the data doesnt have something. In my test the bot answered that the data has no customer info so it cant find the best customer. I also added a guard in code: if Gemini answers without calling any tool and the answer has a digit in it, its replaced with a fixed "I can only answer from the order data" reply, so a made up "Rahim, 12 orders" cant reach the screen

---

## D6: the JSON shape of a stored order

I store the full order with the options, discounts, VAT and final totals so an old order never changes if the menu or promotions change later. Money is integer poisha same as the engine and times are ISO in UTC, the UI converts them to Dhaka time. The coupon the customer typed (`couponCode`) is kept separate from what happened to it (`coupon.status`) because a coupon can be entered but not applied.

```json
{
  "id": "ORD-1006",
  "createdAt": "2026-11-22T07:10:00.000Z",
  "source": "seed",
  "paymentMethod": "card",
  "couponCode": "MORNING15",
  "coupon": {
    "code": "MORNING15",
    "status": "expired",
    "message": "MORNING15 is not valid at this time"
  },
  "lines": [
    {
      "qty": 1,
      "options": {
        "croissant": 1,
        "omelette": 2,
        "fried": 2,
        "sausage": 1,
        "bacon": 1,
        "hashbrown": 1,
        "mushroom": 1,
        "hollandaise": 1
      },
      "unitBase": 75500,
      "unitDiscounts": [{ "promotionId": "P1", "amount": 7550 }],
      "unitPrice": 67950,
      "lineTotal": 67950
    }
  ],
  "totals": {
    "subtotal": 116950,
    "cartDiscount": null,
    "discountedSubtotal": 116950,
    "vat": 5848,
    "totalBeforeRounding": 122798,
    "payable": 122800
  }
}
```

(the real ORD-1006 has a second line, its shortened here)

- money: integer poisha, `122800` = 1,228.00 BDT
- times: ISO 8601 UTC
- `coupon.status`: `applied`, `expired`, `notBest` (valid but another discount was bigger) or `unknown` (no such code)
- `source`: `seed` or a real checkout
- the download file wraps it: `{ schemaVersion: 1, currency: "BDT", moneyUnit: "poisha", exportedAt, orders: [...] }`

---

## Other choices

- Editing doesnt reset the 5 minute timer, otherwise someone could hold stock forever just by editing.
- Add and Edit also fail randomly 10% of the time on purpose (brief only asks it for `/price`) so the Retry paths actually get used.
- The cart total is calculated in the browser with the shared `priceCart`, only the builder preview calls `/price`.
- The chatbot starts fresh for every question so an old number cant come back after a checkout.
- If one Gemini model is busy (503) or takes more than 20s it falls back to another Flash model.
