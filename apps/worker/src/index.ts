// Headwaters Worker.
//   /            landing page (static assets, public)
//   /app/*       the app (static assets; human routes sit behind Cloudflare Access)
//   /api/*       REST
//   /mcp         MCP server for agents (M8)
//   /ws/river/:id  live River socket (RiverAgent)
//   /health      liveness
import { Hono } from "hono";
import { getAgentByName } from "agents";
import { requireAdmin, requireHuman, type HwEnv } from "./auth.ts";
import { handleArtifactsQueue } from "./events.ts";
import { prepareSmoke, runSmoke, verifySmoke } from "./smoke.ts";
import { adminRivers, httpErrorStatus, rivers } from "./routes/rivers.ts";

export { RiverAgent } from "./agents/river.ts";
export { ChannelAgent } from "./agents/channel.ts";
export { AgentSandbox, Outbound } from "./sandbox.ts";
export { ReviewWorkflow } from "./workflows/review.ts";
export { ConfluenceWorkflow } from "./workflows/confluence.ts";

type App = HwEnv;

const app = new Hono<App>();

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "headwaters",
    mode: c.env.BRAID_AGENT_MODE,
    time: new Date().toISOString(),
  }),
);

// ── Operator routes ───────────────────────────────────────────────────────────
const admin = new Hono<App>();
admin.use("*", requireAdmin);

admin.post("/smoke", async (c) => {
  const report = await runSmoke(c.env);
  return c.json(report, report.ok ? 200 : 500);
});

// `pnpm smoke --local-git`: the operator's git does the push. Tokens are 10-minute, operator-only.
admin.post("/smoke/prepare", async (c) => c.json(await prepareSmoke(c.env)));
admin.post("/smoke/verify", async (c) => {
  const body = await c.req.json<{ path: string; content: string; sha: string }>();
  return c.json(await verifySmoke(c.env, body));
});

/** Raw Artifacts events in R2, newest first. ?day=YYYY-MM-DD&contains=<text> */
admin.get("/events", async (c) => {
  const day = c.req.query("day") ?? new Date().toISOString().slice(0, 10);
  const contains = c.req.query("contains");
  const listed = await c.env.BLOBS.list({ prefix: `events/${day}/`, limit: 1000, include: ["customMetadata"] });
  const objects = listed.objects
    .filter((o) => !contains || o.key.includes(contains))
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .slice(0, 100)
    .map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded, meta: o.customMetadata }));
  return c.json({ day, count: objects.length, objects });
});

admin.get("/events/object", async (c) => {
  const key = c.req.query("key");
  if (!key?.startsWith("events/")) return c.json({ error: "key must start with events/" }, 400);
  const obj = await c.env.BLOBS.get(key);
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, { headers: { "content-type": "application/json" } });
});

admin.route("/rivers", adminRivers);

// ── Human API ─────────────────────────────────────────────────────────────────
const api = new Hono<App>();
api.route("/admin", admin);
api.use("/rivers", requireHuman);
api.use("/rivers/*", requireHuman);
api.route("/rivers", rivers);
app.route("/api", api);

// ── Live River socket ─────────────────────────────────────────────────────────
app.get("/ws/river/:id", requireHuman, async (c) => {
  const river = await getAgentByName(c.env.RiverAgent, c.req.param("id"));
  return river.fetch(c.req.raw);
});

// ── MCP (M8) ──────────────────────────────────────────────────────────────────
app.all("/mcp", (c) => c.json({ error: "The MCP server lands in M8" }, 501));

// ── App shell: /app/* serves the app entry for client-side routes ─────────────
app.get("/app", (c) => c.redirect("/app/", 301));
app.get("/app/*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status !== 404) return res;
  return c.env.ASSETS.fetch(new URL("/app/index.html", c.req.url));
});

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.env.ASSETS.fetch(c.req.raw)));

app.onError((err, c) => {
  const known = httpErrorStatus(err);
  if (known) return c.json({ error: known.message }, known.status as 400);
  console.error("unhandled", { path: c.req.path, err: err.stack ?? String(err) });
  return c.json({ error: "internal error" }, 500);
});

export default {
  fetch: app.fetch,
  queue: handleArtifactsQueue,
} satisfies ExportedHandler<Env>;
