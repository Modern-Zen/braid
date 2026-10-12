// Live feed vocabulary. Names and color families come from the design's event row.

export const FEED_EVENT_TYPES = [
  "river.created",
  "token.issued",
  "intent.opened",
  "repo.forked",
  "line.declared",
  "line.released",
  "line.conflict",
  "repo.pushed",
  "review.passed",
  "review.failed",
  "preview.ready",
  "scout.verdict",
  "eddy.card",
  "confluence.picked",
  "river.merged",
] as const;

export type FeedEventType = (typeof FEED_EVENT_TYPES)[number];

/** Color family; the UI maps these onto --hw-color-* tokens. */
export type FeedFamily = "channel" | "merged" | "conflict" | "human" | "meta";

export interface FeedEvent {
  /** Stable id; also the idempotency key (e.g. "repo.pushed:<repo>:<sha>"). */
  id: string;
  type: FeedEventType;
  /** Epoch milliseconds. The UI renders relative times only. */
  at: number;
  riverId: string;
  intentId?: string;
  channelId?: string;
  /** One line, as shown in the feed: "ch-2 → a41c3f7 · 4 files". */
  detail: string;
  /** For confluence.picked: who picked. */
  by?: "auto" | "you";
  data?: Record<string, unknown>;
}

export function feedFamily(e: Pick<FeedEvent, "type" | "by">): FeedFamily {
  switch (e.type) {
    case "repo.pushed":
    case "line.declared":
    case "preview.ready":
    case "scout.verdict":
      return "channel";
    case "review.passed":
    case "river.merged":
      return "merged";
    case "line.conflict":
    case "review.failed":
      return "conflict";
    case "eddy.card":
      return "human";
    case "confluence.picked":
      return e.by === "you" ? "human" : "merged";
    default:
      return "meta";
  }
}

/** Short sha for display: "a41c3f7". */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
