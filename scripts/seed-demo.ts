// pnpm seed:demo [--force]
//
// Creates the demo River `riverlevels` (Artifacts repo river-riverlevels) and pushes
// apps/demo-riverlevels as its main. --force re-pushes the seed commit over main.
//
// PowerShell:
//   $env:BRAID_URL = "https://braid.<subdomain>.workers.dev"; $env:BRAID_ADMIN_TOKEN = "<ADMIN_TOKEN>"
//   pnpm seed:demo
import { api, BRAID_URL, git, ok } from "./lib.ts";
import { buildSeedRepo, RIVER } from "./demo-river.ts";

const force = process.argv.includes("--force");

console.log(`Seeding the demo River → ${BRAID_URL}`);
const created = await api<{ river: { mainRepo: string; remote: string }; created: boolean; seedToken?: string }>(
  "POST",
  "/api/admin/rivers",
  RIVER,
);
ok(`River ${RIVER.id} (${created.river.mainRepo}) ${created.created ? "created" : "exists"}`);

let token = created.seedToken;
if (!token && force) token = (await api<{ token: string }>("POST", `/api/admin/rivers/${RIVER.id}/main-token`)).token;

if (token) {
  const seed = buildSeedRepo();
  try {
    git(seed.dir, ["push", "-q", ...(force ? ["--force"] : []), created.river.remote, "HEAD:main"], token);
    ok(`pushed main @ ${seed.sha.slice(0, 7)} from apps/demo-riverlevels`);
  } finally {
    seed.cleanup();
  }
} else {
  ok("main already has commits (use --force to re-seed)");
}

const { head } = await api<{ head: string | null }>("POST", `/api/admin/rivers/${RIVER.id}/refresh`);
ok(`main @ ${head}`);
console.log("Seeded. Next: pnpm demo");
