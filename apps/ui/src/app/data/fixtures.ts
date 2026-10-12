// Fixtures: the App prototype's constants (INTENTS, FEED_*, SCOUT, DIFF, CARDS, trailers,
// Logbook text) re-expressed as the protocol's view models, for every state the
// prototype's state bar can show. The agent names here are the design's illustrative
// mix. They are fixtures, not claims; live data only ever shows the real agent.
import {
  DEFAULT_POLICY,
  type AskResult,
  type ChannelOverlap,
  type ChannelStatus,
  type ChannelView,
  type CommitView,
  type EddyCard,
  type EddyView,
  type FeedEvent,
  type FeedEventType,
  type IntentView,
  type Line,
  type RiverState,
  type RiverSummary,
  type ScoutChannel,
  type ScoutView,
  type Strategy,
} from "@braid/protocol";

export type RiverFixture = "empty" | "running" | "overlap" | "merged";
export type ScoutFixture = "running" | "verdict" | "tie";
export type EddyFixture = "three" | "one" | "zero";

export const RIVER_FIXTURES: Array<[RiverFixture, string]> = [
  ["empty", "Empty"],
  ["running", "9 running"],
  ["overlap", "Overlap"],
  ["merged", "All merged"],
];
export const SCOUT_FIXTURES: Array<[ScoutFixture, string]> = [
  ["running", "Still running"],
  ["verdict", "Verdict ready"],
  ["tie", "Tie · human"],
];
export const EDDY_FIXTURES: Array<[EddyFixture, string]> = [
  ["three", "3 decisions"],
  ["one", "1 decision"],
  ["zero", "Inbox zero"],
];

/** Fixture clock. In fixture mode the UI's "now" is frozen here, so "12s" reads "12s". */
export const FIXTURE_NOW = Date.UTC(2026, 9, 14, 16, 0, 0);
const ago = (s: number) => FIXTURE_NOW - s * 1000;

const RIVER = "riverlevels";
const REPO = "river-riverlevels";
const HEAD = "4f2a9c1";
const HEAD_MERGED = "9c3e1f0";

// ── River (screen A) ──────────────────────────────────────────────────────────

interface FxChannel {
  id: string;
  agent: string;
  model?: string;
  strategy: Strategy;
  p: number;
  status: ChannelStatus;
  statusText: string;
  marks: number[];
  headSha?: string;
  previewUrl?: string;
}

interface FxIntent {
  id: string;
  title: string;
  openedAt: number;
  chans: FxChannel[];
}

const INTENTS: FxIntent[] = [
  {
    id: "dark-mode",
    title: "Add a dark mode",
    openedAt: ago(540),
    chans: [
      { id: "ch-1", agent: "codex", strategy: "tests-first", p: 0.55, status: "editing", statusText: "editing 3 files", marks: [0.2, 0.4], headSha: "5d1e9b2" },
      { id: "ch-2", agent: "claude-code", strategy: "minimal-diff", p: 0.7, status: "pushed", statusText: "pushed a41c…", marks: [0.2, 0.45, 0.65], headSha: "a41c3f7" },
      { id: "ch-3", agent: "gemini", strategy: "rewrite", p: 0.62, status: "done", statusText: "tests ✓", marks: [0.3, 0.55], headSha: "c83a0e4", previewUrl: "https://ch-3.riverlevels.preview" },
    ],
  },
  {
    id: "rate-limit-api",
    title: "Add rate limiting to /api",
    openedAt: ago(480),
    chans: [
      { id: "ch-4", agent: "claude-code", strategy: "conservative", p: 0.4, status: "planning", statusText: "planning", marks: [] },
      { id: "ch-5", agent: "codex", model: "gpt-5-codex", strategy: "conservative", p: 0.75, status: "done", statusText: "tests ✓", marks: [0.25, 0.5, 0.7], headSha: "a41c3f7" },
      { id: "ch-6", agent: "aider", strategy: "bold", p: 0.3, status: "cloning", statusText: "cloning", marks: [] },
    ],
  },
  {
    id: "refactor-gauge",
    title: "Refactor the gauge component",
    openedAt: ago(480),
    chans: [
      { id: "ch-7", agent: "claude-code", strategy: "minimal-diff", p: 0.66, status: "editing", statusText: "editing 5 files", marks: [0.2, 0.5], headSha: "e02b7c9" },
      { id: "ch-8", agent: "gemini", strategy: "tests-first", p: 0.5, status: "planning", statusText: "planning", marks: [0.3], headSha: "19f4d60" },
      { id: "ch-9", agent: "devin", strategy: "rewrite", p: 0.58, status: "pushed", statusText: "pushed 7be0…", marks: [0.2, 0.4, 0.55], headSha: "7be04d2" },
    ],
  },
];

function intentViews(merged: boolean): IntentView[] {
  return INTENTS.map((it) => ({
    id: it.id,
    title: it.title,
    status: merged ? "merged" : "running",
    mode: "scripted",
    openedAt: it.openedAt,
    channels: it.chans.map(
      (c): ChannelView => ({
        id: c.id,
        intentId: it.id,
        repo: `${REPO}--${c.id}`,
        agent: c.agent,
        ...(c.model ? { model: c.model } : {}),
        strategy: c.strategy,
        replay: false,
        status: merged ? "merged" : c.status,
        statusText: merged ? "merged" : c.statusText,
        progress: merged ? 1 : c.p,
        marks: c.marks,
        ...(c.headSha ? { headSha: c.headSha } : {}),
        commits: c.marks.length,
        ...(c.previewUrl ? { previewUrl: c.previewUrl } : {}),
      }),
    ),
  }));
}

type FxEvent = [FeedEventType, string, number, ("auto" | "you")?];

const ev = ([type, detail, secs, by]: FxEvent, i: number, list: string): FeedEvent => {
  const channelId = /^ch-\d+/.exec(detail)?.[0];
  return {
    id: `fx:${list}:${i}`,
    type,
    at: ago(secs),
    riverId: RIVER,
    ...(channelId ? { channelId } : {}),
    detail,
    ...(by ? { by } : {}),
  };
};

const FEED_RUN: FxEvent[] = [
  ["repo.pushed", "ch-2 → a41c3f7 · 4 files", 12],
  ["line.declared", "ch-7 · src/components/Gauge.tsx, src/hooks/useGauge.ts", 40],
  ["review.passed", "ch-5 · tests 14/14 · risk 0.72", 60],
  ["repo.pushed", "ch-9 → 7be04d2 · 9 files", 120],
  ["repo.forked", "ch-6 · river-riverlevels--ch-6", 180],
  ["line.declared", "ch-2 · src/theme/*, src/components/Gauge.tsx", 240],
  ["repo.forked", "ch-4 · river-riverlevels--ch-4", 300],
  ["preview.ready", "ch-3 · https://ch-3.riverlevels.preview", 360],
  ["intent.opened", "Refactor the gauge component · 3 channels", 480],
  ["intent.opened", "Add rate limiting to /api · 3 channels", 480],
  ["intent.opened", "Add a dark mode · 3 channels", 540],
];
const FEED_OVERLAP: FxEvent[] = [["line.conflict", "ch-2 ↔ ch-7 · src/components/Gauge.tsx", 0], ...FEED_RUN];
const FEED_MERGED: FxEvent[] = [
  ["river.merged", "main @ 9c3e1f0 · 3 intents", 0],
  ["confluence.picked", "ch-2 · Add a dark mode · by you", 60, "you"],
  ["confluence.picked", "ch-5 · Add rate limiting to /api · auto", 120, "auto"],
  ["confluence.picked", "ch-7 · Refactor the gauge component · auto", 120, "auto"],
  ["review.passed", "ch-7 · tests 22/22 · risk 0.21", 240],
  ["review.passed", "ch-2 · tests 14/14 · risk 0.18", 360],
  ...FEED_RUN.slice(0, 5),
];
const FEED_EMPTY: FxEvent[] = [
  ["river.created", "riverlevels · main @ 4f2a9c1", 120],
  ["token.issued", "owner · scope: river", 120],
];

const LINES: Line[] = [
  { channelId: "ch-2", intentId: "dark-mode", glob: "src/theme/*", declaredAt: ago(240) },
  { channelId: "ch-2", intentId: "dark-mode", glob: "src/components/Gauge.tsx", declaredAt: ago(240) },
  { channelId: "ch-7", intentId: "refactor-gauge", glob: "src/components/Gauge.tsx", declaredAt: ago(40) },
  { channelId: "ch-7", intentId: "refactor-gauge", glob: "src/hooks/useGauge.ts", declaredAt: ago(40) },
];

const OVERLAP: ChannelOverlap = { a: "ch-2", b: "ch-7", path: "src/components/Gauge.tsx", at: ago(0) };

export function riverFixture(state: RiverFixture, riverId = RIVER): RiverState {
  const base = { riverId, name: riverId, owner: "modern-zen", repo: `river-${riverId}` };
  const list = (events: FxEvent[], name: string) => events.map((e, i) => ev(e, i, name));
  switch (state) {
    case "empty":
      return {
        ...base,
        head: HEAD,
        counters: { agents: 0, commits: 0, previews: 0, decisions: 0, autoMerged: 0 },
        intents: [],
        feed: list(FEED_EMPTY, "empty"),
        lines: [],
        overlaps: [],
        decisions: 0,
        merged: false,
      };
    case "merged":
      return {
        ...base,
        head: HEAD_MERGED,
        counters: { agents: 9, commits: 44, previews: 3, decisions: 0, autoMerged: 38 },
        intents: intentViews(true),
        feed: list(FEED_MERGED, "merged"),
        lines: [],
        overlaps: [],
        decisions: 0,
        merged: true,
      };
    case "overlap":
    case "running": {
      const overlap = state === "overlap";
      return {
        ...base,
        head: HEAD,
        counters: { agents: 9, commits: 41, previews: 3, decisions: 1, autoMerged: 38 },
        intents: intentViews(false),
        feed: list(overlap ? FEED_OVERLAP : FEED_RUN, state),
        lines: LINES,
        overlaps: overlap ? [OVERLAP] : [],
        decisions: 1,
        merged: false,
      };
    }
  }
}

export const RIVERS_FIXTURE: RiverSummary[] = [
  { id: RIVER, name: RIVER, owner: "modern-zen", repo: REPO, head: HEAD, intents: 3, decisions: 1 },
];

// ── Scout (screen B) ──────────────────────────────────────────────────────────

interface FxScout {
  id: string;
  agent: string;
  model?: string;
  strategy: Strategy;
  tests: [number, number];
  diff: [number, number, number];
  cost: number;
  ms: number;
  risk: number;
  rank: number;
  /** The fixture preview renders the dashboard in dark colors. */
  dark: boolean;
  note: string;
  running: { status: ChannelStatus; text: string };
}

interface FxScoutIntent {
  id: string;
  title: string;
  channels: FxScout[];
  verdict: string;
  tie: string;
}

const SCOUT: FxScoutIntent[] = [
  {
    id: "dark-mode",
    title: "Add a dark mode",
    channels: [
      { id: "ch-1", agent: "codex", strategy: "tests-first", tests: [12, 14], diff: [64, 9, 6], cost: 0.22, ms: 160_000, risk: 0.31, rank: 3, dark: false, note: "Two contrast checks failed on the gauge labels.", running: { status: "editing", text: "editing 3 files" } },
      { id: "ch-2", agent: "claude-code", strategy: "minimal-diff", tests: [14, 14], diff: [82, 11, 4], cost: 0.31, ms: 192_000, risk: 0.18, rank: 1, dark: true, note: "Theme tokens; respects prefers-color-scheme.", running: { status: "testing", text: "running tests 9/14" } },
      { id: "ch-3", agent: "gemini", strategy: "rewrite", tests: [14, 14], diff: [140, 32, 9], cost: 0.48, ms: 245_000, risk: 0.44, rank: 2, dark: true, note: "Hard-coded palette in six components.", running: { status: "testing", text: "building preview" } },
    ],
    verdict:
      "ch-2 adds a theme-token layer across four files and keeps the light palette’s contrast; every test passes. ch-3 also passes but hard-codes colors in six components, and ch-1 failed two contrast checks.",
    tie: "ch-2 and ch-3 both pass every test with similar previews. They differ in approach, not outcome: tokens versus a rewrite. Scout can’t settle this one.",
  },
  {
    id: "rate-limit-api",
    title: "Add rate limiting to /api",
    channels: [
      { id: "ch-4", agent: "claude-code", strategy: "conservative", tests: [14, 14], diff: [46, 3, 3], cost: 0.24, ms: 151_000, risk: 0.58, rank: 2, dark: false, note: "In-memory limiter; resets on cold start.", running: { status: "planning", text: "planning" } },
      { id: "ch-5", agent: "codex", model: "gpt-5-codex", strategy: "conservative", tests: [14, 14], diff: [58, 2, 3], cost: 0.27, ms: 168_000, risk: 0.72, rank: 1, dark: false, note: "Durable Object token bucket, 10 req/s per token.", running: { status: "testing", text: "running tests 11/14" } },
      { id: "ch-6", agent: "aider", strategy: "bold", tests: [13, 14], diff: [121, 40, 7], cost: 0.35, ms: 235_000, risk: 0.66, rank: 3, dark: false, note: "Queues requests instead of returning 429.", running: { status: "cloning", text: "cloning" } },
    ],
    verdict:
      "ch-5 keeps the bucket in a Durable Object so the limit holds across isolates; every test passes. ch-4 also passes but counts in memory, and ch-6 queues requests where callers expect a 429.",
    tie: "ch-5 and ch-4 both pass every test. They differ in where the bucket lives, not in what callers see. Scout can’t settle this one.",
  },
  {
    id: "refactor-gauge",
    title: "Refactor the gauge component",
    channels: [
      { id: "ch-7", agent: "claude-code", strategy: "minimal-diff", tests: [22, 22], diff: [96, 71, 5], cost: 0.29, ms: 182_000, risk: 0.21, rank: 1, dark: false, note: "Extracts useGauge; keeps the Gauge props stable.", running: { status: "editing", text: "editing 5 files" } },
      { id: "ch-8", agent: "gemini", strategy: "tests-first", tests: [22, 22], diff: [130, 64, 6], cost: 0.41, ms: 260_000, risk: 0.34, rank: 2, dark: false, note: "Adds hook tests first; renames two props.", running: { status: "planning", text: "planning" } },
      { id: "ch-9", agent: "devin", strategy: "rewrite", tests: [20, 22], diff: [212, 160, 9], cost: 0.62, ms: 310_000, risk: 0.52, rank: 3, dark: false, note: "Two snapshot tests fail after the rewrite.", running: { status: "testing", text: "running tests 18/22" } },
    ],
    verdict:
      "ch-7 extracts useGauge without changing the component’s props; all 22 tests pass. ch-8 also passes but renames two props, and ch-9 fails two snapshot tests.",
    tie: "ch-7 and ch-8 both pass every test with the same preview. They differ in how much of the API moves. Scout can’t settle this one.",
  },
];

function headShaOf(channelId: string): string {
  for (const it of INTENTS) for (const c of it.chans) if (c.id === channelId && c.headSha) return c.headSha;
  return "a41c3f7";
}

/** Fixture-only hint: does this Channel's mini preview render dark? */
export function fixturePreviewDark(channelId: string): boolean {
  for (const it of SCOUT) for (const c of it.channels) if (c.id === channelId) return c.dark;
  return false;
}

export function scoutFixture(intentId: string, state: ScoutFixture): ScoutView {
  const it = SCOUT.find((s) => s.id === intentId) ?? SCOUT[0]!;
  const running = state === "running";
  const tie = state === "tie";
  // A tie puts the top two level at rank 1.
  const rankOf = (c: FxScout) => (tie && c.rank <= 2 ? 1 : c.rank);
  const channels = it.channels.map(
    (c): ScoutChannel => ({
      id: c.id,
      agent: c.agent,
      ...(c.model ? { model: c.model } : {}),
      strategy: c.strategy,
      replay: false,
      status: running ? c.running.status : "done",
      statusText: running ? c.running.text : "tests ✓",
      rank: running ? null : rankOf(c),
      tests: running ? null : { passed: c.tests[0], total: c.tests[1] },
      diff: running ? null : { added: c.diff[0], removed: c.diff[1], files: c.diff[2] },
      costUsd: running ? null : c.cost,
      durationMs: running ? null : c.ms,
      risk: running ? null : c.risk,
      note: running ? null : c.note,
      previewUrl: running ? null : `https://${c.id}.riverlevels.preview`,
      screenshotUrl: null,
      headSha: running ? null : headShaOf(c.id),
    }),
  );
  return {
    intent: { id: it.id, title: it.title, status: running ? "running" : tie ? "eddy" : "scouting" },
    state,
    verdict: running
      ? null
      : {
          intentId: it.id,
          riverId: RIVER,
          kind: tie ? "tie" : "winner",
          ranked: [...it.channels]
            .sort((a, b) => a.rank - b.rank)
            .map((c) => ({ channelId: c.id, rank: rankOf(c), note: c.note })),
          rationale: tie ? it.tie : it.verdict,
          judgeModel: DEFAULT_POLICY.judgeModel,
          createdAt: ago(30),
        },
    channels,
  };
}

// ── Eddy (screen C) ───────────────────────────────────────────────────────────

const CARDS: Record<"pick" | "api" | "merge", EddyCard> = {
  pick: {
    id: "fx-pick-dark-mode",
    riverId: RIVER,
    intentId: "dark-mode",
    kind: "pick",
    question: "Pick a dark mode",
    meta: "Add a dark mode · ch-2 vs ch-3",
    context:
      "Scout called a tie. ch-2 adds a theme-token layer across 4 files and passes all 14 tests. ch-3 rewrites 9 components with a hard-coded palette and also passes. Both previews are attached.",
    actions: [
      { id: "pick:ch-2", label: "Pick ch-2", style: "primary" },
      { id: "pick:ch-3", label: "Pick ch-3", style: "secondary" },
      { id: "open-scout", label: "Open Scout", style: "tertiary" },
    ],
    createdAt: ago(90),
  },
  api: {
    id: "fx-approve-rate-limit-api",
    riverId: RIVER,
    intentId: "rate-limit-api",
    kind: "approve",
    question: "Approve a high-risk change to /api",
    meta: "Add rate limiting · ch-5 · risk 0.72",
    context:
      "Adds a Durable Object–backed token bucket at 10 req/s per token and returns 429 on overflow. Touches the public API surface; tests 14/14. The Logbook explains the limit.",
    actions: [
      { id: "approve", label: "Approve", style: "primary" },
      { id: "changes", label: "Ask for changes", style: "secondary" },
    ],
    createdAt: ago(60),
  },
  merge: {
    id: "fx-confirm-refactor-gauge",
    riverId: RIVER,
    intentId: "refactor-gauge",
    kind: "confirm",
    question: "Confirm merge resolution",
    meta: "ch-7 ↔ ch-2 · src/components/Gauge.tsx",
    context:
      "Both channels touched Gauge.tsx. Headwaters kept ch-2’s theme props and ch-7’s extracted hook; the combined build passes 22/22. Confirm, or open the diff.",
    actions: [
      { id: "confirm", label: "Confirm", style: "primary" },
      { id: "view-diff", label: "View diff", style: "secondary" },
    ],
    createdAt: ago(30),
  },
};

export function eddyFixture(state: EddyFixture): EddyView {
  const cards = state === "three" ? [CARDS.pick, CARDS.api, CARDS.merge] : state === "one" ? [CARDS.pick] : [];
  return { cards, autoMerged: state === "three" ? 36 : 38 };
}

// ── Logbook (screen D) ────────────────────────────────────────────────────────

const DIFF: Array<[string, " " | "+" | "-", string]> = [
  ["1", " ", 'import { Hono } from "hono";'],
  ["2", "+", 'import { RateLimiter } from "./limiter";'],
  ["3", "+", ""],
  ["4", "+", "const LIMIT = 10; // req/s per token"],
  ["5", "+", "const limiter = new RateLimiter({ limit: LIMIT, window: 1_000 });"],
  ["6", " ", ""],
  ["7", " ", "export const api = new Hono();"],
  ["8", "+", ""],
  ["9", "+", 'api.use("*", async (c, next) => {'],
  ["10", "+", '  const key = c.req.header("authorization")'],
  ["11", "+", '    ?? c.req.header("cf-connecting-ip");'],
  ["12", "+", "  if (!(await limiter.take(key))) {"],
  ["13", "+", '    return c.json({ error: "rate_limited", retryAfter: 1 }, 429);'],
  ["14", "+", "  }"],
  ["15", "+", "  await next();"],
  ["16", "+", "});"],
  ["17", " ", ""],
  ["18", "-", 'api.get("/levels", levels);'],
  ["18", "+", 'api.get("/levels", cache(60), levels);'],
];

const COMMIT: CommitView = {
  sha: "a41c3f7",
  repo: `${REPO}--ch-5`,
  subject: "Add token-bucket rate limiting to /api",
  channelId: "ch-5",
  intentId: "rate-limit-api",
  intentTitle: "Add rate limiting to /api",
  agent: "codex",
  strategy: "conservative",
  committedAt: ago(12 * 60),
  trailers: [
    { key: "Headwaters-Channel", value: "ch-5" },
    { key: "Headwaters-Intent", value: "rate-limit-api" },
    { key: "Headwaters-Agent", value: "codex" },
    { key: "Headwaters-Model", value: "gpt-5-codex" },
    { key: "Headwaters-Cost", value: "$0.27" },
    { key: "Headwaters-Risk", value: "0.72" },
    { key: "Logbook", value: "0012" },
  ],
  files: [
    {
      path: "src/api/middleware/rateLimit.ts",
      added: 18,
      removed: 1,
      lines: DIFF.map(([n, sign, text]) => ({ n, sign, text })),
    },
  ],
  logbook: {
    number: "0012",
    path: ".headwaters/logbook/0012-ch-5.md",
    plan: "Add a token-bucket limiter in front of /api. Keep the bucket in a Durable Object so limits hold across isolates.",
    decisions: [
      "10 req/s per token: the gauge dashboard polls at 1 req/s per widget and ships at most 6 widgets. 10 leaves headroom without inviting scraping.",
      "Return 429 with `retryAfter` rather than queueing. Callers are agents; they back off correctly.",
    ],
    rejected: [
      "In-memory map per isolate: limits reset on cold start. Cloudflare Rate Limiting rules: not versioned with the code.",
    ],
    notes: "`/levels` is now cached for 60s, so most dashboard polls never reach the bucket. Unauthenticated callers fall back to their IP.",
    model: "gpt-5-codex",
    strategy: "conservative",
    turns: 3,
    costUsd: 0.27,
    durationMs: 168_000,
    transcriptUrl: "#transcript",
  },
};

/** The design's one commit view (ch-5's rate limiter), whatever sha was asked for. */
export function commitFixture(): CommitView {
  return COMMIT;
}

export const ASK_QUERY = "Why does /api rate-limit at 10 req/s?";

export const ASK_FIXTURE: AskResult[] = [
  {
    sha: "a41c3f7",
    channelId: "ch-5",
    agent: "codex",
    intentTitle: "Add rate limiting to /api",
    quote:
      "10 req/s per token: the gauge dashboard polls at 1 req/s per widget and ships at most 6 widgets. 10 leaves headroom without inviting scraping.",
    logbook: "0012",
  },
];
