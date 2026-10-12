// Shared domain types. D1 rows, API payloads and RiverAgent state use these shapes.

export const STRATEGIES = ["minimal-diff", "tests-first", "rewrite", "conservative", "bold"] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const AGENT_MODES = ["scripted", "live"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export type IntentStatus = "open" | "running" | "scouting" | "confluence" | "merged" | "eddy";

export type ChannelStatus =
  | "forking"
  | "cloning"
  | "planning"
  | "editing"
  | "pushed"
  | "testing"
  | "done"
  | "failed"
  | "merged"
  | "dropped";

export interface RiverPolicy {
  /** Auto-merge only below this risk (default 0.60). */
  autoMergeRisk: number;
  channelsPerIntent: number;
  judgeModel: string;
  /** Hard spend cap per Channel in USD (live mode). */
  channelBudgetUsd: number;
}

export const DEFAULT_POLICY: RiverPolicy = {
  autoMergeRisk: 0.6,
  channelsPerIntent: 3,
  judgeModel: "claude-sonnet-5-5",
  channelBudgetUsd: 2,
};

export interface River {
  id: string; // slug, e.g. "riverlevels"
  name: string;
  owner: string; // "modern-zen"
  mainRepo: string; // "river-riverlevels"
  remote: string;
  defaultBranch: string;
  policy: RiverPolicy;
  createdAt: number;
}

export interface Intent {
  id: string; // slug, e.g. "rate-limit-api"
  riverId: string;
  title: string;
  goal: string;
  checks: string[];
  status: IntentStatus;
  mode: AgentMode;
  createdAt: number;
}

export interface Channel {
  id: string; // "ch-5" (River-wide)
  riverId: string;
  intentId: string;
  repo: string; // "river-riverlevels--ch-5"
  remote: string;
  agent: string; // the agent that actually produced the work, e.g. "claude-code"
  model?: string;
  strategy: Strategy;
  /** Scripted channels replay a recorded patch series. Shown as a "replay" tag. */
  replay: boolean;
  status: ChannelStatus;
  statusText?: string; // "editing 3 files"
  headSha?: string;
  commits: number;
  previewUrl?: string;
  screenshotKey?: string;
  costUsd?: number;
  durationMs?: number;
  createdAt: number;
}

export interface TestResult {
  passed: number;
  total: number;
  failures?: string[];
}

export interface DiffStat {
  added: number;
  removed: number;
  files: number;
}

export interface Review {
  repo: string;
  sha: string;
  riverId: string;
  channelId: string;
  intentId: string;
  ok: boolean;
  tests: TestResult;
  diff: DiffStat;
  risk: number; // 0..1
  riskReasons: string[];
  createdAt: number;
}

export type RiskBand = "low" | "mid" | "high";

/** < 0.40 low (teal) · 0.40–0.59 mid (grey) · ≥ 0.60 high (amber: needs approval). */
export function riskBand(risk: number): RiskBand {
  if (risk >= 0.6) return "high";
  if (risk >= 0.4) return "mid";
  return "low";
}

export interface RankedChannel {
  channelId: string;
  rank: number;
  note: string;
}

export interface Verdict {
  intentId: string;
  riverId: string;
  kind: "winner" | "tie";
  ranked: RankedChannel[];
  rationale: string; // two sentences
  judgeModel: string;
  createdAt: number;
}

export type EddyKind = "pick" | "approve" | "confirm";

export interface EddyCard {
  id: string;
  riverId: string;
  intentId: string;
  kind: EddyKind;
  question: string; // "Pick a dark mode"
  meta: string; // "Add a dark mode · ch-2 vs ch-3"
  context: string;
  actions: Array<{ id: string; label: string; style: "primary" | "secondary" | "tertiary" }>;
  /** Workflow instance waiting on this decision. */
  workflowId?: string;
  decision?: string;
  decidedAt?: number;
  createdAt: number;
}

/** The calm counter: "9 agents · 41 commits · 3 previews · 1 decision for you". */
export interface Counters {
  agents: number;
  commits: number;
  previews: number;
  decisions: number;
  autoMerged: number;
}

export function decisionLabel(n: number): string {
  if (n === 0) return "nothing for you";
  return n === 1 ? "1 decision for you" : `${n} decisions for you`;
}
