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
 * Proposed (M9, not yet in packages/protocol): POST /api/rivers/:id/replay.
 * "Replay from here": fork the Channel repo at `sha` into a new Channel.
 */
export interface ReplayRequest {
  repo: string;
  sha: string;
  agent: string;
  strategy: Strategy;
}
export function replayFrom(riverId: string, req: ReplayRequest): Promise<{ channelId?: string }> {
  return request(`${river(riverId)}/replay`, { method: "POST", body: JSON.stringify(req) });
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
