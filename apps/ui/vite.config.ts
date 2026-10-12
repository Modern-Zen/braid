import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Two entries, served by the Worker as static assets:
//   /      → index.html      (landing)
//   /app/  → app/index.html  (the app)
// `pnpm --filter @braid/ui dev` proxies the dynamic routes to `wrangler dev` on :8787.
const worker = "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL("./index.html", import.meta.url)),
        app: fileURLToPath(new URL("./app/index.html", import.meta.url)),
      },
    },
  },
  server: {
    proxy: {
      "/api": worker,
      "/health": worker,
      "/mcp": worker,
      "/ws": { target: worker, ws: true },
    },
  },
});
