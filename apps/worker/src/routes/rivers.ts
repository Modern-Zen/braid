// /api/rivers/* (humans, behind Access) and /api/admin/rivers/* (operators).
import { Hono } from "hono";
import { getAgentByName } from "agents";
import {
  channelRepoName,
  mainRepoName,
  parseRepoName,
  parseTrailers,
  type EddyDecision,
  type OpenIntentRequest,
  type RiverSummary,
} from "@braid/protocol";
import { deleteRepoIfExists, mintToken, repoInfo } from "../artifacts.ts";
import type { HwEnv } from "../auth.ts";
import { commitView } from "../commits.ts";
import { deleteRiverWork, getChannel, listChannels, listRivers } from "../db.ts";
import { decide, eddyView } from "../eddy.ts";
import { issueAgentToken } from "../mcp.ts";
import { scoutView } from "../scout.ts";
import { createRiver, HttpError, openIntent, refreshHead, riverSummary, type CreateRiverRequest } from "../intents.ts";

export const rivers = new Hono<HwEnv>();

rivers.get("/", async (c) => {
  const all = await listRivers(c.env.DB);
  const out: RiverSummary[] = await Promise.all(
    all.map(async (r) => {
      const s = await (await getAgentByName(c.env.RiverAgent, r.id)).snapshot();
      return { id: r.id, name: r.name, owner: r.owner, repo: r.mainRepo, head: s.head, intents: s.intents.length, decisions: s.decisions };
    }),
  );
  return c.json({ rivers: out });
});

rivers.get("/:id", async (c) => {
  const { river, intents, channels } = await riverSummary(c.env, c.req.param("id"));
  return c.json({ river, intents, channels });
});

/** REST fallback for the live state (the UI normally uses the WebSocket). */
rivers.get("/:id/state", async (c) => {
  const river = await getAgentByName(c.env.RiverAgent, c.req.param("id"));
  return c.json(await river.snapshot());
});

rivers.get("/:id/feed", async (c) => {
  const river = await getAgentByName(c.env.RiverAgent, c.req.param("id"));
  return c.json({ feed: await river.getFeed(Number(c.req.query("limit") ?? 100)) });
});

rivers.post("/:id/intents", async (c) => {
  const body = await c.req.json<OpenIntentRequest>();
  const result = await openIntent(c.env, c.req.param("id"), body);
  return c.json(result, 201);
});

rivers.get("/:id/intents/:intent/scout", async (c) => {
  const view = await scoutView(c.env, c.req.param("id"), c.req.param("intent"));
  return view ? c.json(view) : c.json({ error: "not found" }, 404);
});

rivers.get("/:id/eddy", async (c) => c.json(await eddyView(c.env, c.req.param("id"))));

rivers.post("/:id/eddy/:card", async (c) => {
  const { action } = await c.req.json<EddyDecision>();
  const principal = c.get("principal");
  const by = principal.kind === "human" ? principal.email : "operator";
  return c.json(await decide(c.env, c.req.param("id"), decodeURIComponent(c.req.param("card")), action, by));
});

/** GET /api/rivers/:id/commits/:sha?repo=<repo> — the Logbook / commit view. */
rivers.get("/:id/commits/:sha", async (c) => {
  const riverId = c.req.param("id");
  const repo = c.req.query("repo") ?? mainRepoName(riverId);
  const view = await commitView(c.env, riverId, repo, c.req.param("sha"));
  return view ? c.json(view) : c.json({ error: "not found" }, 404);
});

/** Recent commits on a repo (main by default), newest first, for the Logbook screen. */
rivers.get("/:id/commits", async (c) => {
  const riverId = c.req.param("id");
  const repo = c.req.query("repo") ?? mainRepoName(riverId);
  if (parseRepoName(repo).kind === "other") return c.json({ error: "not a River repo" }, 400);
  using r = await c.env.ARTIFACTS.get(repo);
  const log = await r.log({ ref: "main", limit: Number(c.req.query("limit") ?? 30) });
  return c.json({
    repo,
    commits: log.map((m) => ({ sha: m.hash, subject: m.message.split("\n")[0], trailers: parseTrailers(m.message), committedAt: m.committedAt })),
  });
});

rivers.get("/:id/screenshots/:channel", async (c) => {
  const ch = await getChannel(c.env.DB, c.req.param("id"), c.req.param("channel"));
  if (!ch?.screenshotKey) return c.json({ error: "not found" }, 404);
  const obj = await c.env.BLOBS.get(ch.screenshotKey);
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType ?? "image/png", "cache-control": "private, max-age=60" } });
});

rivers.get("/:id/transcripts/:channel", async (c) => {
  const obj = await c.env.BLOBS.get(`transcripts/${c.req.param("id")}/${c.req.param("channel")}.jsonl`);
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
});

// ── Operators ─────────────────────────────────────────────────────────────────

export const adminRivers = new Hono<HwEnv>();

/** Create a River. Returns a 15-minute write token only when main is empty, for the seed push. */
adminRivers.post("/", async (c) => {
  const body = await c.req.json<CreateRiverRequest>();
  return c.json(await createRiver(c.env, body), 201);
});

adminRivers.post("/:id/refresh", async (c) => c.json({ head: await refreshHead(c.env, c.req.param("id")) }));

/** Mint a River agent token for MCP (shown once). */
adminRivers.post("/:id/agent-token", async (c) => {
  const riverId = c.req.param("id");
  const body = await c.req.json<{ label?: string }>().catch(() => ({ label: undefined }));
  const token = await issueAgentToken(c.env, riverId, body.label ?? "agent");
  return c.json({ river: riverId, token, mcp: new URL("/mcp", c.req.url).toString() }, 201);
});

/** Operator-only 10-minute write token for main (seed and reset scripts). Never sent to a browser. */
adminRivers.post("/:id/main-token", async (c) => {
  const riverId = c.req.param("id");
  const repo = mainRepoName(riverId);
  const token = await mintToken(c.env.ARTIFACTS, repo, "write", 600);
  const info = await repoInfo(c.env.ARTIFACTS, repo);
  if (!info) throw new HttpError(404, `No repo ${repo}`);
  return c.json({ repo, remote: info.remote, token: token.plaintext, expiresAt: token.expiresAt });
});

/**
 * Demo reset: stop Channels, delete Channel and Confluence forks, clear D1 work and the River
 * state. Main is left as is; `pnpm reset:demo` force-pushes the seed commit back.
 */
adminRivers.post("/:id/reset", async (c) => {
  const riverId = c.req.param("id");
  const channels = await listChannels(c.env.DB, riverId);
  for (const ch of channels) {
    await (await getAgentByName(c.env.ChannelAgent, `${riverId}:${ch.id}`)).stop("reset");
  }
  const deleted: string[] = [];
  // Delete every fork of this River, including ones D1 no longer knows about.
  let cursor: string | undefined;
  do {
    const page = await c.env.ARTIFACTS.list({ limit: 100, cursor });
    for (const r of page.repos) {
      const parsed = parseRepoName(r.name);
      if ((parsed.kind === "channel" || parsed.kind === "confluence") && parsed.river === riverId) {
        if (await deleteRepoIfExists(c.env.ARTIFACTS, r.name)) deleted.push(r.name);
      }
    }
    cursor = page.cursor;
  } while (cursor);
  for (const ch of channels) if (!deleted.includes(ch.repo)) await deleteRepoIfExists(c.env.ARTIFACTS, channelRepoName(riverId, Number(ch.id.slice(3))));
  await deleteRiverWork(c.env.DB, riverId);
  await (await getAgentByName(c.env.RiverAgent, riverId)).reset();
  return c.json({ ok: true, main: mainRepoName(riverId), deleted });
});

export function httpErrorStatus(err: unknown): { status: number; message: string } | null {
  return err instanceof HttpError ? { status: err.status, message: err.message } : null;
}
