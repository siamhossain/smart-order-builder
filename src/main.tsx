import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// There is no real backend: the MSW mock server IS the server, so it runs
// in development and in a production build (e.g. a live demo) alike.
async function enableMocking() {
  const { worker } = await import("./mocks/browser");

  // Requests MSW has no handler for (e.g. Gemini) go to the real network.
  await worker.start({ onUnhandledFrame: "bypass" });
}

enableMocking().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
