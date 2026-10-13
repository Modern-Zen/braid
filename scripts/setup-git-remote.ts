// pnpm git:setup [river]   (default river: braid)
//
// Adds the `headwaters` remote (the River's main repo in Artifacts) and wires the credential
// helper, so `git push headwaters main` just works. Run once per clone.
//
// PowerShell:
//   $env:BRAID_URL = "https://braid.drp.icu"; $env:BRAID_ADMIN_TOKEN = "<ADMIN_TOKEN>"
//   pnpm git:setup
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { api, BRAID_URL, ok, repoRoot } from "./lib.ts";

const river = process.argv[2] ?? "braid";
const git = (...args: string[]) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

const { remote } = await api<{ remote: string }>("POST", `/api/admin/rivers/${river}/main-token`);
const host = new URL(remote).origin;
const tsx = join(repoRoot, "node_modules", ".bin", "tsx").replace(/\\/g, "/");
const helper = join(repoRoot, "scripts", "git-credential-headwaters.ts").replace(/\\/g, "/");

try {
  git("remote", "set-url", "headwaters", remote);
} catch {
  git("remote", "add", "headwaters", remote);
}
git("config", "headwaters.url", BRAID_URL);
git("config", `credential.${host}.useHttpPath`, "true");
// An empty value resets the helper list for this host, so a system helper (e.g. Git
// Credential Manager) doesn't try to prompt first.
try {
  git("config", "--unset-all", `credential.${host}.helper`);
} catch {
  // not set yet
}
git("config", "--add", `credential.${host}.helper`, "");
git("config", "--add", `credential.${host}.helper`, `!"${tsx}" "${helper}"`);
ok(`remote headwaters → ${remote}`);
ok(`credential helper for ${host} (10-minute tokens via ${BRAID_URL})`);
console.log("Push with: git push headwaters main");
