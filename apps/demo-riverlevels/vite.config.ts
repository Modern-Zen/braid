/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";

// `pnpm dev` serves the UI and answers /api/* from the same Hono app the Worker
// runs, loaded through Vite's SSR loader, so one command runs the whole thing.
function api(): Plugin {
  return {
    name: "riverlevels-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        try {
          const { app } = await server.ssrLoadModule("/src/worker.ts");
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
          }
          const response: Response = await app.request(req.url, { method: req.method, headers });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(new Uint8Array(await response.arrayBuffer()));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  // JSX through esbuild's automatic runtime; no Babel, no extra plugin.
  esbuild: { jsx: "automatic" },
  plugins: [api()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
