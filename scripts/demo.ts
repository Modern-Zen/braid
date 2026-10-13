// pnpm demo [--mode live] [--only dark-mode,rate-limit-api] [--watch]
//
// Opens the three demo Intents at once (3 Channels each, 9 agents) and, with --watch,
// prints the River's live feed until every Intent has merged or needs you.
//
// macOS / Linux:
//   export BRAID_URL="https://braid.<subdomain>.workers.dev" BRAID_ADMIN_TOKEN="<ADMIN_TOKEN>"
//   pnpm demo --watch
// Windows (PowerShell):
//   $env:BRAID_URL = "https://braid.<subdomain>.workers.dev"; $env:BRAID_ADMIN_TOKEN = "<ADMIN_TOKEN>"
//   pnpm demo --watch
import type { FeedEvent, RiverState } from "@braid/protocol";
import { api, BRAID_URL, ok, sleep } from "./lib.ts";
import { DEMO_INTENTS, RIVER } from "./demo-river.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const mode = arg("--mode") === "live" ? "live" : "scripted";
const only = arg("--only")?.split(",");
const watch = process.argv.includes("--watch");

console.log(`Opening the demo Intents on ${RIVER.id} (${mode}) → ${BRAID_URL}`);
const intents = DEMO_INTENTS.filter((i) => !only || only.includes(i.id!));
// One after another, so Channel numbers follow the Intents (ch-1..3, ch-4..6, ch-7..9).
// Each Intent's Channels still fork and start concurrently.
type Opened = { intent: { id: string }; channels: Array<{ id: string; agent: string; strategy: string; repo: string }> };
const results: PromiseSettledResult<Opened>[] = [];
for (const i of intents) {
  results.push(await api<Opened>("POST", `/api/rivers/${RIVER.id}/intents`, { ...i, mode }).then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason }),
  ));
}
for (const [k, r] of results.entries()) {
  if (r.status === "fulfilled") {
    ok(`${intents[k]!.title}: ${r.value.channels.map((c) => `${c.id} (${c.agent} · ${c.strategy})`).join(", ")}`);
  } else {
    console.log(`  ✗ ${intents[k]!.title}: ${(r.reason as Error).message}`);
  }
}

if (watch) {
  const seen = new Set<string>();
  for (;;) {
    const state = await api<RiverState>("GET", `/api/rivers/${RIVER.id}/state`);
    const fresh = [...state.feed].reverse().filter((e: FeedEvent) => !seen.has(e.id));
    for (const e of fresh) {
      seen.add(e.id);
      console.log(`  ${new Date(e.at).toISOString().slice(11, 19)}  ${e.type.padEnd(18)} ${e.detail}`);
    }
    const c = state.counters;
    if (state.merged) {
      console.log(`  ${c.agents} agents · ${c.commits} commits · ${c.previews} previews · ${state.decisions ? `${state.decisions} for you` : "nothing for you"}`);
      break;
    }
    await sleep(3000);
  }
}
