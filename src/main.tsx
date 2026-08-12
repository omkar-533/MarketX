import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { warmupApiServer } from "./services/apiAutoConnect";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./context/ThemeContext";
import {
  clearStaleChunkReloadFlag,
  isStaleChunkError,
  reloadOnceForStaleChunk,
} from "./utils/lazyWithRetry";

try {
  warmupApiServer();
} catch (err) {
  console.warn("[main] API warmup skipped:", err);
}

/**
 * Service workers were causing full-page reload loops
 * (unregister → register → skipWaiting → clients.claim on every visit).
 * Unregister once and do NOT re-register.
 */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then(() => caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))))
      .catch(() => undefined);
  });
}

/** After a successful boot, allow another chunk-reload if a later deploy happens. */
window.addEventListener("load", () => {
  window.setTimeout(() => clearStaleChunkReloadFlag(), 2500);
});

window.addEventListener("unhandledrejection", (event) => {
  if (isStaleChunkError(event.reason) && reloadOnceForStaleChunk()) {
    event.preventDefault();
  }
});

window.addEventListener(
  "error",
  (event) => {
    const msg = event.message || "";
    if (
      /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk/i.test(
        msg,
      ) &&
      reloadOnceForStaleChunk()
    ) {
      event.preventDefault();
    }
  },
  true,
);

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
    if (isStaleChunkError(err) && reloadOnceForStaleChunk()) {
      /* reload */
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      rootEl.innerHTML = `<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;background:#0a0e17;color:#e2e8f0;font-family:system-ui"><p style="font-weight:600">Sorry — app could not start</p><p style="color:#94a3b8;font-size:14px;max-width:420px;text-align:center">Please refresh once. If it keeps happening, clear site data for this site.</p><button type="button" onclick="location.reload()" style="padding:8px 16px;border-radius:8px;border:1px solid #d4af3766;background:#d4af3722;color:#d4af37;cursor:pointer">Refresh</button></div>`;
      console.error("[main] bootstrap failed:", err, msg);
    }
  }
}
