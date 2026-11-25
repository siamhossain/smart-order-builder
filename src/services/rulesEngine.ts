import type {
  MenuGroup,
  ProductConfig,
  Rule,
  ValidationViolation,
} from "../types/menu";

export function validate(
  config: ProductConfig,
  groups: MenuGroup[],
  rules: Rule[],
): ValidationViolation[] {
  const violations: ValidationViolation[] = [];

  // Find the group that contains a particular option.
  function findOptionGroup(optionId: string): MenuGroup | undefined {
    return groups.find((group) =>
      group.options.some((option) => option.id === optionId),
    );
  }

  // Check whether an option has been selected.
  function isSelected(optionId: string): boolean {
    return (config[optionId] ?? 0) > 0;
  }

  // Validate group-level limits.
  for (const group of groups) {
    const selectedOptions = group.options.filter(
      (option) => (config[option.id] ?? 0) > 0,
    );

    const totalQuantity = selectedOptions.reduce(
      (total, option) => total + (config[option.id] ?? 0),
      0,
    );

    const distinctCount = selectedOptions.length;

    // Minimum quantity.
    if (totalQuantity < group.min) {
      violations.push({
        groupId: group.id,
        ruleId: `${group.id}-min`,
        message: `Select at least ${group.min} ${group.name.toLowerCase()}.`,
      });
    }

    // Find an active maximum override for this group.
    const override = rules.find(
      (rule) =>
        rule.type === "overrideLimit" &&
        rule.targetGroupId === group.id &&
        isSelected(rule.optionId),
    );

    const effectiveMax =
      override?.type === "overrideLimit" ? override.max : group.max;

    // Maximum quantity.
    if (effectiveMax !== undefined && totalQuantity > effectiveMax) {
      violations.push({
        groupId: group.id,
        ruleId:
          override?.type === "overrideLimit" ? override.id : `${group.id}-max`,
        message: `${group.name} allows a maximum of ${effectiveMax}.`,
      });
    }

    // Step validation.
    if (group.step && totalQuantity % group.step !== 0) {
      violations.push({
        groupId: group.id,
        ruleId: `${group.id}-step`,
        message: `${group.name} must be selected in steps of ${group.step}.`,
      });
    }

    // Maximum number of distinct options.
    if (group.maxDistinct !== undefined && distinctCount > group.maxDistinct) {
      violations.push({
        groupId: group.id,
        ruleId: `${group.id}-max-distinct`,
        message: `Select no more than ${group.maxDistinct} different ${group.name.toLowerCase()} options.`,
      });
    }

    // Maximum quantity of each individual option.
    if (group.maxPerOption !== undefined) {
      for (const option of selectedOptions) {
        const quantity = config[option.id] ?? 0;

        if (quantity > group.maxPerOption) {
          violations.push({
            groupId: group.id,
            ruleId: `${group.id}-${option.id}-max`,
            message: `${option.name} allows a maximum quantity of ${group.maxPerOption}.`,
          });
        }
      }
    }
  }

  // Validate relationships between options.
  for (const rule of rules) {
    if (!isSelected(rule.optionId)) {
      continue;
    }

    const triggerGroup = findOptionGroup(rule.optionId);

    if (!triggerGroup) {
      continue;
    }

    if (rule.type === "requires") {
      const hasRequiredOption = rule.requiredOptionIds.some(isSelected);

      if (!hasRequiredOption) {
        violations.push({
          groupId: triggerGroup.id,
          ruleId: rule.id,
          message: `${rule.optionId} requires at least one compatible option.`,
        });
      }
    }

    if (rule.type === "excludes") {
      const conflictingOptions = rule.excludedOptionIds.filter(isSelected);

      if (conflictingOptions.length > 0) {
        violations.push({
          groupId: triggerGroup.id,
          ruleId: rule.id,
          message: `${rule.optionId} cannot be combined with ${conflictingOptions.join(", ")}.`,
        });
      }
    }
  }

  return violations;
}
