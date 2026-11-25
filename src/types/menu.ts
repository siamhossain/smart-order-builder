export interface MenuOption {
  id: string;
  name: string;
  price: number;
  ingredients: Record<string, number>;
}

export interface MenuGroup {
  id: string;
  name: string;
  min: number;
  max?: number;
  step?: number;
  maxDistinct?: number;
  maxPerOption?: number;
  options: MenuOption[];
}

export type Rule =
  | {
      id: string;
      type: "requires";
      optionId: string;
      requiredOptionIds: string[];
    }
  | {
      id: string;
      type: "excludes";
      optionId: string;
      excludedOptionIds: string[];
    }
  | {
      id: string;
      type: "overrideLimit";
      optionId: string;
      targetGroupId: string;
      max: number;
    };

export type ProductConfig = Record<string, number>;

export interface MenuData {
  product: {
    id: string;
    name: string;
    basePrice: number;
  };
  groups: MenuGroup[];
  rules: Rule[];
  ingredientStock: Record<string, number>;
}

export interface ValidationViolation {
  groupId: string;
  ruleId: string;
  message: string;
}
