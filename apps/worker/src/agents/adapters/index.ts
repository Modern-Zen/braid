// AgentAdapter: how a Channel's agent does its work.
//
// An adapter is a resumable stream of updates. ChannelAgent calls tick() and gets back the
// updates since the last tick ({status, commit, cost, done}) plus when to call again, so a
// run survives Durable Object evictions: every tick is scheduled, nothing sleeps in memory.
//
//   scripted     replays a recorded patch series (real agent output) in a sandbox
//   claude-code  runs Claude Code headless in a sandbox (live mode)
// External agents of any vendor join through MCP instead and push directly.
import type { ChannelStatus, Strategy } from "@braid/protocol";

export type AgentUpdate =
  | { kind: "status"; status: ChannelStatus; text: string; progress?: number }
  | { kind: "commit"; sha: string; subject: string; files: number }
  | { kind: "cost"; usd: number; durationMs?: number; turns?: number }
  | { kind: "done"; ok: boolean; error?: string };

export interface AdapterContext {
  env: Env;
  riverId: string;
  intentId: string;
  intentTitle: string;
  intentGoal: string;
  checks: string[];
  channelId: string;
  /** The Channel's own fork. */
  repo: string;
  remote: string;
  /** The River's mainline. */
  mainRepo: string;
  strategy: Strategy;
  logbookNumber: string;
}

export interface AdapterState {
  phase: string;
  i: number;
  startedAt: number;
  [key: string]: unknown;
}

export interface TickResult {
  updates: AgentUpdate[];
  state: AdapterState;
  /** Seconds until the next tick, or null when the run is over. */
  next: number | null;
}

export interface AgentAdapter {
  readonly kind: "scripted" | "live";
  /** The agent that actually produces the work (shown in the UI). */
  readonly agent: string;
  readonly model: string;
  /** True for replays of a recorded series. */
  readonly replay: boolean;
  tick(ctx: AdapterContext, state: AdapterState): Promise<TickResult>;
}

/** Random delay in [min, max] seconds, scaled by BRAID_SCRIPTED_SPEED (default 1). */
export function jitter(env: Env, [min, max]: [number, number]): number {
  const speed = Number((env as Env & { BRAID_SCRIPTED_SPEED?: string }).BRAID_SCRIPTED_SPEED ?? "1") || 1;
  return Math.max(1, Math.round((min + Math.random() * (max - min)) * speed));
}
