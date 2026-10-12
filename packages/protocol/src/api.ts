// UI ⇄ Worker contract: REST view models and the live River state.
// The UI renders exactly these shapes; the Worker produces them. Change with a PR note.
import type { FeedEvent } from "./events.ts";
import type { Line } from "./lines.ts";
import type { AgentMode, ChannelStatus, Counters, EddyCard, IntentStatus, Strategy, Verdict } from "./types.ts";

// ── Live state (WebSocket /ws/river/:id, Agents SDK state sync) ──────────────

export interface ChannelView {
  id: string; // "ch-2"
  intentId: string;
  repo: string;
  agent: string; // real agent that produced the work, e.g. "claude-code"
  model?: string;
  strategy: Strategy;
  /** Scripted replay of a recorded series: show a small "replay" tag on the chip. */
  replay: boolean;
  status: ChannelStatus;
  statusText: string; // "editing 3 files", "pushed a41c…", "tests ✓"
  /** 0..1 along the run, for the River map. */
  progress: number;
  /** Commit positions along the run, 0..1, oldest first. */
  marks: number[];
  headSha?: string;
  commits: number;
  previewUrl?: string;
}

export interface IntentView {
  id: string; // "dark-mode"
  title: string; // "Add a dark mode"
  status: IntentStatus;
  mode: AgentMode;
  openedAt: number;
  channels: ChannelView[];
}

export interface RiverState {
  riverId: string;
  name: string;
  owner: string; // "modern-zen"
  repo: string; // "river-riverlevels"
  head: string | null; // short sha of main
  counters: Counters;
  intents: IntentView[];
  feed: FeedEvent[]; // newest first, ≤ 60
  lines: Line[];
  /** Live overlaps between Channels, for the shoal on the River map. */
  overlaps: ChannelOverlap[];
  /** Number of open Eddy cards (the amber badge). */
  decisions: number;
  /** True once every Intent has merged. */
  merged: boolean;
}

/** Two Channels whose Lines overlap: "ch-2 ↔ ch-7 · src/components/Gauge.tsx". */
export interface ChannelOverlap {
  a: string; // the Channel that declared first
  b: string; // the Channel whose declaration collided
  path: string;
  at: number;
}

// ── REST ──────────────────────────────────────────────────────────────────────

export interface RiverSummary {
  id: string;
  name: string;
  owner: string;
  repo: string;
  head: string | null;
  intents: number;
  decisions: number;
}

/** POST /api/rivers/:id/intents */
export interface OpenIntentRequest {
  title: string;
  goal: string;
  checks?: string[];
  mode?: AgentMode;
  /** Strategies to fan out to; defaults to the River policy (3 Channels). */
  strategies?: Strategy[];
  /** Optional stable slug; derived from the title otherwise. */
  id?: string;
}

/** GET /api/rivers/:id/intents/:intent/scout */
export interface ScoutView {
  intent: { id: string; title: string; status: IntentStatus };
  state: "running" | "verdict" | "tie";
  verdict: Verdict | null;
  channels: ScoutChannel[];
}

export interface ScoutChannel {
  id: string;
  agent: string;
  model?: string;
  strategy: Strategy;
  replay: boolean;
  status: ChannelStatus;
  statusText: string;
  rank: number | null; // 1 = best; null while running
  tests: { passed: number; total: number } | null;
  diff: { added: number; removed: number; files: number } | null;
  costUsd: number | null;
  durationMs: number | null;
  risk: number | null;
  note: string | null; // judge's one-liner for this Channel
  previewUrl: string | null;
  /** Same-origin URL of the preview screenshot, if one exists. */
  screenshotUrl: string | null;
  headSha: string | null;
}

/** GET /api/rivers/:id/eddy */
export interface EddyView {
  cards: EddyCard[];
  autoMerged: number;
}

/** POST /api/rivers/:id/eddy/:card */
export interface EddyDecision {
  action: string; // one of the card's action ids
}

/** GET /api/rivers/:id/commits/:sha?repo=<repo> — the Logbook / commit view. */
export interface CommitView {
  sha: string;
  repo: string;
  subject: string;
  channelId: string | null;
  intentId: string | null;
  intentTitle: string | null;
  agent: string | null;
  strategy: string | null;
  committedAt: number;
  trailers: Array<{ key: string; value: string }>;
  files: DiffFile[];
  logbook: LogbookView | null;
}

export interface DiffFile {
  path: string;
  added: number;
  removed: number;
  lines: Array<{ n: string; sign: " " | "+" | "-"; text: string }>;
}

export interface LogbookView {
  number: string;
  path: string;
  plan: string;
  decisions: string[];
  rejected: string[];
  notes: string;
  model: string;
  strategy?: string;
  turns?: number;
  costUsd?: number;
  durationMs?: number;
  transcriptUrl?: string;
}

/** GET /api/rivers/:id/ask?q= — "Ask the river" (Vectorize over Logbooks, stretch). */
export interface AskResult {
  sha: string;
  channelId: string;
  agent: string;
  intentTitle: string;
  quote: string; // from ## Decisions
  logbook: string; // "0012"
}
