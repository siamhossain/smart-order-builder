# ANSWERS

Every answer below is printed by running our own engine:

```bash
npm run answers
```

This runs [`src/answers/answers.test.ts`](src/answers/answers.test.ts). Each answer is also checked with `expect`, so the test fails if an engine change breaks one. Money is calculated in integer poisha and shown in BDT.

---

## Q1. Maximum number of item C from an empty cart

**2 items. Cheese limits it.**

The script keeps reserving C ×1 on the mock server until a reservation is refused.

```
Item C uses per unit: paratha 1, egg 2, tofu 1, mushroom 1, beans 1, cheese 2
Added 2 x C, the next one was refused: "Short: 2 cheese"
```

Cheese has 4 in stock and each C uses 2 (Cheese ×2). Eggs would allow 5 (10 ÷ 2) and tofu 5, so cheese runs out first.

---

## Q2. Cheapest valid configuration and its unit price

**Toast, Fried ×2, Tofu: 360.00 BDT.**

```
Checked 4560 combinations of the required groups.
Cheapest valid: Toast, Fried x2, Tofu = 360.00 BDT
```

The script tries every combination of the required groups (Bread, Eggs, Protein) within their limits. It keeps the combinations that pass `validate()` and fit the stock, then prices each one with `priceLine()`. Optional groups (Extras, Sauce) stay empty, because their options cost 0 or more and can't lower the price.

250 base + Toast 0 + Fried ×2 (60) + Tofu (50) = **360.00**. Ketchup is free, so adding it gives the same price.

---

## Q3. Cart = A ×3 at 10:30, then at 11:30

The cart has the coupon **MORNING15 entered**. Without a coupon, both times would give the same answer as 11:30.

**Step by step:**

| Step | 10:30 | 11:30 |
|---|---|---|
| 1. Unit A = 250 + Toast 0 + Scrambled 2×35 + Sausage 60 + Ketchup 0 | 380.00 | 380.00 |
| 2. P2 extras deal (A has no extras) | 0 | 0 |
| 3. P1 combo (A has 2 egg units, needs 4) | 0 | 0 |
| 4. Line = 380.00 × 3 = **subtotal** | **1,140.00** | **1,140.00** |
| 5. C1: subtotal ≥ 1,200? (1,140 is below) | no | no |
| 5. C2: before 11:00? 15% of 1,140 = 171.00, capped at 150 | **150.00** | not valid (expired) |
| 5. Chosen discount | **C2 −150.00** | **none** |
| Discounted subtotal | 990.00 | 1,140.00 |
| 6. VAT 5% | 990.00 × 5% = **49.50** | 1,140.00 × 5% = **57.00** |
| Total | 1,039.50 | 1,197.00 |
| **Payable** (half-up to whole BDT) | **1,040** | **1,197** |

At 10:30, 1,039.50 is exactly half a taka, and half-up rounds it to **1,040**.

---

## Q4. After TC-10, payable at 11:30

**1,600 BDT.**

```
line 1: B (Omelette x1 + Fried x3)  unit 643.50 x 1 =   643.50
line 2: C                           unit 490.00 x 2 =   980.00
subtotal                                              1,623.50
cart discount   C1 -100.00   (MORNING15: expired after 11:00)
discounted subtotal                                   1,523.50
VAT 5%          1,523.50 x 5% = 76.175 -> 76.18
total                                                 1,599.68
payable                                               1,600
```

---

## Q5. Payable of each seed order, and total revenue

Each seed order is priced by our engine at its own `createdAt` (Dhaka time):

| Order | Time (Dhaka) | Payment | Coupon | Payable |
|---|---|---|---|---|
| ORD-1001 | 2026-11-20 09:15 | card | MORNING15: applied | 339.00 |
| ORD-1002 | 2026-11-20 12:40 | bkash | — | 713.00 |
| ORD-1003 | 2026-11-21 10:05 | cash | MORNING15: applied | 1,271.00 |
| ORD-1004 | 2026-11-21 19:30 | card | — | 578.00 |
| ORD-1005 | 2026-11-22 08:50 | bkash | MORNING15: applied | 866.00 |
| ORD-1006 | 2026-11-22 13:10 | card | MORNING15: expired | 1,228.00 |
| **Total revenue** | | | | **4,995.00** |

---

## Q6. Best-selling option (units = line quantity × option quantity)

**Fried: 10 units.**

```
Fried            10
Scrambled         8
Chicken Sausage   8
Omelette          6
Cheese            6
```

Fried: ORD-1002 (2) + ORD-1003 line 1 (qty 2 × Fried 2 = 4) + ORD-1006 line 1 (2) + ORD-1006 line 2 (2) = **10**.

---

## Q7. Payment method with the most revenue

**Card: 2,145.00 BDT.**

```
card    2,145.00  (3 orders: 339 + 578 + 1,228)
bkash   1,579.00  (2 orders: 713 + 866)
cash    1,271.00  (1 order)
```

---

## Q8. How many seed orders actually received MORNING15?

**3 orders: ORD-1001, ORD-1003 and ORD-1005.** Four orders have the code, so one didn't get it: **ORD-1006**.

The coupon rule: 15% of the subtotal, capped at 150. It is only valid strictly before 11:00 Dhaka time, and only one cart discount applies, so it must beat C1 (100 off when the subtotal is at least 1,200).

**Step by step:**

| Order | Time | Before 11:00? | Subtotal | 15% (capped 150) | C1 (≥ 1,200?) | Result |
|---|---|---|---|---|---|---|
| ORD-1001 | 09:15 | yes | 380.00 | 57.00 | no | **applied −57.00** |
| ORD-1003 | 10:05 | yes | 1,360.00 | 204.00 → **150.00** | yes, 100.00 | **applied −150.00** (150 > 100) |
| ORD-1005 | 08:50 | yes | 970.00 | **145.50** | no | **applied −145.50** |
| ORD-1006 | 13:10 | **no** | 1,169.50 | (would be 150.00) | no (below 1,200) | **rejected: expired** |

**Why ORD-1006 didn't get the discount:** it was placed at **13:10**, after the 11:00 cutoff, so MORNING15 was not valid at that time. C1 doesn't apply either, because its subtotal of 1,169.50 is below 1,200. It paid full price plus VAT: 1,169.50 + 58.48 = 1,227.98, rounded to **1,228**.

The stored order records this as `couponCode: "MORNING15"` with `coupon.status: "expired"` (see D6 in DECISIONS.md).
