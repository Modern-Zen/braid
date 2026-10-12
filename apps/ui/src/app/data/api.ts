// REST client for the Worker's human API (behind Cloudflare Access; same origin).
// Every reader has a fixture twin: with ?fixtures=1, or when the request fails,
// the screen renders the design's data instead of an error page.
import { useEffect, useRef, useState } from "react";
import type {
  AskResult,
  CommitView,
  EddyDecision,
  EddyView,
  IntentView,
  OpenIntentRequest,
  RiverState,
  RiverSummary,
  ScoutView,
  Strategy,
} from "@braid/protocol";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Not JSON; keep the status line.
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const enc = encodeURIComponent;
const river = (id: string) => `/api/rivers/${enc(id)}`;

// ── Readers ───────────────────────────────────────────────────────────────────

/** GET /api/rivers */
export async function getRivers(): Promise<RiverSummary[]> {
  const body = await request<RiverSummary[] | { rivers: RiverSummary[] }>("/api/rivers");
  return Array.isArray(body) ? body : body.rivers;
}

/** GET /api/rivers/:id/intents/:intent/scout */
export function getScout(riverId: string, intentId: string): Promise<ScoutView> {
  return request<ScoutView>(`${river(riverId)}/intents/${enc(intentId)}/scout`);
}

/** GET /api/rivers/:id/eddy */
export function getEddy(riverId: string): Promise<EddyView> {
  return request<EddyView>(`${river(riverId)}/eddy`);
}

/** GET /api/rivers/:id/commits/:sha?repo= */
export function getCommit(riverId: string, sha: string, repo?: string): Promise<CommitView> {
  const q = repo ? `?repo=${enc(repo)}` : "";
  return request<CommitView>(`${river(riverId)}/commits/${enc(sha)}${q}`);
}

/** GET /api/rivers/:id/ask?q= ("Ask the river", stretch). */
export async function askRiver(riverId: string, q: string): Promise<AskResult[]> {
  const body = await request<AskResult[] | { results: AskResult[] }>(`${river(riverId)}/ask?q=${enc(q)}`);
  return Array.isArray(body) ? body : body.results;
}

// ── Writers ───────────────────────────────────────────────────────────────────

/** POST /api/rivers/:id/intents */
export function openIntent(riverId: string, req: OpenIntentRequest): Promise<IntentView | { id: string }> {
  return request(`${river(riverId)}/intents`, { method: "POST", body: JSON.stringify(req) });
}

/** POST /api/rivers/:id/eddy/:card {action} */
export function decideEddy(riverId: string, cardId: string, action: string): Promise<unknown> {
  const body: EddyDecision = { action };
  return request(`${river(riverId)}/eddy/${enc(cardId)}`, { method: "POST", body: JSON.stringify(body) });
}

/**
 * Proposed (not yet in packages/protocol): POST /api/rivers/:id/intents/:intent/pick {channelId}.
 * Scout's "Pick ch-n" when the verdict is clear (a tie goes through the Eddy card).
 */
export interface PickRequest {
  channelId: string;
}
export function pickChannel(riverId: string, intentId: string, channelId: string): Promise<unknown> {
  const body: PickRequest = { channelId };
  return request(`${river(riverId)}/intents/${enc(intentId)}/pick`, { method: "POST", body: JSON.stringify(body) });
}

/**
 * POST /api/rivers/:id/channels/:ch/replay {sha, strategy, model?}
 * "Replay from here": fork the Channel at `sha` into a new Channel.
 */
export interface ReplayRequest {
  sha: string;
  strategy: Strategy;
  model?: string;
}
export function replayChannel(riverId: string, channelId: string, req: ReplayRequest): Promise<{ channelId?: string; id?: string } | undefined> {
  return request(`${river(riverId)}/channels/${enc(channelId)}/replay`, { method: "POST", body: JSON.stringify(req) });
}

// ── Session (operator token when Cloudflare Access isn't in front) ────────────

export type SessionStatus = "ok" | "signin";

/**
 * GET /api/session. 401 means "sign in"; anything else (200, or a Worker that isn't
 * there, as in `vite dev` alone) lets the app proceed and fall back per request.
 */
export async function getSession(): Promise<SessionStatus> {
  try {
    const res = await fetch("/api/session", { credentials: "same-origin", headers: { accept: "application/json" } });
    return res.status === 401 ? "signin" : "ok";
  } catch {
    return "ok";
  }
}

/** POST /api/session {token}: sets the session cookie the REST API and the River socket use. */
export async function signIn(token: string): Promise<void> {
  await request("/api/session", { method: "POST", body: JSON.stringify({ token }) });
}

// ── Commits and state ─────────────────────────────────────────────────────────

/** GET /api/rivers/:id/commits?repo= — recent commits, main by default. */
export interface CommitSummary {
  sha: string;
  subject: string;
  /** Trailer pairs (or a key → value map, depending on the Worker version). */
  trailers: Array<{ key: string; value: string }> | Record<string, string>;
  committedAt: number;
}
export async function getCommits(riverId: string, repo?: string): Promise<CommitSummary[]> {
  const q = repo ? `?repo=${enc(repo)}` : "";
  const body = await request<CommitSummary[] | { commits: CommitSummary[] }>(`${river(riverId)}/commits${q}`);
  return Array.isArray(body) ? body : body.commits;
}

/** The Logbook number a commit's trailers point at, if any ("Logbook: 0012"). */
export function logbookTrailer(t: CommitSummary["trailers"] | undefined): string | null {
  if (!t) return null;
  if (Array.isArray(t)) return t.find((p) => p.key.toLowerCase() === "logbook")?.value ?? null;
  for (const [k, v] of Object.entries(t)) if (k.toLowerCase() === "logbook" && v) return v;
  return null;
}

/** GET /api/rivers/:id/state — RiverState over REST, when the socket can't connect. */
export function getRiverState(riverId: string): Promise<RiverState> {
  return request<RiverState>(`${river(riverId)}/state`);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export type Source = "live" | "fixtures" | "fallback";

export interface Resource<T> {
  data: T | null;
  /** Where `data` came from: the API, explicit fixtures, or fixtures after a failed request. */
  source: Source;
  loading: boolean;
  error: Error | null;
  /** Replace the data locally (optimistic updates). */
  set: (next: T) => void;
}

/**
 * Fetch `load()` whenever `key` changes. With `fixtures`, never touch the network.
 * On failure, fall back to `fixture()` so the screen still renders.
 */
export function useResource<T>(key: string, opts: { fixtures: boolean; load: () => Promise<T>; fixture: () => T }): Resource<T> {
  const { fixtures, load, fixture } = opts;
  const [state, setState] = useState<{ key: string; data: T | null; source: Source; error: Error | null; loading: boolean }>(() =>
    fixtures
      ? { key, data: fixture(), source: "fixtures", error: null, loading: false }
      : { key, data: null, source: "live", error: null, loading: true },
  );
  const loadRef = useRef(load);
  const fixtureRef = useRef(fixture);
  loadRef.current = load;
  fixtureRef.current = fixture;

  useEffect(() => {
    if (fixtures) {
      setState({ key, data: fixtureRef.current(), source: "fixtures", error: null, loading: false });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, key, loading: true }));
    loadRef.current().then(
      (data) => live && setState({ key, data, source: "live", error: null, loading: false }),
      (error: unknown) => {
        if (!live) return;
        const err = error instanceof Error ? error : new Error(String(error));
        console.warn(`[braid] ${key}: ${err.message}; showing fixtures`);
        setState({ key, data: fixtureRef.current(), source: "fallback", error: err, loading: false });
      },
    );
    return () => {
      live = false;
    };
  }, [key, fixtures]);

  return {
    data: state.data,
    source: state.source,
    loading: state.loading,
    error: state.error,
    set: (next: T) => setState((s) => ({ ...s, data: next })),
  };
}
