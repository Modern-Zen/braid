// Live River state over the River's WebSocket (/ws/river/<id>), via the Agents SDK
// state sync. The RiverAgent is read-only to clients; every change happens server-side
// and arrives here as a full RiverState.
//
// If the socket fails before the first state arrives, it polls GET /api/rivers/:id/state
// instead. Fixtures when ?fixtures=1, or when both fail (e.g. `vite dev` without
// `wrangler dev`). The socket keeps retrying in the background and the screen switches
// to live data the moment state arrives.
import { useAgent } from "agents/react";
import { useEffect, useMemo, useState } from "react";
import type { RiverState } from "@braid/protocol";
import { getRiverState } from "./api.ts";
import { riverFixture, type RiverFixture } from "./fixtures.ts";
import { readParams } from "./params.ts";

/** How long to wait for the first socket state before trying REST. */
const FIRST_STATE_TIMEOUT_MS = 4000;
/** REST poll interval while the socket is down. */
const REST_POLL_MS = 10_000;

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
  const [rest, setRest] = useState<RiverState | null>(null);
  const [restFailed, setRestFailed] = useState(false);

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
    setRest(null);
    setRestFailed(false);
    if (fixtures) return;
    const t = setTimeout(() => setFailed(true), FIRST_STATE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [riverId, fixtures]);

  // While the socket is down, poll GET /api/rivers/:id/state; fixtures only if that fails too.
  const hasLive = live !== null;
  useEffect(() => {
    if (fixtures || hasLive || !failed) return;
    let alive = true;
    const pull = () =>
      getRiverState(riverId).then(
        (s) => {
          if (!alive) return;
          setRest(s);
          setRestFailed(false);
        },
        () => alive && setRestFailed(true),
      );
    void pull();
    const t = setInterval(pull, REST_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [fixtures, hasLive, failed, riverId]);

  return useMemo((): RiverConnection => {
    if (fixtures) return { state: riverFixture(fixtureState, riverId), source: "fixtures" };
    if (live) return { state: normalize(live, riverId), source: "live" };
    if (rest) return { state: normalize(rest, riverId), source: "live" };
    if (failed && restFailed) return { state: riverFixture(fixtureState, riverId), source: "fallback" };
    return { state: placeholder(riverId), source: "connecting" };
  }, [fixtures, fixtureState, live, rest, failed, restFailed, riverId]);
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
