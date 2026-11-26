import type {
  MenuGroup,
  ProductConfig,
  Rule,
  ValidationViolation,
} from "../types/menu";

// Part A - rules engine. Pure, returns EVERY violation, no menu ids hardcoded.
export function validate(
  config: ProductConfig,
  groups: MenuGroup[],
  rules: Rule[],
): ValidationViolation[] {
  const violations: ValidationViolation[] = [];

  function qtyOf(optionId: string): number {
    return config[optionId] ?? 0;
  }

  function isSelected(optionId: string): boolean {
    return qtyOf(optionId) > 0;
  }

  // Turn an option id into its display name ("bacon" -> "Beef Bacon").
  function nameOf(optionId: string): string {
    for (const group of groups) {
      const option = group.options.find((o) => o.id === optionId);
      if (option) return option.name;
    }
    return optionId;
  }

  // ["Scrambled", "Omelette"] -> "Scrambled or Omelette"
  function joinNames(optionIds: string[], word: "or" | "and"): string {
    const names = optionIds.map(nameOf);
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} ${word} ${names[names.length - 1]}`;
  }

  function findOptionGroup(optionId: string): MenuGroup | undefined {
    return groups.find((group) =>
      group.options.some((option) => option.id === optionId),
    );
  }

  // ---- 1. Group limits ----
  for (const group of groups) {
    const selectedOptions = group.options.filter((o) => isSelected(o.id));
    const total = selectedOptions.reduce((sum, o) => sum + qtyOf(o.id), 0);

    // An active overrideLimit rule replaces the group's max (override wins).
    const override = rules.find(
      (rule) =>
        rule.type === "overrideLimit" &&
        rule.targetGroupId === group.id &&
        isSelected(rule.optionId),
    );
    const max = override?.type === "overrideLimit" ? override.max : group.max;

    // One sentence that describes the whole limit, e.g.
    // "Eggs total must be 2-6 in steps of 2".
    let limitText = `${group.name} total must be`;
    if (max !== undefined) limitText += ` ${group.min}-${max}`;
    else limitText += ` at least ${group.min}`;
    if (group.step) limitText += ` in steps of ${group.step}`;
    const youHave = ` (you have ${total})`;

    const belowMin = total < group.min;
    const aboveMax = max !== undefined && total > max;
    const offStep = group.step !== undefined && group.step > 0 && total % group.step !== 0;

    // A broken override gets its own, clearer message.
    if (aboveMax && override?.type === "overrideLimit") {
      violations.push({
        groupId: group.id,
        ruleId: override.id,
        message: `${group.name} max is ${max} when ${nameOf(override.optionId)} is selected${youHave}`,
      });
    }

    // Min, max and step give ONE violation, so 1 egg doesn't show it twice.
    let brokenLimit: "min" | "max" | "step" | null = null;
    if (belowMin) brokenLimit = "min";
    else if (aboveMax && !override) brokenLimit = "max";
    else if (offStep) brokenLimit = "step";

    if (brokenLimit) {
      violations.push({
        groupId: group.id,
        ruleId: `${group.id}-${brokenLimit}`,
        message: limitText + youHave,
      });
    }

    if (
      group.maxDistinct !== undefined &&
      selectedOptions.length > group.maxDistinct
    ) {
      violations.push({
        groupId: group.id,
        ruleId: `${group.id}-maxDistinct`,
        message: `${group.name}: choose at most ${group.maxDistinct} different options`,
      });
    }

    if (group.maxPerOption !== undefined) {
      for (const option of selectedOptions) {
        if (qtyOf(option.id) > group.maxPerOption) {
          violations.push({
            groupId: group.id,
            ruleId: `${group.id}-${option.id}-maxPerOption`,
            message: `${option.name}: at most ${group.maxPerOption} allowed`,
          });
        }
      }
    }
  }

  // ---- 2. Cross-group rules (requires / excludes) ----
  // overrideLimit was already handled above, inside the group limits.
  for (const rule of rules) {
    if (!isSelected(rule.optionId)) continue;

    const groupId = findOptionGroup(rule.optionId)?.id ?? "";

    if (rule.type === "requires") {
      const hasOne = rule.requiredOptionIds.some(isSelected);
      if (!hasOne) {
        violations.push({
          groupId,
          ruleId: rule.id,
          message: `${nameOf(rule.optionId)} requires ${joinNames(rule.requiredOptionIds, "or")}`,
        });
      }
    }

    if (rule.type === "excludes") {
      const conflicts = rule.excludedOptionIds.filter(isSelected);
      if (conflicts.length > 0) {
        violations.push({
          groupId,
          ruleId: rule.id,
          message: `${nameOf(rule.optionId)} cannot be combined with ${joinNames(conflicts, "and")}`,
        });
      }
    }
  }

  return violations;
}
