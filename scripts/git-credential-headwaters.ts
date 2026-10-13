// Git credential helper for Headwaters (Artifacts) remotes.
//
// Git asks it for credentials on each fetch/push; it mints a 10-minute write token for the
// River's main repo through the operator API, so no long-lived secret is stored in .git/config.
// Set it up once with `pnpm git:setup` (scripts/setup-git-remote.ts).
//
// Protocol: https://git-scm.com/docs/gitcredentials (we answer `get`, ignore `store`/`erase`).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const op = process.argv[2];
if (op !== "get") process.exit(0);

const input = readFileSync(0, "utf8");
const fields = Object.fromEntries(
  input
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const river = /river-([a-z0-9-]+?)(?:--[^/]*)?\.git$/.exec(fields.path ?? "")?.[1];
if (!river) process.exit(0); // not a Headwaters main repo; let git try other helpers

const gitConfig = (key: string) => {
  try {
    return execFileSync("git", ["config", "--get", key], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
process.env.BRAID_URL ??= gitConfig("headwaters.url") || undefined;
const { api } = await import("./lib.ts");
const { token } = await api<{ token: string }>("POST", `/api/admin/rivers/${river}/main-token`);
process.stdout.write(`username=x\npassword=${token.split("?expires=")[0]}\n`);
