// The app: left rail, top bar, and screens A–D, ported from Headwaters App.dc.html.
// Data: live RiverState over the River socket, REST for Scout / Eddy / Logbook, and the
// design's fixtures with ?fixtures=1 (or when the Worker can't be reached).
// ?states=1 adds the prototype's state bar for recording.
import { useState, type ReactElement } from "react";
import type { RiverState } from "@braid/protocol";
import { LeftRail, type RailDest } from "../components/LeftRail.tsx";
import { TopBar } from "../components/TopBar.tsx";
import { useTheme } from "../theme.ts";
import { getRivers, useResource } from "./data/api.ts";
import {
  EDDY_FIXTURES,
  FIXTURE_NOW,
  RIVER_FIXTURES,
  RIVERS_FIXTURE,
  SCOUT_FIXTURES,
  riverFixture,
  type EddyFixture,
  type RiverFixture,
  type ScoutFixture,
} from "./data/fixtures.ts";
import { readParams } from "./data/params.ts";
import { useRiver } from "./data/useRiver.ts";
import { useNow, useReducedMotion, useTitle } from "./hooks.ts";
import { href, navigate, useRoute, type Route } from "./router.tsx";
import { EddyScreen } from "./screens/EddyScreen.tsx";
import { LogbookScreen } from "./screens/LogbookScreen.tsx";
import { RiverScreen } from "./screens/RiverScreen.tsx";
import { ScoutScreen } from "./screens/ScoutScreen.tsx";
import { StateBar } from "./StateBar.tsx";

interface FixtureStates {
  river: RiverFixture;
  scout: ScoutFixture;
  eddy: EddyFixture;
}

const RAIL: Record<RailDest, Route> = {
  rivers: { screen: "river" },
  intents: { screen: "river" },
  scout: { screen: "scout" },
  eddy: { screen: "eddy" },
  logbook: { screen: "logbook" },
};

const LABEL = { river: "River", scout: "Scout", eddy: "Eddy", logbook: "Logbook" } as const;

export function AppShell(): ReactElement {
  const route = useRoute();
  const params = readParams();
  const [, toggleTheme] = useTheme();
  const reduced = useReducedMotion();
  const [fx, setFx] = useState<FixtureStates>({ river: "running", scout: "verdict", eddy: "one" });
  const { state: river, source } = useRiver(params.riverId, { fixtures: params.fixtures, fixtureState: fx.river });
  const rivers = useResource("rivers", { fixtures: params.fixtures, load: getRivers, fixture: () => RIVERS_FIXTURE });
  const now = useNow(params.fixtures || source === "fallback" ? FIXTURE_NOW : undefined);
  useTitle(`${LABEL[route.screen]} · ${river.name} · Headwaters`);

  // The top bar and rail. With the state bar, follow the prototype: other screens show the
  // running River, and the decision count follows the Eddy state.
  const bar: RiverState = params.states && route.screen !== "river" ? riverFixture("running", params.riverId) : river;
  const decisions = params.states
    ? fx.eddy === "zero" || (route.screen === "river" && (fx.river === "merged" || fx.river === "empty"))
      ? 0
      : fx.eddy === "three"
        ? 3
        : 1
    : river.decisions;
  const counts = { agents: bar.counters.agents, commits: bar.counters.commits, previews: bar.counters.previews, decisions };
  const active: RailDest = route.screen === "river" ? "rivers" : route.screen;

  const switchRiver = (id: string) => {
    const q = new URLSearchParams(location.search);
    q.set("river", id);
    navigate(`/app/?${q.toString()}`);
  };

  let screen: ReactElement;
  let bar$: ReactElement | null = null;
  switch (route.screen) {
    case "river":
      screen = <RiverScreen river={river} source={source} now={now} reduced={reduced} fixtures={params.fixtures} />;
      bar$ = <StateBar options={RIVER_FIXTURES} value={fx.river} onChange={(river) => setFx({ ...fx, river })} />;
      break;
    case "scout":
      screen = <ScoutScreen river={river} {...(route.intent ? { intentId: route.intent } : {})} fixtures={params.fixtures} fixtureState={fx.scout} />;
      bar$ = <StateBar options={SCOUT_FIXTURES} value={fx.scout} onChange={(scout) => setFx({ ...fx, scout })} />;
      break;
    case "eddy":
      screen = <EddyScreen river={river} fixtures={params.fixtures} fixtureState={fx.eddy} counts={{ agents: counts.agents, commits: counts.commits, decisions }} />;
      bar$ = <StateBar options={EDDY_FIXTURES} value={fx.eddy} onChange={(eddy) => setFx({ ...fx, eddy })} />;
      break;
    case "logbook":
      screen = <LogbookScreen river={river} {...(route.sha ? { sha: route.sha } : {})} {...(route.repo ? { repo: route.repo } : {})} fixtures={params.fixtures} now={now} />;
      break;
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "var(--hw-rail-width) minmax(0,1fr)",
        gridTemplateRows: "var(--hw-topbar-height) minmax(0,1fr)",
        overflow: "hidden",
        background: "var(--hw-color-paper)",
        color: "var(--hw-color-ink)",
        fontFamily: "var(--hw-font-ui)",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <LeftRail
        active={active}
        decisions={decisions}
        river={{ name: river.name, owner: river.owner }}
        href={(d) => href(RAIL[d])}
        onNavigate={(to) => navigate(to)}
        rivers={(rivers.data ?? []).map((r) => ({ id: r.id, name: r.name }))}
        onRiverChange={switchRiver}
      />
      <TopBar name={river.name} head={bar.head} counts={counts} onToggleTheme={toggleTheme} />
      <main style={{ position: "relative", overflow: "auto", minHeight: 0 }}>{screen}</main>
      {params.states ? bar$ : null}
    </div>
  );
}
