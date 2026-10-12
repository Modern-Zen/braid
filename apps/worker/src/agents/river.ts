// RiverAgent: one per River. The single strongly consistent point for a project:
// live Lines, presence, the Eddy, the live feed, and the calm counter.
// Browser clients connect over WebSocket (/ws/river/:id) and receive state updates.
import { Agent } from "agents";
import type { Counters, FeedEvent, Line } from "@braid/protocol";

const FEED_IN_STATE = 60;
const FEED_KEEP = 500;

export interface RiverState {
  riverId: string;
  head: string | null; // short sha of main
  counters: Counters;
  feed: FeedEvent[]; // newest first
  lines: Line[];
}

export class RiverAgent extends Agent<Env, RiverState> {
  override initialState: RiverState = {
    riverId: "",
    head: null,
    counters: { agents: 0, commits: 0, previews: 0, decisions: 0, autoMerged: 0 },
    feed: [],
    lines: [],
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

  /** Append a feed event. Idempotent on event.id. Returns false if it was already recorded. */
  async recordEvent(event: FeedEvent): Promise<boolean> {
    const before = this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM feed WHERE id = ${event.id}`;
    if ((before[0]?.n ?? 0) > 0) return false;
    this.sql`INSERT INTO feed (id, at, type, body) VALUES (${event.id}, ${event.at}, ${event.type}, ${JSON.stringify(event)})`;
    this.sql`DELETE FROM feed WHERE id NOT IN (SELECT id FROM feed ORDER BY at DESC LIMIT ${FEED_KEEP})`;

    const counters = { ...this.state.counters };
    if (event.type === "repo.pushed") counters.commits += Number(event.data?.commits ?? 1);
    if (event.type === "preview.ready") counters.previews += 1;
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

  async snapshot(): Promise<RiverState> {
    return this.state;
  }
}
