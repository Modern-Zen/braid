// MCP server at /mcp (Streamable HTTP). External agents of any vendor and any harness join a
// River here, take an Intent, declare Lines, write their Logbook, push to their own fork, and
// submit for Scout. Agents self-report their name and model; that is what the UI shows.
//
// Auth (see oauth.ts): OAuth 2.1 with dynamic client registration for clients that sign in,
// or a River agent token (`Authorization: Bearer hw_…`) for harnesses that send headers.
// Either way the request arrives here with props { riverId, client }.
import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { getAgentByName } from "agents";
import { z } from "zod";
import {
  McpTools,
  channelId as channelIdOf,
  channelRepoName,
  formatLogbook,
  logbookNumber,
  logbookPath,
  type ChannelView,
  type McpToolName,
} from "@braid/protocol";
import { forkRepo, mintToken, readText, waitReady } from "./artifacts.ts";
import { timingSafeEqual } from "./auth.ts";
import {
  getChannel,
  getIntent,
  getRiver,
  insertChannel,
  insertLogbookIndex,
  listChannels,
  listIntents,
  reserveChannelNumbers,
  reserveLogbookNumber,
  setIntentStatus,
  updateChannel,
} from "./db.ts";
import { channelFinished, openIntent } from "./intents.ts";

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mint a River agent token. Returned once; only its hash is stored. */
export async function issueAgentToken(env: Env, riverId: string, label: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = `hw_${riverId}_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  await env.DB.prepare("INSERT INTO river_tokens (token_hash, river_id, label, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), riverId, label, Date.now())
    .run();
  await (await getAgentByName(env.RiverAgent, riverId)).recordEvent({
    id: `token.issued:${riverId}:${label}:${Date.now()}`,
    type: "token.issued",
    at: Date.now(),
    riverId,
    detail: `${label} · scope: river`,
  });
  return token;
}

/** What an authorized MCP request carries (OAuth grant props or a River agent token). */
export interface McpProps {
  riverId: string;
  client: string;
}

/** A River agent token (`hw_<river>_<48 hex>`) → its River, if valid and not revoked. */
export async function riverForAgentToken(env: Env, token: string): Promise<string | null> {
  if (!/^hw_[a-z0-9-]+_[0-9a-f]{48}$/i.test(token)) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT river_id, token_hash FROM river_tokens WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(hash)
    .first<{ river_id: string; token_hash: string }>();
  return row && timingSafeEqual(row.token_hash, hash) ? row.river_id : null;
}

export async function handleMcp(request: Request, env: Env, ctx: ExecutionContext, props: McpProps | undefined): Promise<Response> {
  if (!props?.riverId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const host = new URL(request.url).hostname;
  const handler = createMcpHandler(() => buildServer(env, props.riverId), {
    route: "/mcp",
    allowedHostnames: [host],
    allowedOriginHostnames: [host],
  });
  return handler(request, env, ctx);
}

const RULES = `Headwaters protocol:
1. Work only in your own Channel fork (the remote channel_start gave you). Push with: git push origin HEAD:main
2. Before editing, call line_declare with the files you will touch. ok:false means another Channel holds an overlapping Line: narrow or yield.
3. End every commit message with the trailers channel_start returned (Headwaters-Intent, -Channel, -Agent, -Model, Logbook).
4. Call logbook_write, commit the returned file at the returned path with your last commit.
5. Run the tests, push, then call channel_submit.`;

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

function buildServer(env: Env, riverId: string): McpServer {
  const server = new McpServer({ name: "headwaters", version: "0.1.0" });
  const tool = <N extends McpToolName>(
    name: N,
    handler: (args: z.infer<z.ZodObject<(typeof McpTools)[N]["input"]>>) => Promise<ReturnType<typeof text> | ReturnType<typeof fail>>,
  ) => {
    const def = McpTools[name];
    server.registerTool(
      name,
      {
        title: def.title,
        description: def.description,
        inputSchema: z.object(def.input as z.ZodRawShape),
        annotations: { title: def.title, readOnlyHint: def.readOnly, destructiveHint: false, openWorldHint: false },
      },
      async (args: unknown) => {
        const a = args as { river?: string; channel?: string };
        if (a.river && a.river !== riverId) return fail(`This token is for River "${riverId}", not "${a.river}".`);
        if (a.channel !== undefined && !/^ch-\d+$/.test(a.channel)) return fail(`"${a.channel}" is not a Channel id (like ch-10).`);
        try {
          return await handler(args as never);
        } catch (err) {
          return fail(err instanceof Error ? err.message : String(err));
        }
      },
    );
  };

  tool("river_join", async ({ agent, model }) => {
    const river = await getRiver(env.DB, riverId);
    if (!river) return fail(`No River "${riverId}"`);
    const agentsMd = (await readText(env.ARTIFACTS, river.mainRepo, "main", "AGENTS.md").catch(() => null)) ?? "";
    const intents = await listIntents(env.DB, riverId);
    await (await getAgentByName(env.RiverAgent, riverId)).heartbeat(`mcp:${agent}`, agent, model);
    return text({
      river: river.id,
      main: river.mainRepo,
      rules: RULES,
      agentsMd,
      intents: intents.map((i) => ({ id: i.id, title: i.title, status: i.status })),
    });
  });

  tool("intent_list", async () => {
    const intents = await listIntents(env.DB, riverId);
    const channels = await listChannels(env.DB, riverId);
    return text(
      intents.map((i) => ({
        id: i.id,
        title: i.title,
        goal: i.goal,
        checks: i.checks,
        status: i.status,
        channels: channels.filter((c) => c.intentId === i.id).map((c) => ({ id: c.id, agent: c.agent, strategy: c.strategy, status: c.status })),
      })),
    );
  });

  tool("intent_open", async ({ title, goal, checks }) => {
    // External agents open the Intent without Headwaters fanning out; they take it with channel_start.
    const { intent } = await openIntent(env, riverId, { title, goal, checks: checks ?? [], strategies: [], mode: "live" });
    return text({ intent: intent.id, title: intent.title, next: "Call channel_start with this intent." });
  });

  tool("channel_start", async ({ intent: intentId, strategy: requested, agent, model }) => {
    const strategy = requested ?? "minimal-diff";
    if (!/^[a-z0-9][a-z0-9-]*$/.test(intentId)) return fail(`"${intentId}" is not an Intent id; call intent_list.`);
    const river = await getRiver(env.DB, riverId);
    const intent = await getIntent(env.DB, riverId, intentId);
    if (!river || !intent) return fail(`No Intent "${intentId}" on ${riverId}`);
    const n = await reserveChannelNumbers(env.DB, riverId, 1);
    const id = channelIdOf(n);
    const repo = channelRepoName(riverId, n);
    const fork = await forkRepo(env.ARTIFACTS, river.mainRepo, repo, `${intent.title} · ${id} · ${strategy} · MCP`);
    await waitReady(env.ARTIFACTS, repo);
    const token = await mintToken(env.ARTIFACTS, repo, "write");
    const number = logbookNumber(await reserveLogbookNumber(env.DB, riverId));
    await insertChannel(env.DB, {
      id,
      riverId,
      intentId,
      repo,
      remote: fork.remote,
      agent,
      model,
      strategy,
      replay: false,
      status: "planning",
      statusText: "planning",
      commits: 0,
      createdAt: Date.now(),
    });
    await env.DB.prepare("UPDATE channels SET source = 'mcp' WHERE river_id = ? AND id = ?").bind(riverId, id).run();
    if (intent.status === "open") await setIntentStatus(env.DB, riverId, intentId, "running");
    await insertLogbookIndex(env.DB, { riverId, number, channelId: id, intentId, repo, path: logbookPath(number, id), agent, model });

    const r = await getAgentByName(env.RiverAgent, riverId);
    const snapshot = await r.snapshot();
    const view: ChannelView = {
      id,
      intentId,
      repo,
      agent,
      model,
      strategy,
      replay: false,
      status: "planning",
      statusText: "planning",
      progress: 0.14,
      marks: [],
      commits: 0,
    };
    const existing = snapshot.intents.find((i) => i.id === intentId);
    await r.upsertIntent(
      existing
        ? { ...existing, status: "running", channels: [...existing.channels, view] }
        : { id: intentId, title: intent.title, status: "running", mode: "live", openedAt: Date.now(), channels: [view] },
    );
    await r.recordEvent({ id: `forked:${river.mainRepo}:${repo}`, type: "repo.forked", at: Date.now(), riverId, intentId, channelId: id, detail: `${id} · ${repo}` });
    await r.recordEvent({ id: `token.issued:${repo}:${token.id}`, type: "token.issued", at: Date.now(), riverId, channelId: id, detail: `${id} · scope: write · 1h` });

    return text({
      channel: id,
      remote: fork.remote,
      token: token.plaintext,
      tokenExpiresAt: token.expiresAt,
      clone: `git -c http.extraHeader="Authorization: Bearer <token>" clone ${fork.remote}`,
      logbook: { number, path: logbookPath(number, id) },
      trailers: [`Headwaters-Intent: ${intentId}`, `Headwaters-Channel: ${id}`, `Headwaters-Agent: ${agent}`, `Headwaters-Model: ${model}`, `Logbook: ${number}`],
      intent: { title: intent.title, goal: intent.goal, checks: intent.checks },
      rules: RULES,
    });
  });

  tool("line_declare", async ({ channel, globs, note }) => {
    const ch = await getChannel(env.DB, riverId, channel);
    if (!ch) return fail(`No Channel ${channel}`);
    const r = await getAgentByName(env.RiverAgent, riverId);
    return text(await r.declareLines({ channelId: channel, intentId: ch.intentId, globs, note }));
  });

  tool("line_release", async ({ channel, globs }) => {
    const r = await getAgentByName(env.RiverAgent, riverId);
    return text({ ok: true, released: await r.releaseLines(channel, globs) });
  });

  tool("logbook_write", async ({ channel, plan, decisions, rejected, notes }) => {
    const ch = await getChannel(env.DB, riverId, channel);
    if (!ch) return fail(`No Channel ${channel}`);
    const lb = await env.DB.prepare("SELECT number, path FROM logbook_index WHERE river_id = ? AND channel_id = ?")
      .bind(riverId, channel)
      .first<{ number: string; path: string }>();
    if (!lb) return fail(`No Logbook reserved for ${channel}`);
    await env.DB.prepare("UPDATE logbook_index SET plan = ?, decisions = ? WHERE river_id = ? AND number = ?")
      .bind(plan, JSON.stringify(decisions), riverId, lb.number)
      .run();
    const markdown = formatLogbook({
      number: lb.number,
      meta: { intent: ch.intentId, channel, agent: ch.agent, model: ch.model ?? "", strategy: ch.strategy },
      plan,
      decisions,
      rejected: rejected ?? [],
      notes: notes ?? "",
    });
    return text({ path: lb.path, content: markdown, next: "Write this file at the path, commit it with your last commit, push." });
  });

  tool("channel_submit", async ({ channel, costUsd }) => {
    const ch = await getChannel(env.DB, riverId, channel);
    if (!ch) return fail(`No Channel ${channel}`);
    await updateChannel(env.DB, riverId, channel, { status: "done", statusText: "submitted", costUsd });
    await (await getAgentByName(env.RiverAgent, riverId)).updateChannel(ch.intentId, channel, { status: "done", statusText: "submitted", progress: 0.8 });
    await channelFinished(env, riverId, ch.intentId);
    return text({ ok: true, next: "Scout compares your Channel once every Channel of the Intent is finished and reviewed." });
  });

  tool("river_ask", async ({ question }) => {
    const words = question.toLowerCase().match(/[a-z0-9/]{3,}/g) ?? [];
    const { results } = await env.DB.prepare("SELECT number, channel_id, intent_id, agent, plan, decisions FROM logbook_index WHERE river_id = ? AND plan IS NOT NULL")
      .bind(riverId)
      .all<{ number: string; channel_id: string; intent_id: string; agent: string; plan: string; decisions: string }>();
    const scored = results
      .map((r) => {
        const hay = `${r.plan} ${r.decisions}`.toLowerCase();
        return { r, score: words.filter((w) => hay.includes(w)).length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return text(scored.map(({ r }) => ({ logbook: r.number, channel: r.channel_id, intent: r.intent_id, agent: r.agent, decisions: JSON.parse(r.decisions) })));
  });

  return server;
}
