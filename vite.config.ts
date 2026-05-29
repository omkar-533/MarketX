import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { apiServerPlugin } from "./scripts/vite-api-server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function earlyApiWakePlugin() {
  const apiUrl = (process.env.VITE_API_URL || "").replace(/\/$/, "");
  return {
    name: "early-api-wake",
    transformIndexHtml(html: string) {
      if (!apiUrl) return html;
      const inject = `
    <link rel="preconnect" href="${apiUrl}" crossorigin />
    <link rel="dns-prefetch" href="${apiUrl}" />
    <script>
      (function () {
        var base = ${JSON.stringify(apiUrl)};
        fetch(base + "/api/health", { credentials: "include", mode: "cors" }).catch(function () {});
        setTimeout(function () {
          fetch(base + "/api/health", { credentials: "include", mode: "cors" }).catch(function () {});
        }, 1200);
      })();
    </script>`;
      return html.replace("</head>", `${inject}\n  </head>`);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(command === "serve" ? [apiServerPlugin()] : []),
    ...(command === "build" ? [earlyApiWakePlugin()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    target: "es2020",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("lightweight-charts")) return "vendor-charts";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("framer-motion")) return "vendor-motion";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        ws: true,
      },
      "/socket.io": {
        target: "http://localhost:5000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
}));
