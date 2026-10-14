// ChannelAgent: one per Channel (one agent's attempt at an Intent, in its own fork).
// Drives an AgentAdapter tick by tick (each tick is a scheduled callback, so runs survive
// evictions) and fans its updates out to D1, the RiverAgent, and the feed.
import { Agent, getAgentByName } from "agents";
import { shortSha, type ChannelStatus, type Strategy } from "@braid/protocol";
import { updateChannel } from "../db.ts";
import { channelFinished } from "../intents.ts";
import type { AdapterContext, AdapterState, AgentAdapter, AgentUpdate } from "./adapters/index.ts";
import { LiveAdapter } from "./adapters/claude-code.ts";
import { ScriptedAdapter } from "./adapters/scripted.ts";

const MAX_TICK_FAILURES = 3;

export interface ChannelConfig {
  riverId: string;
  intentId: string;
  intentTitle: string;
  intentGoal: string;
  checks: string[];
  channelId: string;
  repo: string;
  remote: string;
  mainRepo: string;
  strategy: Strategy;
  mode: "scripted" | "live";
  logbookNumber: string;
}

export interface ChannelState {
  config: ChannelConfig | null;
  status: ChannelStatus;
  statusText: string;
  progress: number;
  marks: number[];
  headSha: string | null;
  commits: number;
  costUsd: number;
  startedAt: number | null;
  finishedAt: number | null;
  adapter: AdapterState | null;
  failures: number;
  error: string | null;
}

export class ChannelAgent extends Agent<Env, ChannelState> {
  override initialState: ChannelState = {
    config: null,
    status: "forking",
    statusText: "forking",
    progress: 0.04,
    marks: [],
    headSha: null,
    commits: 0,
    costUsd: 0,
    startedAt: null,
    finishedAt: null,
    adapter: null,
    failures: 0,
    error: null,
  };

  override shouldConnectionBeReadonly(): boolean {
    return true;
  }

  async snapshot(): Promise<ChannelState> {
    return this.state;
  }

  /**
   * Start the run. Idempotent while a run is live; a stopped run (demo reset, Eddy drop) can
   * start again, because after a reset Channel numbers restart and reuse this Durable Object.
   */
  async start(config: ChannelConfig): Promise<{ started: boolean }> {
    if (this.state.config && this.state.status !== "dropped") return { started: false };
    for (const s of this.getSchedules()) await this.cancelSchedule(s.id);
    this.setState({
      ...this.initialState,
      config,
      startedAt: Date.now(),
      adapter: { phase: "start", i: 0, startedAt: Date.now() },
    });
    await this.schedule(1, "tick");
    return { started: true };
  }

  /** Stop a run (demo reset or an Eddy "drop"). */
  async stop(reason = "stopped"): Promise<void> {
    for (const s of this.getSchedules()) await this.cancelSchedule(s.id);
    this.setState({ ...this.state, status: "dropped", statusText: reason, finishedAt: Date.now(), adapter: null });
  }

  async tick(): Promise<void> {
    const { config, adapter: adapterState } = this.state;
    if (!config || !adapterState || adapterState.phase === "done") return;
    const adapter = this.adapterFor(config);
    if (!adapter) {
      await this.apply(config, [{ kind: "done", ok: false, error: `no ${config.mode} adapter for ${config.intentId}/${config.strategy}` }]);
      return;
    }
    try {
      const result = await adapter.tick(this.context(config), adapterState);
      this.setState({ ...this.state, adapter: result.state, failures: 0 });
      await this.apply(config, result.updates);
      if (result.next !== null) await this.schedule(result.next, "tick");
    } catch (err) {
      const failures = this.state.failures + 1;
      const error = err instanceof Error ? err.message : String(err);
      console.error("channel tick failed", { channel: config.channelId, phase: adapterState.phase, failures, error });
      this.setState({ ...this.state, failures, error });
      if (failures < MAX_TICK_FAILURES) await this.schedule(5 * failures, "tick");
      else await this.apply(config, [{ kind: "done", ok: false, error }]);
    }
  }

  private adapterFor(config: ChannelConfig): AgentAdapter | null {
    if (config.mode === "live") return new LiveAdapter(this.env);
    return ScriptedAdapter.for(config.intentId, config.strategy);
  }

  private context(config: ChannelConfig): AdapterContext {
    return {
      env: this.env,
      riverId: config.riverId,
      intentId: config.intentId,
      intentTitle: config.intentTitle,
      intentGoal: config.intentGoal,
      checks: config.checks,
      channelId: config.channelId,
      repo: config.repo,
      remote: config.remote,
      mainRepo: config.mainRepo,
      strategy: config.strategy,
      logbookNumber: config.logbookNumber,
    };
  }

  /**
   * Local development only (BRAID_SIMULATE_EVENTS=1): Artifacts events fire only for the
   * deployed Worker, so start ReviewWorkflow with the same cf.artifacts.repo.pushed envelope.
   */
  private async simulatePushEvent(config: ChannelConfig, sha: string, before: string): Promise<void> {
    if ((this.env.BRAID_SIMULATE_EVENTS as string) !== "1") return;
    await this.env.REVIEW_WF.create({
      id: `sim-${config.repo}-${sha.slice(0, 12)}`,
      params: {
        type: "cf.artifacts.repo.pushed",
        source: { type: "artifacts.repo", namespace: "braid", repoName: config.repo },
        payload: { ref: "refs/heads/main", before, after: sha, commits: [], totalCommitsCount: 1, commitsTruncated: false },
        metadata: { accountId: "local", eventSchemaVersion: 1, eventTimestamp: new Date().toISOString(), simulated: true },
      },
    });
  }

  /** Fan updates out to this state, D1, the River map and the feed. */
  private async apply(config: ChannelConfig, updates: AgentUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    const river = await getAgentByName(this.env.RiverAgent, config.riverId);
    let s = { ...this.state };
    let finished: { ok: boolean; error?: string } | null = null;

    for (const u of updates) {
      if (u.kind === "status") {
        s = { ...s, status: u.status, statusText: u.text, progress: u.progress ?? s.progress };
      } else if (u.kind === "commit") {
        const before = s.headSha ?? "0".repeat(40);
        s = { ...s, headSha: u.sha, commits: s.commits + 1, marks: [...s.marks, Math.max(0.05, s.progress)] };
        // Same id as the Artifacts event path, so the feed shows each push once.
        await river.recordEvent({
          id: `pushed:${config.repo}:${u.sha}`,
          type: "repo.pushed",
          at: Date.now(),
          riverId: config.riverId,
          intentId: config.intentId,
          channelId: config.channelId,
          detail: `${config.channelId} → ${shortSha(u.sha)} · ${u.files} file${u.files === 1 ? "" : "s"}`,
          data: { sha: u.sha, commits: 1, subject: u.subject },
        });
        await this.simulatePushEvent(config, u.sha, before);
      } else if (u.kind === "cost") {
        s = { ...s, costUsd: u.usd };
      } else if (u.kind === "done") {
        finished = { ok: u.ok, error: u.error };
        s = {
          ...s,
          status: u.ok ? s.status : "failed",
          statusText: u.ok ? s.statusText : `failed: ${(u.error ?? "").slice(0, 60)}`,
          finishedAt: Date.now(),
          error: u.error ?? null,
        };
      }
    }
    this.setState(s);

    const durationMs = s.finishedAt && s.startedAt ? s.finishedAt - s.startedAt : undefined;
    await updateChannel(this.env.DB, config.riverId, config.channelId, {
      status: s.status,
      statusText: s.statusText,
      headSha: s.headSha ?? undefined,
      commits: s.commits,
      costUsd: s.costUsd || undefined,
      durationMs,
    });
    await river.updateChannel(config.intentId, config.channelId, {
      status: s.status,
      statusText: s.statusText,
      progress: s.progress,
      marks: s.marks,
      headSha: s.headSha ?? undefined,
      commits: s.commits,
    });
    if (finished) await channelFinished(this.env, config.riverId, config.intentId);
  }
}
