// /api/rivers/* (humans, behind Access) and /api/admin/rivers/* (operators).
import { Hono } from "hono";
import { getAgentByName } from "agents";
import { channelRepoName, mainRepoName, parseRepoName, type OpenIntentRequest, type RiverSummary } from "@braid/protocol";
import { deleteRepoIfExists, mintToken, repoInfo } from "../artifacts.ts";
import type { HwEnv } from "../auth.ts";
import { deleteRiverWork, listChannels, listRivers } from "../db.ts";
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

// ── Operators ─────────────────────────────────────────────────────────────────

export const adminRivers = new Hono<HwEnv>();

/** Create a River. Returns a 15-minute write token only when main is empty, for the seed push. */
adminRivers.post("/", async (c) => {
  const body = await c.req.json<CreateRiverRequest>();
  return c.json(await createRiver(c.env, body), 201);
});

adminRivers.post("/:id/refresh", async (c) => c.json({ head: await refreshHead(c.env, c.req.param("id")) }));

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
