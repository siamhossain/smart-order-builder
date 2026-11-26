import type { MenuData } from "../types/menu";
import type { StoredOrder } from "../types/order";
import { formatBDT } from "../engine/money";
import {
  averageOrderValue,
  bestSellingOptions,
  countOrders,
  couponUsage,
  dhakaDate,
  ordersOnDate,
  revenueByPaymentMethod,
  totalRevenue,
  unitsByOption,
} from "../engine/stats";

// Checkpoint C2 - every question the bot supports and the function behind it.
// Gemini sees only the `declaration` (name, description, parameters). When it
// asks for a tool, OUR code runs `run` on the current orders and sends the
// result back. Money is sent as ready-made BDT strings ("4,995.00") so the
// model never has to convert or calculate anything.

export interface ToolContext {
  orders: StoredOrder[];
  menu: MenuData;
}

// The JSON-schema format Gemini expects for function declarations.
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

interface Tool {
  declaration: FunctionDeclaration;
  run: (args: Record<string, unknown>, ctx: ToolContext) => unknown;
}

const TOOLS: Tool[] = [
  {
    declaration: {
      name: "countOrders",
      description: "How many orders there are in total.",
    },
    run: (_args, { orders }) => ({ orderCount: countOrders(orders) }),
  },
  {
    declaration: {
      name: "totalRevenue",
      description: "Total revenue (sum of payable amounts) of all orders, in BDT.",
    },
    run: (_args, { orders }) => ({
      totalRevenueBDT: formatBDT(totalRevenue(orders)),
      orderCount: countOrders(orders),
    }),
  },
  {
    declaration: {
      name: "bestSellingOption",
      description:
        "The best-selling menu option counted in units (line quantity x option quantity), plus the top 5.",
    },
    run: (_args, { orders, menu }) => ({
      bestSellers: bestSellingOptions(orders, menu).map((o) => ({ option: o.name, units: o.units })),
      top5: unitsByOption(orders, menu)
        .slice(0, 5)
        .map((o) => ({ option: o.name, units: o.units })),
    }),
  },
  {
    declaration: {
      name: "revenueByPaymentMethod",
      description: "Revenue and order count for each payment method (card, bkash, cash), highest first.",
    },
    run: (_args, { orders }) => ({
      byMethod: revenueByPaymentMethod(orders).map((m) => ({
        method: m.method,
        revenueBDT: formatBDT(m.revenue),
        orderCount: m.orderCount,
      })),
    }),
  },
  {
    declaration: {
      name: "averageOrderValue",
      description: "Average payable amount per order, in BDT.",
    },
    run: (_args, { orders }) => ({
      averageOrderValueBDT: formatBDT(averageOrderValue(orders)),
      orderCount: countOrders(orders),
    }),
  },
  {
    declaration: {
      name: "couponUsage",
      description:
        "For a coupon code: how many orders entered it, how many actually received the discount, and why the others did not.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "Coupon code, e.g. MORNING15" },
        },
        required: ["code"],
      },
    },
    run: (args, { orders }) => couponUsage(orders, String(args.code ?? "")),
  },
  {
    declaration: {
      name: "ordersOnDate",
      description:
        "Orders placed on one calendar day in Bangladesh time: count, revenue and the list of orders.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "The day as YYYY-MM-DD, e.g. 2026-11-21" },
        },
        required: ["date"],
      },
    },
    run: (args, { orders }) => {
      const date = String(args.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { error: "date must be YYYY-MM-DD" };
      }
      const matching = ordersOnDate(orders, date);
      return {
        date,
        orderCount: matching.length,
        revenueBDT: formatBDT(totalRevenue(matching)),
        orders: matching.map((o) => ({
          id: o.id,
          paymentMethod: o.paymentMethod,
          payableBDT: formatBDT(o.totals.payable),
        })),
      };
    },
  },
  {
    // D5: lets the model check what the data does NOT contain (customers,
    // costs...) so it can say "I can't know that" instead of guessing.
    declaration: {
      name: "describeAvailableData",
      description:
        "What information the order data contains and what it does NOT contain. Use it when unsure whether a question can be answered.",
    },
    run: (_args, { orders }) => ({
      eachOrderHas: [
        "order id",
        "date and time",
        "payment method (card, bkash, cash)",
        "items with options and quantities",
        "coupon code entered and whether it was applied",
        "prices: subtotal, discount, VAT, payable",
      ],
      notInTheData: [
        "customer names, ids, phone numbers or any customer identity",
        "staff or cashier names",
        "ingredient cost, profit or margin",
        "refunds or cancellations",
      ],
      dateRange:
        orders.length > 0
          ? { from: dhakaDate(orders[0].createdAt), to: dhakaDate(orders[orders.length - 1].createdAt) }
          : null,
    }),
  },
];

export const toolDeclarations: FunctionDeclaration[] = TOOLS.map((t) => t.declaration);

// Run the tool Gemini asked for, on the CURRENT orders.
export function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): unknown {
  const tool = TOOLS.find((t) => t.declaration.name === name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  return tool.run(args, ctx);
}
