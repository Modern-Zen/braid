// D1 access: the durable cross-River index. Live coordination stays in RiverAgent.
import {
  DEFAULT_POLICY,
  type AgentMode,
  type Channel,
  type ChannelStatus,
  type Intent,
  type IntentStatus,
  type River,
  type RiverPolicy,
  type Strategy,
} from "@braid/protocol";

interface RiverRow {
  id: string;
  name: string;
  owner: string;
  main_repo: string;
  remote: string;
  default_branch: string;
  policy: string;
  created_at: number;
}

interface IntentRow {
  river_id: string;
  id: string;
  title: string;
  goal: string;
  checks: string;
  status: IntentStatus;
  mode: AgentMode;
  created_at: number;
}

interface ChannelRow {
  river_id: string;
  id: string;
  intent_id: string;
  repo: string;
  remote: string;
  agent: string;
  model: string | null;
  strategy: Strategy;
  replay: number;
  status: ChannelStatus;
  status_text: string | null;
  head_sha: string | null;
  commits: number;
  preview_url: string | null;
  screenshot_key: string | null;
  cost_usd: number | null;
  duration_ms: number | null;
  created_at: number;
}

const toRiver = (r: RiverRow): River => ({
  id: r.id,
  name: r.name,
  owner: r.owner,
  mainRepo: r.main_repo,
  remote: r.remote,
  defaultBranch: r.default_branch,
  policy: { ...DEFAULT_POLICY, ...(JSON.parse(r.policy) as Partial<RiverPolicy>) },
  createdAt: r.created_at,
});

const toIntent = (r: IntentRow): Intent => ({
  id: r.id,
  riverId: r.river_id,
  title: r.title,
  goal: r.goal,
  checks: JSON.parse(r.checks) as string[],
  status: r.status,
  mode: r.mode,
  createdAt: r.created_at,
});

const toChannel = (r: ChannelRow): Channel => ({
  id: r.id,
  riverId: r.river_id,
  intentId: r.intent_id,
  repo: r.repo,
  remote: r.remote,
  agent: r.agent,
  model: r.model ?? undefined,
  strategy: r.strategy,
  replay: r.replay === 1,
  status: r.status,
  statusText: r.status_text ?? undefined,
  headSha: r.head_sha ?? undefined,
  commits: r.commits,
  previewUrl: r.preview_url ?? undefined,
  screenshotKey: r.screenshot_key ?? undefined,
  costUsd: r.cost_usd ?? undefined,
  durationMs: r.duration_ms ?? undefined,
  createdAt: r.created_at,
});

export async function getRiver(db: D1Database, id: string): Promise<River | null> {
  const row = await db.prepare("SELECT * FROM rivers WHERE id = ?").bind(id).first<RiverRow>();
  return row ? toRiver(row) : null;
}

export async function listRivers(db: D1Database): Promise<River[]> {
  const { results } = await db.prepare("SELECT * FROM rivers ORDER BY created_at").all<RiverRow>();
  return results.map(toRiver);
}

export async function insertRiver(db: D1Database, r: River): Promise<void> {
  await db
    .prepare(
      `INSERT INTO rivers (id, name, owner, main_repo, remote, default_branch, policy, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET remote = excluded.remote, default_branch = excluded.default_branch`,
    )
    .bind(r.id, r.name, r.owner, r.mainRepo, r.remote, r.defaultBranch, JSON.stringify(r.policy), r.createdAt)
    .run();
}

/** Reserve `count` River-wide Channel numbers atomically. Returns the first. */
export async function reserveChannelNumbers(db: D1Database, riverId: string, count: number): Promise<number> {
  const row = await db
    .prepare("UPDATE rivers SET next_channel = next_channel + ? WHERE id = ? RETURNING next_channel")
    .bind(count, riverId)
    .first<{ next_channel: number }>();
  if (!row) throw new Error(`Unknown river ${riverId}`);
  return row.next_channel - count;
}

/** Reserve the next River-wide Logbook number. */
export async function reserveLogbookNumber(db: D1Database, riverId: string): Promise<number> {
  const row = await db
    .prepare("UPDATE rivers SET next_logbook = next_logbook + 1 WHERE id = ? RETURNING next_logbook")
    .bind(riverId)
    .first<{ next_logbook: number }>();
  if (!row) throw new Error(`Unknown river ${riverId}`);
  return row.next_logbook - 1;
}

export async function getIntent(db: D1Database, riverId: string, id: string): Promise<Intent | null> {
  const row = await db.prepare("SELECT * FROM intents WHERE river_id = ? AND id = ?").bind(riverId, id).first<IntentRow>();
  return row ? toIntent(row) : null;
}

export async function listIntents(db: D1Database, riverId: string): Promise<Intent[]> {
  const { results } = await db
    .prepare("SELECT * FROM intents WHERE river_id = ? ORDER BY created_at")
    .bind(riverId)
    .all<IntentRow>();
  return results.map(toIntent);
}

export async function insertIntent(db: D1Database, i: Intent): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT INTO intents (river_id, id, title, goal, checks, status, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    )
    .bind(i.riverId, i.id, i.title, i.goal, JSON.stringify(i.checks), i.status, i.mode, i.createdAt, i.createdAt)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function setIntentStatus(db: D1Database, riverId: string, id: string, status: IntentStatus): Promise<void> {
  await db
    .prepare("UPDATE intents SET status = ?, updated_at = ? WHERE river_id = ? AND id = ?")
    .bind(status, Date.now(), riverId, id)
    .run();
}

export async function insertChannel(db: D1Database, c: Channel): Promise<void> {
  await db
    .prepare(
      `INSERT INTO channels (river_id, id, intent_id, repo, remote, agent, model, strategy, replay, status, status_text,
         commits, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      c.riverId,
      c.id,
      c.intentId,
      c.repo,
      c.remote,
      c.agent,
      c.model ?? null,
      c.strategy,
      c.replay ? 1 : 0,
      c.status,
      c.statusText ?? null,
      c.createdAt,
      c.createdAt,
    )
    .run();
}

export async function updateChannel(
  db: D1Database,
  riverId: string,
  id: string,
  patch: Partial<Pick<Channel, "status" | "statusText" | "headSha" | "commits" | "previewUrl" | "screenshotKey" | "costUsd" | "durationMs" | "agent" | "model">>,
): Promise<void> {
  const cols: Record<string, string> = {
    status: "status",
    statusText: "status_text",
    headSha: "head_sha",
    commits: "commits",
    previewUrl: "preview_url",
    screenshotKey: "screenshot_key",
    costUsd: "cost_usd",
    durationMs: "duration_ms",
    agent: "agent",
    model: "model",
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || !cols[k]) continue;
    sets.push(`${cols[k]} = ?`);
    values.push(v);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  values.push(Date.now());
  await db
    .prepare(`UPDATE channels SET ${sets.join(", ")} WHERE river_id = ? AND id = ?`)
    .bind(...values, riverId, id)
    .run();
}

export async function getChannel(db: D1Database, riverId: string, id: string): Promise<Channel | null> {
  const row = await db.prepare("SELECT * FROM channels WHERE river_id = ? AND id = ?").bind(riverId, id).first<ChannelRow>();
  return row ? toChannel(row) : null;
}

export async function getChannelByRepo(db: D1Database, repo: string): Promise<Channel | null> {
  const row = await db.prepare("SELECT * FROM channels WHERE repo = ?").bind(repo).first<ChannelRow>();
  return row ? toChannel(row) : null;
}

export async function listChannels(db: D1Database, riverId: string, intentId?: string): Promise<Channel[]> {
  const stmt = intentId
    ? db.prepare("SELECT * FROM channels WHERE river_id = ? AND intent_id = ? ORDER BY created_at, id").bind(riverId, intentId)
    : db.prepare("SELECT * FROM channels WHERE river_id = ? ORDER BY created_at, id").bind(riverId);
  const { results } = await stmt.all<ChannelRow>();
  return results.map(toChannel);
}

/** Delete a River's Intents/Channels/reviews (demo reset). Repos are deleted separately. */
export async function deleteRiverWork(db: D1Database, riverId: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM channels WHERE river_id = ?").bind(riverId),
    db.prepare("DELETE FROM intents WHERE river_id = ?").bind(riverId),
    db.prepare("DELETE FROM reviews WHERE river_id = ?").bind(riverId),
    db.prepare("DELETE FROM verdicts WHERE river_id = ?").bind(riverId),
    db.prepare("DELETE FROM eddy_cards WHERE river_id = ?").bind(riverId),
    db.prepare("DELETE FROM logbook_index WHERE river_id = ?").bind(riverId),
    db.prepare("UPDATE rivers SET next_channel = 1, next_logbook = 1 WHERE id = ?").bind(riverId),
  ]);
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export interface ReviewRow {
  repo: string;
  sha: string;
  river_id: string;
  channel_id: string;
  intent_id: string;
  state: "running" | "passed" | "failed";
  tests_passed: number | null;
  tests_total: number | null;
  failures: string | null;
  added: number | null;
  removed: number | null;
  files: number | null;
  risk: number | null;
  risk_reasons: string | null;
  log_key: string | null;
  created_at: number;
}

/** Claim a review for (repo, sha). Returns false if one already exists (idempotency). */
export async function claimReview(
  db: D1Database,
  r: { repo: string; sha: string; riverId: string; channelId: string; intentId: string },
): Promise<boolean> {
  const now = Date.now();
  const res = await db
    .prepare(
      `INSERT INTO reviews (repo, sha, river_id, channel_id, intent_id, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'running', ?, ?) ON CONFLICT DO NOTHING`,
    )
    .bind(r.repo, r.sha, r.riverId, r.channelId, r.intentId, now, now)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function finishReview(
  db: D1Database,
  repo: string,
  sha: string,
  r: {
    ok: boolean;
    passed: number;
    total: number;
    failures: string[];
    added: number;
    removed: number;
    files: number;
    risk: number;
    reasons: string[];
    logKey: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE reviews SET state = ?, tests_passed = ?, tests_total = ?, failures = ?, added = ?, removed = ?, files = ?,
         risk = ?, risk_reasons = ?, log_key = ?, updated_at = ? WHERE repo = ? AND sha = ?`,
    )
    .bind(
      r.ok ? "passed" : "failed",
      r.passed,
      r.total,
      JSON.stringify(r.failures),
      r.added,
      r.removed,
      r.files,
      r.risk,
      JSON.stringify(r.reasons),
      r.logKey,
      Date.now(),
      repo,
      sha,
    )
    .run();
}

export async function getReview(db: D1Database, repo: string, sha: string): Promise<ReviewRow | null> {
  return db.prepare("SELECT * FROM reviews WHERE repo = ? AND sha = ?").bind(repo, sha).first<ReviewRow>();
}

export async function recordEventIndex(db: D1Database, e: { key: string; type: string; repo: string; rawKey: string }): Promise<boolean> {
  const res = await db
    .prepare("INSERT INTO events_index (key, type, repo, raw_key, received_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
    .bind(e.key, e.type, e.repo, e.rawKey, Date.now())
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function insertLogbookIndex(
  db: D1Database,
  e: { riverId: string; number: string; channelId: string; intentId: string; repo: string; path: string; agent: string; model?: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO logbook_index (river_id, number, channel_id, intent_id, repo, path, agent, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    )
    .bind(e.riverId, e.number, e.channelId, e.intentId, e.repo, e.path, e.agent, e.model ?? null, Date.now())
    .run();
}

export async function logbookFor(db: D1Database, riverId: string, channelId: string): Promise<{ number: string; path: string; repo: string } | null> {
  return db
    .prepare("SELECT number, path, repo FROM logbook_index WHERE river_id = ? AND channel_id = ?")
    .bind(riverId, channelId)
    .first<{ number: string; path: string; repo: string }>();
}
