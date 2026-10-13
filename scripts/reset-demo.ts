// pnpm reset:demo
//
// Returns the demo River to its seed state: stops Channels, deletes every Channel and
// Confluence fork (keeps Artifacts usage low), clears Intents, and force-pushes the seed
// commit back to main.
//
// macOS / Linux:
//   export BRAID_URL="https://braid.<subdomain>.workers.dev" BRAID_ADMIN_TOKEN="<ADMIN_TOKEN>"
//   pnpm reset:demo
// Windows (PowerShell):
//   $env:BRAID_URL = "https://braid.<subdomain>.workers.dev"; $env:BRAID_ADMIN_TOKEN = "<ADMIN_TOKEN>"
//   pnpm reset:demo
import { api, BRAID_URL, git, ok } from "./lib.ts";
import { buildSeedRepo, RIVER } from "./demo-river.ts";

console.log(`Resetting the demo River → ${BRAID_URL}`);
const reset = await api<{ deleted: string[] }>("POST", `/api/admin/rivers/${RIVER.id}/reset`);
ok(`stopped Channels, deleted ${reset.deleted.length} forks${reset.deleted.length ? `: ${reset.deleted.join(", ")}` : ""}`);

const { remote, token } = await api<{ remote: string; token: string }>("POST", `/api/admin/rivers/${RIVER.id}/main-token`);
const seed = buildSeedRepo();
try {
  git(seed.dir, ["push", "-q", "--force", remote, "HEAD:main"], token);
  ok(`main reset to the seed commit ${seed.sha.slice(0, 7)}`);
} finally {
  seed.cleanup();
}
const { head } = await api<{ head: string | null }>("POST", `/api/admin/rivers/${RIVER.id}/refresh`);
ok(`main @ ${head}`);
