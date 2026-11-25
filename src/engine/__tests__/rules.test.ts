import { describe, expect, it } from "vitest";
import { menuData } from "../../mocks/data/menu";
import { validate } from "../rules";
import type { ProductConfig } from "../../types/menu";
import { itemA, itemB, itemC } from "./testItems";

function check(config: ProductConfig) {
  return validate(config, menuData.groups, menuData.rules);
}

describe("Part A - rules engine", () => {
  it("TC-01: Scrambled x3 breaks the eggs step", () => {
    const violations = check({ toast: 1, scrambled: 3, sausage: 1 });

    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("eggs-step");
    expect(violations[0].message).toBe(
      "Eggs total must be 2-6 in steps of 2 (you have 3)",
    );
  });

  it("TC-02: Croissant + 3 extras breaks the override (max 2)", () => {
    const violations = check({
      croissant: 1,
      scrambled: 2,
      sausage: 1,
      hashbrown: 1,
      mushroom: 1,
      beans: 1,
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("croissant-extras-limit");
    expect(violations[0].message).toBe(
      "Extras max is 2 when Croissant is selected (you have 3)",
    );
  });

  it("TC-02: the same 3 extras are fine without Croissant", () => {
    const violations = check({
      toast: 1,
      scrambled: 2,
      sausage: 1,
      hashbrown: 1,
      mushroom: 1,
      beans: 1,
    });

    expect(violations).toEqual([]);
  });

  it("TC-03: Hollandaise with only Fried eggs is blocked", () => {
    const violations = check({
      toast: 1,
      fried: 2,
      sausage: 1,
      hollandaise: 1,
    });

    expect(violations.map((v) => v.message)).toEqual([
      "Hollandaise requires Scrambled or Omelette",
    ]);
  });

  it("TC-04: lists both exclusion violations when both exist", () => {
    const violations = check({
      toast: 1,
      scrambled: 2,
      tofu: 1,
      bacon: 1,
      chili: 1,
      hollandaise: 1,
    });

    expect(violations.map((v) => v.message)).toEqual([
      "Tofu cannot be combined with Beef Bacon",
      "Chili cannot be combined with Hollandaise",
    ]);
  });

  it("Scrambled x1 + Fried x1 is valid", () => {
    expect(check({ toast: 1, scrambled: 1, fried: 1, sausage: 1 })).toEqual([]);
  });

  it("items A, B and C from the brief are all valid", () => {
    expect(check(itemA)).toEqual([]);
    expect(check(itemB)).toEqual([]);
    expect(check(itemC)).toEqual([]);
  });

  it("an empty config reports every missing required group", () => {
    const ruleIds = check({}).map((v) => v.ruleId);

    expect(ruleIds).toEqual(["bread-min", "eggs-min", "protein-min"]);
  });

  it("sauce limits: max 2 distinct, max 1 of each", () => {
    const ruleIds = check({
      toast: 1,
      scrambled: 2,
      sausage: 1,
      ketchup: 2,
      hollandaise: 1,
      chili: 1,
    }).map((v) => v.ruleId);

    expect(ruleIds).toContain("sauce-maxDistinct");
    expect(ruleIds).toContain("sauce-ketchup-maxPerOption");
  });
});
