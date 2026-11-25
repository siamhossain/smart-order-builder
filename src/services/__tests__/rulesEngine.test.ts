import { describe, expect, it } from "vitest";
import { menuData } from "../../mocks/data/menu";
import { validate } from "../rulesEngine";
import type { ProductConfig } from "../../types/menu";

describe("Rules Engine — Part A", () => {
  it("TC-01: rejects an egg quantity that breaks the step rule", () => {
    const config: ProductConfig = {
      toast: 1,
      scrambled: 3,
      sausage: 1,
    };

    const violations = validate(config, menuData.groups, menuData.rules);

    expect(
      violations.some((violation) => violation.ruleId === "eggs-step"),
    ).toBe(true);
  });

  it("TC-02: applies the Croissant extras maximum override", () => {
    const config: ProductConfig = {
      croissant: 1,
      scrambled: 2,
      sausage: 1,
      hashbrown: 1,
      mushroom: 1,
      beans: 1,
    };

    const violations = validate(config, menuData.groups, menuData.rules);

    expect(
      violations.some(
        (violation) => violation.ruleId === "croissant-extras-limit",
      ),
    ).toBe(true);
  });

  it("TC-03: requires Scrambled or Omelette with Hollandaise", () => {
    const config: ProductConfig = {
      toast: 1,
      fried: 2,
      sausage: 1,
      hollandaise: 1,
    };

    const violations = validate(config, menuData.groups, menuData.rules);

    expect(
      violations.some(
        (violation) => violation.ruleId === "hollandaise-requires-eggs",
      ),
    ).toBe(true);
  });

  it("TC-04: reports both exclusion violations", () => {
    const config: ProductConfig = {
      toast: 1,
      scrambled: 2,
      tofu: 1,
      bacon: 1,
      chili: 1,
      hollandaise: 1,
    };

    const violations = validate(config, menuData.groups, menuData.rules);

    const violationIds = violations.map((violation) => violation.ruleId);

    expect(violationIds).toContain("tofu-excludes-meat");
    expect(violationIds).toContain("chili-excludes-hollandaise");
  });

  it("accepts a valid breakfast configuration", () => {
    const config: ProductConfig = {
      toast: 1,
      scrambled: 1,
      fried: 1,
      sausage: 1,
      ketchup: 1,
    };

    const violations = validate(config, menuData.groups, menuData.rules);

    expect(violations).toHaveLength(0);
  });
});
