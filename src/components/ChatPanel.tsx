import { useState } from "react";
import type { MenuData } from "../types/menu";
import type { StoredOrder } from "../types/order";
import { askAssistant, ChatError } from "../chat/gemini";
import { dhakaDate } from "../engine/stats";
import { serverNow } from "../api/client";

interface Props {
  orders: StoredOrder[];
  menu: MenuData;
}

interface Message {
  from: "staff" | "bot";
  text: string;
  isError?: boolean;
  toolsUsed?: string[];
}

const EXAMPLES = [
  "How many orders?",
  "What is the total revenue?",
  "What is the best-selling option?",
  "Revenue by payment method",
  "Average order value?",
  "How many orders actually got MORNING15?",
  "Orders on 2026-11-21",
  "Who is our best customer?",
];

export function ChatPanel({ orders, menu }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setMessages((m) => [...m, { from: "staff", text: trimmed }]);
    setQuestion("");
    setBusy(true);

    try {
      const today = dhakaDate(serverNow().toISOString());
      const reply = await askAssistant(trimmed, {
        apiKey: import.meta.env.VITE_GEMINI_API_KEY,
        // `orders` is the latest list from the server: after a checkout App
        // refreshes it, so the next answer already counts the new order
        // (TC-18, no reload needed).
        ctx: { orders, menu },
        today,
      });
      setMessages((m) => [...m, { from: "bot", text: reply.answer, toolsUsed: reply.toolsUsed }]);
    } catch (error) {
      const text = error instanceof ChatError ? error.message : "Something went wrong. Please try again.";
      setMessages((m) => [...m, { from: "bot", text, isError: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Sales assistant</h2>
      <p className="muted small">
        Ask about sales in plain English (or Bangla). Numbers come from our own code; Gemini only
        writes the sentence.
      </p>

      <div className="examples">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" disabled={busy} onClick={() => ask(example)}>
            {example}
          </button>
        ))}
      </div>

      <ul className="chat" aria-live="polite">
        {messages.map((message, index) => (
          <li key={index} className={`bubble ${message.from}${message.isError ? " error" : ""}`}>
            {message.text}
            {message.toolsUsed && message.toolsUsed.length > 0 && (
              <div className="muted small">Data from: {message.toolsUsed.join(", ")}</div>
            )}
          </li>
        ))}
        {busy && <li className="bubble bot muted">Thinking…</li>}
      </ul>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. How much did we sell on 2026-11-22?"
          aria-label="Question"
        />
        <button type="submit" className="primary" disabled={busy || !question.trim()}>
          Ask
        </button>
      </form>
    </section>
  );
}
