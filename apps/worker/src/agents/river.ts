// RiverAgent: one per River. The single strongly consistent point for a project:
// live Lines, presence, the Eddy count, the live feed, and the calm counter.
// Browser clients connect over WebSocket (/ws/river/:id) and receive state updates.
import { Agent } from "agents";
import {
  findOverlaps,
  normalizeGlob,
  type ChannelOverlap,
  type ChannelView,
  type FeedEvent,
  type IntentView,
  type Line,
  type LineDeclareResult,
  type RiverState,
} from "@braid/protocol";

const FEED_IN_STATE = 60;
const FEED_KEEP = 500;

export type { RiverState };

export interface DeclareLinesArgs {
  channelId: string;
  intentId?: string;
  globs: string[];
  note?: string;
  /** Claim even when others hold overlapping Lines (the overlap is still reported). */
  force?: boolean;
}

export class RiverAgent extends Agent<Env, RiverState> {
  override initialState: RiverState = {
    riverId: "",
    name: "",
    owner: "",
    repo: "",
    head: null,
    counters: { agents: 0, commits: 0, previews: 0, decisions: 0, autoMerged: 0 },
    intents: [],
    feed: [],
    lines: [],
    overlaps: [],
    decisions: 0,
    merged: false,
  };

  // Clients read state; every change goes through server methods.
  override shouldConnectionBeReadonly(): boolean {
    return true;
  }

  override async onStart(): Promise<void> {
    this.sql`CREATE TABLE IF NOT EXISTS feed (
      id TEXT PRIMARY KEY, at INTEGER NOT NULL, type TEXT NOT NULL, body TEXT NOT NULL)`;
    this.sql`CREATE INDEX IF NOT EXISTS feed_at ON feed(at DESC)`;
    this.sql`CREATE TABLE IF NOT EXISTS lines (
      channel_id TEXT NOT NULL, intent_id TEXT, glob TEXT NOT NULL, note TEXT, declared_at INTEGER NOT NULL,
      PRIMARY KEY (channel_id, glob))`;
    this.sql`CREATE TABLE IF NOT EXISTS presence (
      channel_id TEXT PRIMARY KEY, agent TEXT, model TEXT, seen_at INTEGER NOT NULL)`;
    if (this.state.riverId !== this.name) this.setState({ ...this.state, riverId: this.name });
  }

  // ── River ─────────────────────────────────────────────────────────────────

  async init(info: { name: string; owner: string; repo: string; head: string | null }): Promise<void> {
    this.setState({ ...this.state, riverId: this.name, ...info });
  }

  async setHead(head: string | null): Promise<void> {
    this.setState({ ...this.state, head });
  }

  async setDecisions(decisions: number): Promise<void> {
    this.setState({ ...this.state, decisions, counters: { ...this.state.counters, decisions } });
  }

  async snapshot(): Promise<RiverState> {
    return this.state;
  }

  /** Demo reset: forget Intents, Lines, overlaps and counters. The feed is kept for history. */
  async reset(): Promise<void> {
    this.sql`DELETE FROM lines`;
    this.sql`DELETE FROM presence`;
    this.sql`DELETE FROM feed`;
    this.setState({
      ...this.initialState,
      riverId: this.name,
      name: this.state.name,
      owner: this.state.owner,
      repo: this.state.repo,
      head: this.state.head,
    });
  }

  // ── Intents and Channels (the River map) ──────────────────────────────────

  async upsertIntent(intent: IntentView): Promise<void> {
    const intents = this.state.intents.some((i) => i.id === intent.id)
      ? this.state.intents.map((i) => (i.id === intent.id ? intent : i))
      : [...this.state.intents, intent];
    this.setState(this.withDerived({ ...this.state, intents }));
  }

  async setIntentStatus(intentId: string, status: IntentView["status"]): Promise<void> {
    const intents = this.state.intents.map((i) => (i.id === intentId ? { ...i, status } : i));
    this.setState(this.withDerived({ ...this.state, intents }));
  }

  async updateChannel(intentId: string, channelId: string, patch: Partial<ChannelView>): Promise<void> {
    const intents = this.state.intents.map((i) =>
      i.id !== intentId ? i : { ...i, channels: i.channels.map((c) => (c.id === channelId ? { ...c, ...patch } : c)) },
    );
    this.setState(this.withDerived({ ...this.state, intents }));
  }

  private withDerived(s: RiverState): RiverState {
    const channels = s.intents.flatMap((i) => i.channels);
    return {
      ...s,
      counters: { ...s.counters, agents: channels.length },
      merged: s.intents.length > 0 && s.intents.every((i) => i.status === "merged"),
    };
  }

  // ── Feed ──────────────────────────────────────────────────────────────────

  /** Append a feed event. Idempotent on event.id. Returns false if it was already recorded. */
  async recordEvent(event: FeedEvent): Promise<boolean> {
    const before = this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM feed WHERE id = ${event.id}`;
    if ((before[0]?.n ?? 0) > 0) return false;
    this.sql`INSERT INTO feed (id, at, type, body) VALUES (${event.id}, ${event.at}, ${event.type}, ${JSON.stringify(event)})`;
    this.sql`DELETE FROM feed WHERE id NOT IN (SELECT id FROM feed ORDER BY at DESC LIMIT ${FEED_KEEP})`;

    const counters = { ...this.state.counters };
    if (event.type === "repo.pushed") counters.commits += Number(event.data?.commits ?? 1);
    if (event.type === "preview.ready") counters.previews += 1;
    if (event.type === "confluence.picked" && event.by === "auto") counters.autoMerged += 1;
    const feed = [event, ...this.state.feed.filter((e) => e.id !== event.id)]
      .sort((a, b) => b.at - a.at)
      .slice(0, FEED_IN_STATE);
    this.setState({ ...this.state, counters, feed });
    return true;
  }

  async getFeed(limit = 100): Promise<FeedEvent[]> {
    const rows = this.sql<{ body: string }>`SELECT body FROM feed ORDER BY at DESC LIMIT ${limit}`;
    return rows.map((r) => JSON.parse(r.body) as FeedEvent);
  }

  // ── Lines ─────────────────────────────────────────────────────────────────

  private liveLines(): Line[] {
    return this.sql<{ channel_id: string; intent_id: string | null; glob: string; note: string | null; declared_at: number }>`
      SELECT channel_id, intent_id, glob, note, declared_at FROM lines ORDER BY declared_at`.map((r) => ({
      channelId: r.channel_id,
      intentId: r.intent_id ?? undefined,
      glob: r.glob,
      note: r.note ?? undefined,
      declaredAt: r.declared_at,
    }));
  }

  /**
   * Declare Lines before editing. Overlaps with other Channels are returned (ok:false) and
   * broadcast as line.conflict. Non-overlapping globs are always claimed; overlapping ones only
   * with `force`, so an agent can narrow or yield.
   */
  async declareLines(args: DeclareLinesArgs): Promise<LineDeclareResult> {
    const globs = [...new Set(args.globs.map(normalizeGlob))];
    const live = this.liveLines();
    const overlaps = findOverlaps(args.channelId, globs, live);
    const contested = new Set(overlaps.map((o) => o.ours));
    const now = Date.now();
    const claimed = globs.filter((g) => args.force || !contested.has(g));
    for (const glob of claimed) {
      this.sql`INSERT INTO lines (channel_id, intent_id, glob, note, declared_at)
        VALUES (${args.channelId}, ${args.intentId ?? null}, ${glob}, ${args.note ?? null}, ${now})
        ON CONFLICT(channel_id, glob) DO UPDATE SET note = excluded.note, declared_at = excluded.declared_at`;
    }

    if (claimed.length > 0) {
      await this.recordEvent({
        id: `line.declared:${args.channelId}:${now}`,
        type: "line.declared",
        at: now,
        riverId: this.name,
        intentId: args.intentId,
        channelId: args.channelId,
        detail: `${args.channelId} · ${claimed.join(", ")}`,
      });
    }

    const newOverlaps: ChannelOverlap[] = [];
    for (const o of overlaps) {
      const exists = this.state.overlaps.some(
        (x) => x.path === o.path && ((x.a === o.channelId && x.b === args.channelId) || (x.a === args.channelId && x.b === o.channelId)),
      );
      if (!exists && !newOverlaps.some((x) => x.a === o.channelId && x.path === o.path)) {
        newOverlaps.push({ a: o.channelId, b: args.channelId, path: o.path, at: now });
      }
    }
    for (const o of newOverlaps) {
      await this.recordEvent({
        id: `line.conflict:${o.a}:${o.b}:${o.path}`,
        type: "line.conflict",
        at: now,
        riverId: this.name,
        intentId: args.intentId,
        channelId: args.channelId,
        detail: `${o.a} ↔ ${o.b} · ${o.path}`,
        data: { a: o.a, b: o.b, path: o.path },
      });
    }
    this.setState({ ...this.state, lines: this.liveLines(), overlaps: [...this.state.overlaps, ...newOverlaps] });

    return {
      ok: overlaps.length === 0,
      overlaps: overlaps.map((o) => ({ channelId: o.channelId, theirs: o.theirs, ours: o.ours, path: o.path })),
    };
  }

  /** Release a Channel's Lines (all, or the given globs). Clears overlaps that no longer hold. */
  async releaseLines(channelId: string, globs?: string[]): Promise<number> {
    let removed = 0;
    if (!globs || globs.length === 0) {
      removed = this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM lines WHERE channel_id = ${channelId}`[0]?.n ?? 0;
      this.sql`DELETE FROM lines WHERE channel_id = ${channelId}`;
    } else {
      for (const g of globs.map(normalizeGlob)) {
        removed += this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM lines WHERE channel_id = ${channelId} AND glob = ${g}`[0]?.n ?? 0;
        this.sql`DELETE FROM lines WHERE channel_id = ${channelId} AND glob = ${g}`;
      }
    }
    const lines = this.liveLines();
    const holders = new Set(lines.map((l) => l.channelId));
    const overlaps = this.state.overlaps.filter((o) => holders.has(o.a) && holders.has(o.b));
    this.setState({ ...this.state, lines, overlaps });
    return removed;
  }

  async heartbeat(channelId: string, agent: string, model?: string): Promise<void> {
    this.sql`INSERT INTO presence (channel_id, agent, model, seen_at) VALUES (${channelId}, ${agent}, ${model ?? null}, ${Date.now()})
      ON CONFLICT(channel_id) DO UPDATE SET agent = excluded.agent, model = excluded.model, seen_at = excluded.seen_at`;
  }
}
