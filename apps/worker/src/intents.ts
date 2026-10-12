// Rivers and Intents: creation and fan-out.
//
// Opening an Intent forks main into N Channel repos (one per strategy), mints nothing for
// the browser, and starts one ChannelAgent per fork. Channels run concurrently.
import { getAgentByName } from "agents";
import {
  DEFAULT_POLICY,
  STRATEGIES,
  channelId as channelIdOf,
  channelRepoName,
  isSlug,
  logbookNumber,
  mainRepoName,
  shortSha,
  slugify,
  type AgentMode,
  type Channel,
  type ChannelView,
  type Intent,
  type IntentView,
  type OpenIntentRequest,
  type River,
  type Strategy,
} from "@braid/protocol";
import { ensureRepo, forkRepo, headCommit, mintToken, waitReady } from "./artifacts.ts";
import { recordedSeries, recordedStrategies } from "./agents/adapters/recorded.ts";
import {
  getIntent,
  getRiver,
  insertChannel,
  insertIntent,
  insertRiver,
  listChannels,
  listIntents,
  reserveChannelNumbers,
  reserveLogbookNumber,
  setIntentStatus,
} from "./db.ts";

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 500,
    message: string,
  ) {
    super(message);
  }
}

// ── Rivers ────────────────────────────────────────────────────────────────────

export interface CreateRiverRequest {
  id: string;
  name?: string;
  owner?: string;
}

/**
 * Create a River (mainline repo + D1 row + RiverAgent). Returns a short-lived write token
 * only to operators, so `pnpm seed:demo` can push the initial tree.
 */
export async function createRiver(env: Env, req: CreateRiverRequest): Promise<{ river: River; created: boolean; seedToken?: string }> {
  if (!isSlug(req.id)) throw new HttpError(400, "id must be a lowercase slug");
  const repo = await ensureRepo(env.ARTIFACTS, mainRepoName(req.id), { description: `Headwaters River ${req.id}` });
  const existing = await getRiver(env.DB, req.id);
  const river: River = existing ?? {
    id: req.id,
    name: req.name ?? req.id,
    owner: req.owner ?? "modern-zen",
    mainRepo: repo.name,
    remote: repo.remote,
    defaultBranch: repo.defaultBranch || "main",
    policy: DEFAULT_POLICY,
    createdAt: Date.now(),
  };
  await insertRiver(env.DB, { ...river, remote: repo.remote });
  const head = await headCommit(env.ARTIFACTS, repo.name);
  const agent = await getAgentByName(env.RiverAgent, req.id);
  await agent.init({ name: river.name, owner: river.owner, repo: repo.name, head: head ? shortSha(head.hash) : null });
  if (repo.created || !existing) {
    await agent.recordEvent({
      id: `river.created:${req.id}`,
      type: "river.created",
      at: Date.now(),
      riverId: req.id,
      detail: `${req.id} · main @ ${head ? shortSha(head.hash) : "empty"}`,
    });
    await agent.recordEvent({
      id: `token.issued:${req.id}:owner`,
      type: "token.issued",
      at: Date.now(),
      riverId: req.id,
      detail: `${river.owner} · scope: river`,
    });
  }
  const seedToken = head ? undefined : (await mintToken(env.ARTIFACTS, repo.name, "write", 900)).plaintext;
  return { river: { ...river, remote: repo.remote }, created: repo.created, seedToken };
}

/** Re-read main's head (after a seed push or a merge) into the RiverAgent. */
export async function refreshHead(env: Env, riverId: string): Promise<string | null> {
  const river = await requireRiver(env, riverId);
  const head = await headCommit(env.ARTIFACTS, river.mainRepo);
  const short = head ? shortSha(head.hash) : null;
  await (await getAgentByName(env.RiverAgent, riverId)).setHead(short);
  return short;
}

async function requireRiver(env: Env, riverId: string): Promise<River> {
  const river = await getRiver(env.DB, riverId);
  if (!river) throw new HttpError(404, `No River "${riverId}"`);
  return river;
}

// ── Intents ───────────────────────────────────────────────────────────────────

/** The demo's three Intents fan out to the strategies their recorded series cover. */
function strategiesFor(intentId: string, mode: AgentMode, requested: Strategy[] | undefined, n: number): Strategy[] {
  if (requested?.length) return requested;
  if (mode === "scripted") {
    const recorded = recordedStrategies(intentId).filter((s): s is Strategy => (STRATEGIES as readonly string[]).includes(s));
    if (recorded.length) return recorded.slice(0, n);
  }
  return (["minimal-diff", "tests-first", "rewrite"] as Strategy[]).slice(0, n);
}

export async function openIntent(
  env: Env,
  riverId: string,
  req: OpenIntentRequest,
): Promise<{ intent: Intent; channels: Channel[] }> {
  const river = await requireRiver(env, riverId);
  if (!req.title?.trim()) throw new HttpError(400, "title is required");
  const intentId = req.id ?? slugify(req.title);
  if (!isSlug(intentId)) throw new HttpError(400, `Invalid intent id "${intentId}"`);
  const mode: AgentMode = req.mode ?? ((env.BRAID_AGENT_MODE as string) === "live" ? "live" : "scripted");
  const strategies = strategiesFor(intentId, mode, req.strategies, river.policy.channelsPerIntent);

  if (mode === "scripted") {
    const missing = strategies.filter((s) => !recordedSeries(intentId, s));
    if (missing.length) throw new HttpError(400, `No recorded series for ${intentId}/${missing.join(", ")}; use mode "live"`);
  }

  const now = Date.now();
  const intent: Intent = {
    id: intentId,
    riverId,
    title: req.title.trim(),
    goal: (req.goal ?? req.title).trim(),
    checks: req.checks ?? [],
    status: "running",
    mode,
    createdAt: now,
  };
  if (!(await insertIntent(env.DB, intent))) throw new HttpError(409, `Intent "${intentId}" already exists`);

  const first = await reserveChannelNumbers(env.DB, riverId, strategies.length);
  const river$ = await getAgentByName(env.RiverAgent, riverId);
  const planned = strategies.map((strategy, k) => {
    const n = first + k;
    const series = mode === "scripted" ? recordedSeries(intentId, strategy) : null;
    return {
      n,
      id: channelIdOf(n),
      repo: channelRepoName(riverId, n),
      strategy,
      agent: series?.agent ?? "claude-code",
      model: series?.model ?? env.LIVE_MODEL,
      replay: mode === "scripted",
    };
  });

  const view: IntentView = {
    id: intentId,
    title: intent.title,
    status: "running",
    mode,
    openedAt: now,
    channels: planned.map(
      (p): ChannelView => ({
        id: p.id,
        intentId,
        repo: p.repo,
        agent: p.agent,
        model: p.model,
        strategy: p.strategy,
        replay: p.replay,
        status: "forking",
        statusText: "forking",
        progress: 0.04,
        marks: [],
        commits: 0,
      }),
    ),
  };
  await river$.upsertIntent(view);
  await river$.recordEvent({
    id: `intent.opened:${riverId}:${intentId}`,
    type: "intent.opened",
    at: now,
    riverId,
    intentId,
    detail: `${intent.title} · ${planned.length} channels`,
  });

  // Fan out: fork and start every Channel concurrently.
  const channels = await Promise.all(
    planned.map(async (p): Promise<Channel> => {
      const fork = await forkRepo(env.ARTIFACTS, river.mainRepo, p.repo, `${intent.title} · ${p.id} · ${p.strategy}`);
      await waitReady(env.ARTIFACTS, p.repo);
      const channel: Channel = {
        id: p.id,
        riverId,
        intentId,
        repo: fork.name,
        remote: fork.remote,
        agent: p.agent,
        model: p.model,
        strategy: p.strategy,
        replay: p.replay,
        status: "cloning",
        statusText: "cloning",
        commits: 0,
        createdAt: Date.now(),
      };
      await insertChannel(env.DB, channel);
      // Same id as the Artifacts repo.forked event, so the queue path dedupes against it.
      await river$.recordEvent({
        id: `forked:${river.mainRepo}:${fork.name}`,
        type: "repo.forked",
        at: Date.now(),
        riverId,
        intentId,
        channelId: p.id,
        detail: `${p.id} · ${fork.name}`,
      });
      await river$.updateChannel(intentId, p.id, { status: "cloning", statusText: "cloning", progress: 0.06 });
      const agent = await getAgentByName(env.ChannelAgent, `${riverId}:${p.id}`);
      await agent.start({
        riverId,
        intentId,
        intentTitle: intent.title,
        intentGoal: intent.goal,
        checks: intent.checks,
        channelId: p.id,
        repo: fork.name,
        remote: fork.remote,
        mainRepo: river.mainRepo,
        strategy: p.strategy,
        mode,
        logbookNumber: logbookNumber(await reserveLogbookNumber(env.DB, riverId)),
      });
      return channel;
    }),
  );
  return { intent, channels };
}

const FINISHED = new Set(["done", "failed", "dropped", "merged"]);

/** Called when a Channel's run ends. When every Channel of the Intent is finished, Scout takes over. */
export async function channelFinished(env: Env, riverId: string, intentId: string): Promise<void> {
  const intent = await getIntent(env.DB, riverId, intentId);
  if (!intent || intent.status !== "running") return;
  const channels = await listChannels(env.DB, riverId, intentId);
  if (channels.length === 0 || !channels.every((c) => FINISHED.has(c.status))) return;
  await setIntentStatus(env.DB, riverId, intentId, "scouting");
  await (await getAgentByName(env.RiverAgent, riverId)).setIntentStatus(intentId, "scouting");
  const { maybeJudge } = await import("./scout.ts");
  await maybeJudge(env, riverId, intentId);
}

export async function riverSummary(env: Env, riverId: string): Promise<{ river: River; intents: Intent[]; channels: Channel[] }> {
  const river = await requireRiver(env, riverId);
  return { river, intents: await listIntents(env.DB, riverId), channels: await listChannels(env.DB, riverId) };
}
