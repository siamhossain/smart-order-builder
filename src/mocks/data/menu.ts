import type { MenuData } from "../../types/menu";

export const menuData: MenuData = {
  product: {
    id: "build-your-breakfast",
    name: "Build Your Breakfast",
    basePrice: 250,
  },

  groups: [
    {
      id: "bread",
      name: "Bread",
      min: 1,
      max: 1,
      options: [
        {
          id: "toast",
          name: "Toast",
          price: 0,
          ingredients: { toast: 1 },
        },
        {
          id: "paratha",
          name: "Paratha",
          price: 20,
          ingredients: { paratha: 1 },
        },
        {
          id: "croissant",
          name: "Croissant",
          price: 60,
          ingredients: { croissant: 1 },
        },
      ],
    },
    {
      id: "eggs",
      name: "Eggs",
      min: 2,
      max: 6,
      step: 2,
      options: [
        {
          id: "fried",
          name: "Fried",
          price: 30,
          ingredients: { egg: 1 },
        },
        {
          id: "scrambled",
          name: "Scrambled",
          price: 35,
          ingredients: { egg: 1 },
        },
        {
          id: "omelette",
          name: "Omelette",
          price: 70,
          ingredients: { egg: 2 },
        },
      ],
    },
    {
      id: "protein",
      name: "Protein",
      min: 1,
      max: 3,
      options: [
        {
          id: "sausage",
          name: "Chicken Sausage",
          price: 60,
          ingredients: { sausage: 1 },
        },
        {
          id: "bacon",
          name: "Beef Bacon",
          price: 90,
          ingredients: { bacon: 1 },
        },
        {
          id: "tofu",
          name: "Tofu",
          price: 50,
          ingredients: { tofu: 1 },
        },
      ],
    },
    {
      id: "extras",
      name: "Extras",
      min: 0,
      max: 4,
      options: [
        {
          id: "hashbrown",
          name: "Hash Brown",
          price: 40,
          ingredients: { hashbrown: 1 },
        },
        {
          id: "mushroom",
          name: "Mushroom",
          price: 30,
          ingredients: { mushroom: 1 },
        },
        {
          id: "beans",
          name: "Baked Beans",
          price: 25,
          ingredients: { beans: 1 },
        },
        {
          id: "cheese",
          name: "Cheese",
          price: 35,
          ingredients: { cheese: 1 },
        },
      ],
    },
    {
      id: "sauce",
      name: "Sauce",
      min: 0,
      maxDistinct: 2,
      maxPerOption: 1,
      options: [
        {
          id: "ketchup",
          name: "Ketchup",
          price: 0,
          ingredients: {},
        },
        {
          id: "hollandaise",
          name: "Hollandaise",
          price: 25,
          ingredients: { hollandaise: 1 },
        },
        {
          id: "chili",
          name: "Chili",
          price: 10,
          ingredients: {},
        },
      ],
    },
  ],

  rules: [
    {
      id: "hollandaise-requires-eggs",
      type: "requires",
      optionId: "hollandaise",
      requiredOptionIds: ["scrambled", "omelette"],
    },
    {
      id: "tofu-excludes-meat",
      type: "excludes",
      optionId: "tofu",
      excludedOptionIds: ["sausage", "bacon"],
    },
    {
      id: "chili-excludes-hollandaise",
      type: "excludes",
      optionId: "chili",
      excludedOptionIds: ["hollandaise"],
    },
    {
      id: "croissant-extras-limit",
      type: "overrideLimit",
      optionId: "croissant",
      targetGroupId: "extras",
      max: 2,
    },
  ],

  ingredientStock: {
    egg: 10,
    sausage: 4,
    bacon: 3,
    tofu: 5,
    croissant: 2,
    paratha: 10,
    toast: 20,
    hashbrown: 6,
    mushroom: 6,
    beans: 8,
    cheese: 4,
    hollandaise: 5,
  },
};
