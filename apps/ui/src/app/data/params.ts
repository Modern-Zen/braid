// URL flags for the app.
//   ?river=<id>   which River (default "riverlevels")
//   ?fixtures=1   render the design's fixture data, never touch the network
//   ?states=1     show the floating state bar (for recording); implies fixtures,
//                 because every state it can force is a fixture state

export const DEFAULT_RIVER = "riverlevels";

export interface AppParams {
  riverId: string;
  fixtures: boolean;
  states: boolean;
}

const on = (v: string | null) => v !== null && v !== "0" && v !== "false";

export function readParams(search: string = typeof location === "undefined" ? "" : location.search): AppParams {
  const q = new URLSearchParams(search);
  const states = on(q.get("states"));
  const river = q.get("river")?.trim();
  return {
    riverId: river && /^[a-z0-9][a-z0-9-]*$/.test(river) ? river : DEFAULT_RIVER,
    fixtures: states || on(q.get("fixtures")),
    states,
  };
}
