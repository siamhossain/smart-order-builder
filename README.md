# Smart Order Builder

A "Build Your Breakfast" ordering app for the DevsStream frontend assessment. It has a rules engine, shared ingredient stock, a pricing engine, cart reservations, checkout with stored JSON orders, and a Gemini sales assistant.

**Stack:** React 19, TypeScript (strict), Vite, MSW (mock API), Vitest + React Testing Library, Gemini API (function calling).

- Decisions and checkpoints: [DECISIONS.md](DECISIONS.md)
- Answers Q1–Q8: [ANSWERS.md](ANSWERS.md)

---

## Setup

Requires Node 20.19+ (developed on Node 24).

```bash
npm install
cp .env.example .env.local     # then put your Gemini key in .env.local
npm run dev                    # http://localhost:5173
```

`.env.local`:

```
VITE_GEMINI_API_KEY=your-key
# optional: force one model, e.g. VITE_GEMINI_MODEL=gemini-3.5-flash-lite
```

Restart `npm run dev` after changing `.env.local`. Without a key, everything works except the chatbot, which shows a "missing key" message.

| Command                             | What it does                                                     |
| ----------------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                       | Start the app with the MSW mock server                           |
| `npm test`                          | Run all tests (Section 9 acceptance tests and more)              |
| `npm run answers`                   | Print the answers to Q1–Q8 from the real engine                  |
| `npm run build` / `npm run preview` | Production build (MSW runs there too, because it is the backend) |
| `npm run lint`                      | ESLint                                                           |

**To reset the mock server** to full stock, an empty cart and the 6 seed orders, run this in the browser console:
`fetch("/api/dev/reset", { method: "POST" }).then(() => location.reload())`

---

## Architecture

```
src/
  engine/        PURE functions: no React, no fetch, no Date.now()
    rules.ts       validate(config, groups, rules) -> every violation     (Part A)
    stock.ts       usage, free stock, shortages, "N more" per option      (Part B)
    pricing.ts     priceCart(cart, menu, promos, serverTime)              (Part C)
    money.ts       integer poisha helpers: half-up %, whole-taka rounding
    stats.ts       sales stats over stored orders                         (Part F)
  mocks/         the "server" (MSW)
    data/          menu fixture (Appendix A) + orders.seed.json
    server/        pure server logic: cart.ts (reserve/edit/expire), orders.ts (checkout, seeds)
    handlers.ts    HTTP layer: latency, random failures, the single commit point
  api/           fetch client + server clock offset
  hooks/         useMenu, useCart, useOrders, usePricePreview, useNow
  components/    Builder, CartPanel, OrdersPanel, ChatPanel, PriceBreakdownView
  chat/          Gemini function calling (gemini.ts) + tool definitions (tools.ts)
  answers/       the script behind ANSWERS.md
```

**The main idea:** all business logic lives in `engine/` as pure functions. The mock server, the React UI and the tests call the **same** functions, so the browser's instant feedback and the server's final decision can't disagree, and every rule can be tested without a browser.

**Data-driven:** groups, options, rules, ingredients, stock, promotions and VAT all come from `GET /api/menu`. No component or engine file contains an option id, name or limit, so a different menu fixture works without code changes.

### Rules engine (`engine/rules.ts`)

`validate()` returns **all** violations, each with a group or rule id and a readable message. It handles min, max, step, maxDistinct, maxPerOption, `requires`, `excludes` and `overrideLimit` (the override replaces the group max while its option is selected). A group's min, max and step are reported as one message, so 1 egg doesn't show the same sentence twice.

### Stock engine (`engine/stock.ts`)

Options use ingredients, and stock is shared by the whole cart and the item being built. `free = stock − sold − active reservations`. **Editing uses the net difference:** the item's own allocation is added back before checking the new version, so it is never double-counted. Shortages list every missing ingredient ("Short: 2 egg, 2 cheese").

### Pricing engine (`engine/pricing.ts`)

Integer poisha everywhere. The steps run in the brief's exact order: base + options → P2 cheapest extras free → P1 combo % → line × qty → **one** cart discount (the larger; listed-first wins a tie, which is C1) → VAT 5% → payable rounded to whole taka. Each percentage step rounds half-up with integer maths. The MORNING15 time window is checked in Asia/Dhaka wall-clock time from the **server** time.

### Cart and reservations (`mocks/server/cart.ts`)

- Every server function takes a state and returns a **new** state, and the HTTP handler saves only at the end. That makes add, edit, remove and checkout all-or-nothing, with no phantom reservations.
- Add to Cart uses an idempotency key, and the server maps key → item.
- Reservations last 5 minutes on the server clock, which runs 90 s ahead. The browser computes the offset from `serverTime` (using the request midpoint) and never uses `Date.now()` alone for countdowns.
- Expired items release their stock and become read-only.

### Live price preview (`hooks/usePricePreview.ts`)

- The preview waits 300 ms after the last change (debounce).
- Every answer is stored with the key of the configuration it belongs to, and only an answer matching the **current** configuration is shown. The old request is also aborted.
- On failure, the configuration is kept and a Retry button appears.

### Orders (`mocks/server/orders.ts`)

- Pay turns the active items into one order atomically: reserved stock becomes sold, the cart empties, and the order is stored.
- The server creates the order id and time. A ref guard plus an idempotency key stop double orders.
- The 6 seed orders are priced with our engine at their own `createdAt`.
- Orders persist in `localStorage` (the mock server's "database"), and **Download orders.json** exports them all. The shape is documented in DECISIONS.md (D6).

### Sales assistant (`chat/`)

- Gemini gets the question and the tool **declarations** only, never the orders.
- It picks a tool, our code runs it on the current orders (pure functions in `engine/stats.ts`), and Gemini only phrases the result.
- Tools: `countOrders`, `totalRevenue`, `bestSellingOption`, `revenueByPaymentMethod`, `averageOrderValue`, `couponUsage(code)`, `ordersOnDate(date)`, `describeAvailableData`.
- If Gemini answers without using a tool and the text contains a number, the answer is replaced by a fixed "I can only answer from the order data…" reply.
- Clear messages for a missing key, an invalid key, quota (429), network errors and busy models.
- The default model is `gemini-3.8-flash`, falling back to `gemini-3.5-flash-lite` on 503, 404 or timeout.

---

## Tests

`npm test` runs 14 test files covering every acceptance test in Section 9:

| Tests                                                     | Where                                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| TC-01 to TC-04 (rules)                                    | `src/engine/__tests__/rules.test.ts`                                                                |
| TC-05 to TC-07 (pricing)                                  | `src/engine/__tests__/pricing.test.ts`, `money.test.ts`                                             |
| TC-08 to TC-11 (stock and edits)                          | `src/engine/__tests__/stock.test.ts`, `src/mocks/server/__tests__/cart.test.ts`                     |
| TC-12 (out-of-order prices)                               | `src/hooks/__tests__/usePricePreview.test.ts`                                                       |
| TC-13, TC-14 (idempotency, no phantom reservation, Retry) | `cart.test.ts`, `src/mocks/__tests__/handlers.test.ts`, `src/components/__tests__/Builder.test.tsx` |
| TC-15 (expiry on server time)                             | `cart.test.ts`, `src/api/__tests__/serverClock.test.ts`                                             |
| TC-16, TC-17 (one order, persistence, orders.json)        | `src/mocks/server/__tests__/orders.test.ts`, `handlers.test.ts`                                     |
| TC-18 to TC-20 (assistant, Gemini mocked)                 | `src/chat/__tests__/gemini.test.ts`, `src/engine/__tests__/stats.test.ts`                           |

The Gemini API is always mocked in tests, so no key or network is needed.

---

## Trade-offs

- **MSW + localStorage as the backend.** There is one "server" per browser profile. Two tabs share it, which matches the brief's two-tab scenario, but it isn't a real multi-user server.
- **Cart total is computed in the browser** with the shared engine. Only the builder preview calls `/api/price`. The server prices again at checkout, which is where the price is locked.
- **The chatbot is stateless:** every question starts fresh. This keeps numbers current, but follow-up questions like "and yesterday?" don't carry context.
- **Simple, plain UI.** The brief grades logic, not design.
- **Seed orders don't consume today's stock,** because they are past orders.

## Unfinished / not done

- **Part G (bonus):** reservations already survive a refresh, because server state is saved and expired ones are released on the next request. Not done: cart version numbers for two-tab conflict detection, and saving an unfinished configuration across a refresh.
- A tab only finds out about another tab's changes when it next talks to the server. After a refused save it reloads the cart, but there is no polling.

## Time spent

About 24+ hours over 2 days (25 and 26 November 2026), worked in short sessions with breaks.

## Use of AI

I used an AI coding assistant while building this project. It helped me break the brief into small parts, plan the architecture, write and test the code, and draft the docs. I worked through it part by part, ran the app and the tests myself, checked the answers against the brief, and asked for changes when something was wrong. I made the final decisions.
