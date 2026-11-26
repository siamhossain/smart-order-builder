import { afterEach, describe, expect, it, vi } from "vitest";
import { menuData } from "../../mocks/data/menu";
import seedFile from "../../mocks/data/orders.seed.json";
import { priceSeedOrders } from "../../mocks/server/orders";
import type { SeedOrder, StoredOrder } from "../../types/order";
import { askAssistant, ChatError, NO_DATA_REPLY } from "../gemini";
import { runTool } from "../tools";

const seed = priceSeedOrders(seedFile.orders as SeedOrder[], menuData);
const TODAY = "2026-11-26";

// Fake Gemini replies.
const callTool = (name: string, args: Record<string, unknown> = {}) => ({
  candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args } }] } }],
});
const sayText = (text: string) => ({
  candidates: [{ content: { role: "model", parts: [{ text }] } }],
});

// Make fetch return these responses in order, and record every request body.
function mockGemini(...replies: { status?: number; body: unknown }[]) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const queue = [...replies];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const reply = queue.shift()!;
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  });
  return requests;
}

function ask(question: string, orders: StoredOrder[] = seed, apiKey: string | undefined = "test-key") {
  return askAssistant(question, { apiKey, ctx: { orders, menu: menuData }, today: TODAY, models: ["test-model"] });
}

// The function result we sent back to Gemini in request number `index`.
function sentResult(requests: { body: Record<string, unknown> }[], index: number) {
  const contents = requests[index].body.contents as { parts: { functionResponse?: { response: { result: unknown } } }[] }[];
  return contents[contents.length - 1].parts[0].functionResponse?.response.result;
}

afterEach(() => vi.restoreAllMocks());

describe("Part F - assistant with function calling", () => {
  it("runs the tool Gemini picks and sends the result back", async () => {
    const requests = mockGemini(
      { body: callTool("totalRevenue") },
      { body: sayText("Total revenue is 4,995.00 BDT from 6 orders.") },
    );

    const reply = await ask("What is our total revenue?");

    expect(reply.answer).toBe("Total revenue is 4,995.00 BDT from 6 orders.");
    expect(reply.toolsUsed).toEqual(["totalRevenue"]);
    expect(sentResult(requests, 1)).toEqual({ totalRevenueBDT: "4,995.00", orderCount: 6 });
  });

  it("never sends the raw orders to Gemini, only tool declarations", async () => {
    const requests = mockGemini({ body: callTool("countOrders") }, { body: sayText("6 orders.") });

    await ask("How many orders?");
    const firstRequest = JSON.stringify(requests[0].body);

    expect(firstRequest).not.toContain("ORD-100");
    expect(firstRequest).toContain("countOrders"); // the tool list
  });

  it("TC-18: answers use the current orders, so a checkout changes it by one", async () => {
    const newOrder: StoredOrder = { ...seed[0], id: "ORD-1007", source: "checkout" };
    const requests = mockGemini(
      { body: callTool("countOrders") },
      { body: sayText("There are 6 orders.") },
      { body: callTool("countOrders") },
      { body: sayText("There are 7 orders.") },
    );

    await ask("How many orders?", seed);
    await ask("How many orders?", [...seed, newOrder]);

    expect(sentResult(requests, 1)).toEqual({ orderCount: 6 });
    expect(sentResult(requests, 3)).toEqual({ orderCount: 7 });
  });

  it("TC-19: best-selling option comes from the stats function", () => {
    const result = runTool("bestSellingOption", {}, { orders: seed, menu: menuData }) as {
      bestSellers: unknown[];
    };
    expect(result.bestSellers).toEqual([{ option: "Fried", units: 10 }]);
  });

  it("TC-20: a refusal without numbers is passed through", async () => {
    mockGemini({
      body: sayText("I can't tell who your best customer is: the orders don't record any customer."),
    });

    const reply = await ask("Who is our best customer?");

    expect(reply.answer).toMatch(/don't record any customer/);
    expect(reply.toolsUsed).toEqual([]);
  });

  it("D5: an answer with numbers but no tool call is replaced (no made-up figures)", async () => {
    mockGemini({ body: sayText("Your best customer is Rahim with 12 orders.") });

    const reply = await ask("Who is our best customer?");

    expect(reply.answer).toBe(NO_DATA_REPLY);
  });

  it("ordersOnDate and couponUsage tools use our stats", () => {
    const ctx = { orders: seed, menu: menuData };

    expect(runTool("ordersOnDate", { date: "2026-11-21" }, ctx)).toMatchObject({
      orderCount: 2,
      revenueBDT: "1,849.00",
    });
    expect(runTool("couponUsage", { code: "MORNING15" }, ctx)).toMatchObject({
      ordersWithCode: 4,
      appliedCount: 3,
    });
    expect(runTool("noSuchTool", {}, ctx)).toEqual({ error: "Unknown tool: noSuchTool" });
  });
});

describe("Part F - error messages", () => {
  async function errorKind(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      return error instanceof ChatError ? error.kind : "not a ChatError";
    }
    return "no error";
  }

  it("missing key: clear message and no request is sent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(await errorKind(ask("How many orders?", seed, ""))).toBe("missingKey");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("invalid key (400 API key not valid)", async () => {
    mockGemini({ status: 400, body: { error: { message: "API key not valid. Please pass a valid API key." } } });
    expect(await errorKind(ask("How many orders?"))).toBe("invalidKey");
  });

  it("quota (429)", async () => {
    mockGemini({ status: 429, body: { error: { message: "Resource exhausted" } } });
    expect(await errorKind(ask("How many orders?"))).toBe("quota");
  });

  it("busy (503)", async () => {
    mockGemini({ status: 503, body: { error: { message: "high demand" } } });
    expect(await errorKind(ask("How many orders?"))).toBe("busy");
  });

  it("busy model: falls back to the next Flash model and stays on it", async () => {
    const requests = mockGemini(
      { status: 503, body: { error: { message: "high demand" } } },
      { body: callTool("countOrders") },
      { body: sayText("There are 6 orders.") },
    );

    const reply = await askAssistant("How many orders?", {
      apiKey: "test-key",
      ctx: { orders: seed, menu: menuData },
      today: TODAY,
      models: ["model-a", "model-b"],
    });

    expect(reply.answer).toBe("There are 6 orders.");
    expect(requests.map((r) => r.url.split("/").pop())).toEqual([
      "model-a:generateContent",
      "model-b:generateContent",
      "model-b:generateContent",
    ]);
  });

  it("quota error does not try other models", async () => {
    const requests = mockGemini({ status: 429, body: { error: { message: "Resource exhausted" } } });

    const promise = askAssistant("How many orders?", {
      apiKey: "test-key",
      ctx: { orders: seed, menu: menuData },
      today: TODAY,
      models: ["model-a", "model-b"],
    });

    expect(await errorKind(promise)).toBe("quota");
    expect(requests).toHaveLength(1);
  });

  it("network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await errorKind(ask("How many orders?"))).toBe("network");
  });
});
