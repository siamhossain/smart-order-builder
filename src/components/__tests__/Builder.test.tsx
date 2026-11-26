// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Builder } from "../Builder";
import { menuData } from "../../mocks/data/menu";
import { api } from "../../api/client";
import { freeStock, usageOf } from "../../engine/stock";
import { itemB, itemC } from "../../engine/__tests__/testItems";

beforeEach(() => {
  // The builder asks for a price preview; we don't care about it here.
  vi.spyOn(api, "getPrice").mockReturnValue(new Promise(() => {}));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderBuilder(overrides: Partial<Parameters<typeof Builder>[0]> = {}) {
  const props = {
    menu: menuData,
    freeStock: menuData.ingredientStock,
    clockOffset: 0,
    editingItem: null,
    onAdd: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onDone: vi.fn(),
    ...overrides,
  };
  render(<Builder {...props} />);
  return props;
}

async function pick(user: ReturnType<typeof userEvent.setup>, optionName: string, times = 1) {
  for (let i = 0; i < times; i++) {
    await user.click(screen.getByRole("button", { name: `Add one ${optionName}` }));
  }
}

describe("Builder", () => {
  it("builds every group and option from the menu data", () => {
    renderBuilder();

    for (const group of menuData.groups) {
      expect(screen.getByText(group.name)).toBeTruthy();
      for (const option of group.options) {
        expect(screen.getByRole("button", { name: `Add one ${option.name}` })).toBeTruthy();
      }
    }
  });

  it("Add to cart stays disabled while there is a violation", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await pick(user, "Toast");
    await pick(user, "Scrambled", 3);
    await pick(user, "Chicken Sausage");

    const add = screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByText("Eggs total must be 2-6 in steps of 2 (you have 3)")).toBeTruthy();
  });

  it("TC-13: three quick clicks send one add with one idempotency key", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onAdd = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderBuilder({ onAdd });

    await pick(user, "Toast");
    await pick(user, "Scrambled", 2);
    await pick(user, "Chicken Sausage");

    const add = screen.getByRole("button", { name: "Add to cart" });
    await user.tripleClick(add);
    finish();

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const [config, qty, key] = onAdd.mock.calls[0] as unknown as [object, number, string];
    expect(config).toEqual({ toast: 1, scrambled: 2, sausage: 1 });
    expect(qty).toBe(1);
    expect(typeof key).toBe("string");
  });

  it("TC-14: a failed add keeps the config, and Retry reuses the same key", async () => {
    const user = userEvent.setup();
    const onAdd = vi
      .fn()
      .mockRejectedValueOnce(new Error("Server error, nothing was saved. Please retry."))
      .mockResolvedValueOnce(undefined);
    renderBuilder({ onAdd });

    await pick(user, "Toast");
    await pick(user, "Scrambled", 2);
    await pick(user, "Chicken Sausage");
    await user.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(await screen.findByText(/nothing was saved/)).toBeTruthy();
    expect(screen.getByLabelText("Scrambled quantity").textContent).toBe("2"); // kept

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2));
    expect(onAdd.mock.calls[1][2]).toBe(onAdd.mock.calls[0][2]); // same key
  });

  it("TC-08: with B x1 + C x2 in the cart, egg options are disabled", () => {
    const free = freeStock(menuData.ingredientStock, [
      usageOf(itemB, 1, menuData),
      usageOf(itemC, 2, menuData),
    ]);
    renderBuilder({ freeStock: free });

    for (const name of ["Fried", "Scrambled", "Omelette"]) {
      const button = screen.getByRole("button", { name: `Add one ${name}` }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    }
  });
});
