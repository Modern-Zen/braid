// Live River state over the River's WebSocket (/ws/river/<id>), via the Agents SDK
// state sync. The RiverAgent is read-only to clients; every change happens server-side
// and arrives here as a full RiverState.
//
// Falls back to fixtures when ?fixtures=1, or when the socket fails before the first
// state arrives (e.g. `vite dev` without `wrangler dev`). The socket keeps retrying in
// the background and the screen switches to live data the moment state arrives.
import { useAgent } from "agents/react";
import { useEffect, useMemo, useState } from "react";
import type { RiverState } from "@braid/protocol";
import { riverFixture, type RiverFixture } from "./fixtures.ts";
import { readParams } from "./params.ts";

/** How long to wait for the first state before showing fixtures. */
const FIRST_STATE_TIMEOUT_MS = 4000;

export type RiverSource = "live" | "connecting" | "fixtures" | "fallback";

export interface RiverConnection {
  state: RiverState;
  /**
   * live       state from the RiverAgent
   * connecting no state yet (state is an empty placeholder)
   * fixtures   ?fixtures=1
   * fallback   the socket failed; fixtures until it recovers
   */
  source: RiverSource;
}

export interface UseRiverOptions {
  /** Force fixtures regardless of the URL. Defaults to ?fixtures=1. */
  fixtures?: boolean;
  /** Which fixture state to show when on fixtures (default "running"). */
  fixtureState?: RiverFixture;
}

export function useRiver(riverId: string, opts: UseRiverOptions = {}): RiverConnection {
  const fixtures = opts.fixtures ?? readParams().fixtures;
  const fixtureState = opts.fixtureState ?? "running";
  const [live, setLive] = useState<RiverState | null>(null);
  const [failed, setFailed] = useState(false);

  useAgent<RiverState>({
    agent: "river-agent",
    name: riverId,
    basePath: `ws/river/${riverId}`,
    enabled: !fixtures,
    onStateUpdate: (state) => {
      setLive(state);
      setFailed(false);
    },
    onError: () => setFailed(true),
    onClose: () => setFailed(true),
    onConnectionError: () => setFailed(true),
  });

  // A socket that opens but never sends state (or a proxy that hangs) counts as failed.
  useEffect(() => {
    setLive(null);
    setFailed(false);
    if (fixtures) return;
    const t = setTimeout(() => setFailed(true), FIRST_STATE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [riverId, fixtures]);

  return useMemo((): RiverConnection => {
    if (fixtures) return { state: riverFixture(fixtureState, riverId), source: "fixtures" };
    if (live) return { state: normalize(live, riverId), source: "live" };
    if (failed) return { state: riverFixture(fixtureState, riverId), source: "fallback" };
    return { state: placeholder(riverId), source: "connecting" };
  }, [fixtures, fixtureState, live, failed, riverId]);
}

/** Defensive defaults: the RiverAgent may be mid-migration while other workstreams land. */
function normalize(s: RiverState, riverId: string): RiverState {
  return {
    ...s,
    riverId: s.riverId || riverId,
    name: s.name || riverId,
    owner: s.owner || "",
    repo: s.repo || `river-${riverId}`,
    counters: s.counters ?? { agents: 0, commits: 0, previews: 0, decisions: 0, autoMerged: 0 },
    intents: s.intents ?? [],
    feed: s.feed ?? [],
    lines: s.lines ?? [],
    overlaps: s.overlaps ?? [],
    decisions: s.decisions ?? s.counters?.decisions ?? 0,
    merged: s.merged ?? false,
  };
}

function placeholder(riverId: string): RiverState {
  return {
    riverId,
    name: riverId,
    owner: "",
    repo: `river-${riverId}`,
    head: null,
    counters: { agents: 0, commits: 0, previews: 0, decisions: 0, autoMerged: 0 },
    intents: [],
    feed: [],
    lines: [],
    overlaps: [],
    decisions: 0,
    merged: false,
  };
}
