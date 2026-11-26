import { runTool, toolDeclarations, type ToolContext } from "./tools";

// Part F - talk to Gemini with function calling.
//
// 1. We send the question + the list of tools (no order data at all).
// 2. Gemini answers "call tool X with args Y".
// 3. Our code runs X on the current orders and sends the result back.
// 4. Gemini turns that result into a sentence.
// Every number in the answer therefore comes from our own code.

// Flash models to try, in order. Free-tier Flash models are sometimes
// overloaded (503) or very slow; then we try the next one. If the
// VITE_GEMINI_MODEL env variable is set, only that model is used.
export const GEMINI_MODELS: string[] = import.meta.env.VITE_GEMINI_MODEL
  ? [import.meta.env.VITE_GEMINI_MODEL]
  : ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TOOL_ROUNDS = 3;
const TIMEOUT_MS = 20_000;

export type ChatErrorKind =
  | "missingKey"
  | "invalidKey"
  | "quota"
  | "busy" // overloaded (503) or too slow
  | "modelUnavailable" // this model can't be used with this key (404)
  | "network"
  | "other";

export class ChatError extends Error {
  kind: ChatErrorKind;
  constructor(kind: ChatErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

// D5: when the model answers WITHOUT calling any tool, it has no real data,
// so the answer must not contain numbers. If it does, we replace it with
// this safe reply instead of showing a possibly invented figure.
export const NO_DATA_REPLY =
  "I can only answer from the order data, and I couldn't find that in it. " +
  "I can tell you about order counts, revenue, best-selling options, payment methods, " +
  "average order value, coupon usage and orders on a given date.";

function systemInstruction(today: string): string {
  return [
    "You are a sales assistant for shop staff of a breakfast shop in Bangladesh.",
    `Today's date in Bangladesh is ${today}. Money is in BDT (Taka).`,
    "Rules:",
    "- You never calculate or guess numbers. Every number in your answer must come from a tool result in this conversation.",
    "- For any question about orders, revenue, options, payments, coupons or dates, call the matching tool first.",
    "- If no tool can answer the question (for example customers, profit, staff), say clearly that the order data does not contain that information. Do not invent names, people or numbers. You may call describeAvailableData to check.",
    "- Answer in one or two short sentences, in the language of the question (English or Bangla).",
  ].join("\n");
}

// Gemini's message format (only the parts we use).
interface Part {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: { result: unknown } };
  thoughtSignature?: string;
}
interface Content {
  role: "user" | "model";
  parts: Part[];
}

async function callGemini(apiKey: string, model: string, today: string, contents: Content[]) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Key in a header, not the URL, so it doesn't end up in logs.
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction(today) }] },
        contents,
        tools: [{ functionDeclarations: toolDeclarations }],
        generationConfig: { temperature: 0 },
      }),
      // Give up on a model that hangs, so the user isn't left waiting.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ChatError("busy", "Gemini took too long to answer. Please try again in a moment.");
    }
    throw new ChatError("network", "Could not reach Gemini. Check your internet connection and try again.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw toChatError(response.status, data, model);
  return data;
}

// Turn an HTTP error from Gemini into a clear message for the staff.
function toChatError(status: number, data: { error?: { message?: string; status?: string } }, model: string): ChatError {
  const message = data.error?.message ?? "";

  if (status === 429) {
    return new ChatError("quota", "Gemini's free quota is used up for now (429). Wait a minute and try again.");
  }
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(message))) {
    return new ChatError("invalidKey", "The Gemini API key is not valid. Check VITE_GEMINI_API_KEY in .env.local and restart the dev server.");
  }
  if (status === 500 || status === 503) {
    return new ChatError("busy", "Gemini is busy right now. Please try again in a moment.");
  }
  if (status === 404) {
    return new ChatError("modelUnavailable", `The model "${model}" is not available for this key. Set VITE_GEMINI_MODEL in .env.local.`);
  }
  return new ChatError("other", `Gemini error ${status}: ${message || "unknown error"}`);
}

// Errors where another model might still work.
const TRY_NEXT_MODEL: ChatErrorKind[] = ["busy", "modelUnavailable", "network"];

// Try each model in order until one answers. If all fail, report the last
// error (a real network problem fails on every model, so it still shows).
async function firstWorkingModel(apiKey: string, models: string[], today: string, contents: Content[]) {
  let lastError: unknown = new ChatError("other", "No Gemini model configured.");
  for (const model of models) {
    try {
      return { model, data: await callGemini(apiKey, model, today, contents) };
    } catch (error) {
      if (error instanceof ChatError && TRY_NEXT_MODEL.includes(error.kind)) {
        lastError = error;
        continue;
      }
      throw error; // wrong key, quota...: another model won't help
    }
  }
  throw lastError;
}

export interface AssistantReply {
  answer: string;
  toolsUsed: string[];
}

export async function askAssistant(
  question: string,
  options: { apiKey: string | undefined; ctx: ToolContext; today: string; models?: string[] },
): Promise<AssistantReply> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new ChatError(
      "missingKey",
      "No Gemini API key. Add VITE_GEMINI_API_KEY=your-key to .env.local and restart npm run dev.",
    );
  }
  const models = options.models ?? GEMINI_MODELS;

  // Each question starts a fresh conversation, so an old answer can never
  // be reused for numbers: every answer is calculated from current orders.
  const contents: Content[] = [{ role: "user", parts: [{ text: question }] }];
  const toolsUsed: string[] = [];

  // The model that answered the first call; the follow-up calls for the
  // same question stay on it.
  let model: string | null = null;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let data;
    if (model === null) {
      const first = await firstWorkingModel(apiKey, models, options.today, contents);
      model = first.model;
      data = first.data;
    } else {
      data = await callGemini(apiKey, model, options.today, contents);
    }
    const content: Content | undefined = data.candidates?.[0]?.content;
    if (!content?.parts) {
      throw new ChatError("other", "Gemini returned an empty answer. Try asking in a different way.");
    }

    const calls = content.parts.filter((p) => p.functionCall);

    if (calls.length === 0) {
      const text = content.parts.map((p) => p.text ?? "").join("").trim();
      // No tool was used, so any number in the text would be made up.
      if (toolsUsed.length === 0 && /\d/.test(text)) {
        return { answer: NO_DATA_REPLY, toolsUsed };
      }
      return { answer: text || NO_DATA_REPLY, toolsUsed };
    }

    // Keep the model's turn exactly as sent (it may carry a thoughtSignature
    // that Gemini needs back), then add our tool results.
    contents.push(content);
    contents.push({
      role: "user",
      parts: calls.map((part) => {
        const call = part.functionCall!;
        toolsUsed.push(call.name);
        return {
          functionResponse: {
            name: call.name,
            response: { result: runTool(call.name, call.args ?? {}, options.ctx) },
          },
        };
      }),
    });
  }

  throw new ChatError("other", "Gemini asked for too many tools. Try a simpler question.");
}
