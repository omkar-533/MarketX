import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { warmupApiServer } from "./services/apiAutoConnect";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./context/ThemeContext";

try {
  warmupApiServer();
} catch (err) {
  console.warn("[main] API warmup skipped:", err);
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML =
    '<p style="padding:2rem;font-family:system-ui;color:#f87171">App root missing (#root).</p>';
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </ErrorBoundary>
      </StrictMode>,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    rootEl.innerHTML = `<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;background:#0a0e17;color:#e2e8f0;font-family:system-ui"><p style="font-weight:600">Failed to start app</p><p style="color:#94a3b8;font-size:14px;max-width:420px;text-align:center">${msg}</p><button type="button" onclick="location.reload()" style="padding:8px 16px;border-radius:8px;border:1px solid #d4af3766;background:#d4af3722;color:#d4af37;cursor:pointer">Reload</button></div>`;
    console.error('[main] bootstrap failed:', err);
  }
}
