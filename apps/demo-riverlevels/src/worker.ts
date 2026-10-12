import { Hono } from "hono";
import { api } from "./api";

// The Worker answers /api/*. Everything else is the built UI in dist/, served as
// static assets (see `assets` in wrangler.jsonc).
export const app = new Hono();

app.route("/api", api);
app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
