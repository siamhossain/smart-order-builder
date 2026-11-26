import type { Poisha } from "../types/menu";

// percent% of amount, half-up, integer only ("+50 then floor").
//   percentOf(150950, 5) -> 7547.5 -> 7548 (75.48 BDT)
export function percentOf(amount: Poisha, percent: number): Poisha {
  return Math.floor((amount * percent + 50) / 100);
}

// Round poisha half-up to whole taka (a multiple of 100 poisha).
//   158498 -> 158500 (1584.98 BDT -> 1585 BDT)
export function roundToWholeTaka(amount: Poisha): Poisha {
  return Math.floor((amount + 50) / 100) * 100;
}

// 165950 -> "1,659.50". Built from integers, so no float formatting issues.
export function formatBDT(amount: Poisha): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const taka = Math.floor(abs / 100).toLocaleString("en-US");
  const poisha = String(abs % 100).padStart(2, "0");
  return `${sign}${taka}.${poisha}`;
}
