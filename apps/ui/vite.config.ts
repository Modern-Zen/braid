import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";

// Two entries, served by the Worker as static assets:
//   /      → index.html      (landing)
//   /app/  → app/index.html  (the app)
// `pnpm --filter @braid/ui dev` proxies the dynamic routes to `wrangler dev` on :8787.
const worker = "http://localhost:8787";

/**
 * The app routes client-side (/app/scout/dark-mode, /app/logbook/a41c3f7 …).
 * In dev and preview, serve app/index.html for any /app/* path that isn't a file,
 * the way the Worker does in production.
 */
function appFallback(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const url = req.url ?? "";
    const [path, query] = url.split("?");
    if (path && /^\/app(\/|$)/.test(path) && !/\.[a-z0-9]+$/i.test(path)) {
      req.url = `/app/index.html${query ? `?${query}` : ""}`;
    }
    next();
  };
  return {
    name: "braid-app-fallback",
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  plugins: [react(), appFallback()],
  appType: "mpa",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL("./index.html", import.meta.url)),
        app: fileURLToPath(new URL("./app/index.html", import.meta.url)),
      },
      // @braid/protocol is pure declarations. Without this, its MCP tool schemas (and zod)
      // ride along into the browser even though the UI never imports them.
      treeshake: {
        moduleSideEffects: (id) => !/[\\/]packages[\\/]protocol[\\/]src[\\/]/.test(id),
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
