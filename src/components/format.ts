import type { MenuData, MenuGroup, ProductConfig } from "../types/menu";

// "Croissant, Omelette x2, Fried x2, Chicken Sausage"
export function describeConfig(config: ProductConfig, menu: MenuData): string {
  const parts: string[] = [];
  for (const group of menu.groups) {
    for (const option of group.options) {
      const qty = config[option.id] ?? 0;
      if (qty === 1) parts.push(option.name);
      if (qty > 1) parts.push(`${option.name} x${qty}`);
    }
  }
  return parts.join(", ") || "Nothing selected";
}

// "min 2, max 6, steps of 2" - built from the group's data only.
export function describeLimits(group: MenuGroup): string {
  const parts: string[] = [];
  if (group.min > 0) parts.push(`min ${group.min}`);
  else parts.push("optional");
  if (group.max !== undefined) parts.push(`max ${group.max}`);
  if (group.step) parts.push(`steps of ${group.step}`);
  if (group.maxDistinct !== undefined) parts.push(`up to ${group.maxDistinct} kinds`);
  if (group.maxPerOption !== undefined) parts.push(`max ${group.maxPerOption} each`);
  return parts.join(", ");
}

// Label for a promotion in the breakdown: "P1", or "C2 (MORNING15)" for
// coupons. The fixture has no display names, so we show the id.
export function promotionLabel(id: string, menu: MenuData): string {
  const coupon = menu.pricing.cartPromotions.find(
    (p) => p.id === id && p.type === "couponPercent",
  );
  if (coupon?.type === "couponPercent") return `${id} (${coupon.code})`;
  return id;
}
