// Artifacts events → R2 (raw, always first) → internal feed events.
//
// Two delivery paths:
//   - cf.artifacts.repo.pushed for every repo in the namespace starts ReviewWorkflow
//     directly (wrangler `triggers.events`); its first step calls storeRawEvent().
//   - account-level events (repo.created / forked / deleted / imported) arrive on the
//     braid-artifacts-events queue through a Queues event subscription.
import { getAgentByName } from "agents";
import { parseRepoName, shortSha, type FeedEvent } from "@braid/protocol";

/**
 * The envelope Artifacts emits. Field names follow what actually arrives (see R2 events/):
 * via a Queues subscription it carries `metadata` and `source.type`; via a `triggers.events`
 * Workflow it arrives as the instance payload `{ id, type, source: { namespace, repoName }, payload }`.
 */
export interface ArtifactsEvent {
  id?: string;
  type: string; // "cf.artifacts.repo.pushed"
  source: { type?: string; namespace: string; repoName: string };
  payload: Record<string, unknown>;
  metadata?: {
    accountId: string;
    eventSubscriptionId?: string;
    eventSchemaVersion: number;
    eventTimestamp: string;
  };
}

export interface PushedPayload {
  ref: string;
  before: string;
  after: string;
  commits: Array<{
    id: string;
    message: string;
    messageTruncated?: boolean;
    timestamp: string;
    author: { name: string; email: string };
    committer: { name: string; email: string };
    parents: string[];
  }>;
  totalCommitsCount: number;
  commitsTruncated: boolean;
}

/** Best-effort extraction of an Artifacts event from whatever wrapper delivered it. */
export function asArtifactsEvent(raw: unknown): ArtifactsEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.type === "string" && r.type.startsWith("cf.artifacts.") && r.source && typeof r.source === "object") {
    return r as unknown as ArtifactsEvent;
  }
  // Some deliveries nest the event (e.g. { event: {...} } or { payload: {...} }).
  for (const key of ["workflowEvent", "event", "payload", "body", "data"]) {
    const inner = asArtifactsEvent(r[key]);
    if (inner) return inner;
  }
  return null;
}

/** Idempotency key for an event. Pushes are keyed by (repo, after). */
export function eventKey(e: ArtifactsEvent): string {
  const repo = e.source.repoName;
  if (e.type === "cf.artifacts.repo.pushed") return `pushed:${repo}:${String(e.payload.after ?? "")}`;
  if (e.type === "cf.artifacts.repo.forked") return `forked:${repo}:${String(e.payload.repoName ?? "")}`;
  return `${e.type.replace("cf.artifacts.", "")}:${repo}:${e.metadata?.eventTimestamp ?? ""}`;
}

/**
 * Write the raw event to R2 before anything else touches it.
 * Key: events/YYYY-MM-DD/<epoch-ms>-<type>-<repo>.json
 */
export async function storeRawEvent(env: Env, raw: unknown, via: "queue" | "workflow"): Promise<string> {
  const now = new Date();
  const e = asArtifactsEvent(raw);
  const type = e ? e.type.replace("cf.artifacts.", "") : "unknown";
  const repo = e?.source.repoName ?? "unknown";
  const key = `events/${now.toISOString().slice(0, 10)}/${now.getTime()}-${type}-${repo}.json`.replace(/[^\w./-]/g, "_");
  await env.BLOBS.put(key, JSON.stringify({ via, receivedAt: now.toISOString(), raw }, null, 2), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { type, repo, via },
  });
  return key;
}

/** Map a raw Artifacts event onto the feed vocabulary. Returns null for events the feed doesn't show. */
export function toFeedEvent(e: ArtifactsEvent): FeedEvent | null {
  const at = Date.parse(e.metadata?.eventTimestamp ?? "") || Date.now();
  switch (e.type) {
    case "cf.artifacts.repo.forked": {
      const target = String(e.payload.repoName ?? "");
      const parsed = parseRepoName(target);
      if (parsed.kind !== "channel") return null;
      return {
        id: eventKey(e),
        type: "repo.forked",
        at,
        riverId: parsed.river,
        channelId: parsed.channel,
        detail: `${parsed.channel} · ${target}`,
      };
    }
    case "cf.artifacts.repo.pushed": {
      const parsed = parseRepoName(e.source.repoName);
      if (parsed.kind !== "channel") return null;
      const p = e.payload as unknown as PushedPayload;
      return {
        id: eventKey(e),
        type: "repo.pushed",
        at,
        riverId: parsed.river,
        channelId: parsed.channel,
        detail: `${parsed.channel} → ${shortSha(p.after)} · ${p.totalCommitsCount} commit${p.totalCommitsCount === 1 ? "" : "s"}`,
        data: { sha: p.after, ref: p.ref, commits: p.totalCommitsCount },
      };
    }
    case "cf.artifacts.repo.created": {
      const parsed = parseRepoName(e.source.repoName);
      if (parsed.kind !== "main") return null;
      // Same id as createRiver's event, so the River is announced once.
      return { id: `river.created:${parsed.river}`, type: "river.created", at, riverId: parsed.river, detail: `${parsed.river} · ${e.source.repoName}` };
    }
    default:
      return null;
  }
}

/** Queue consumer for account-level Artifacts events. */
export async function handleArtifactsQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await storeRawEvent(env, msg.body, "queue");
      const e = asArtifactsEvent(msg.body);
      const feed = e ? toFeedEvent(e) : null;
      if (feed) {
        const river = await getAgentByName(env.RiverAgent, feed.riverId);
        await river.recordEvent(feed);
      }
      msg.ack();
    } catch (err) {
      console.error("artifacts event failed", { id: msg.id, err: String(err) });
      msg.retry({ delaySeconds: 5 });
    }
  }
}
