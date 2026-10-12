// pnpm smoke [--local-git] [--no-events]
//
// Proves the platform end to end against the real account:
//   create braid-smoke → fork → issue a token → clone → push a commit → readFile it back,
//   then waits for the raw cf.artifacts.repo.pushed event to land in R2.
//
// Default: the Worker does the clone and push inside a Sandbox container.
// --local-git: the Worker creates/forks/issues tokens; your own git does the push.
//   Useful before the sandbox image is deployed (e.g. against `wrangler dev`).
//
// PowerShell:
//   $env:BRAID_URL = "https://braid.<subdomain>.workers.dev"
//   $env:BRAID_ADMIN_TOKEN = "<ADMIN_TOKEN>"
//   pnpm smoke
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withTrailers } from "@braid/protocol";
import { ADMIN_TOKEN, api, BRAID_URL, fail, git, ok, sleep } from "./lib.ts";

const localGit = process.argv.includes("--local-git");
const waitEvents = !process.argv.includes("--no-events");

interface SmokeReport {
  ok: boolean;
  runId: string;
  fork: string;
  sha?: string;
  steps: Array<{ name: string; ok: boolean; ms: number; detail?: string }>;
}

interface Prepared {
  runId: string;
  source: { name: string; remote: string; empty: boolean; token?: string };
  fork: { name: string; remote: string; token: string; expiresAt: string };
}

async function viaSandbox(): Promise<{ sha: string; fork: string } | null> {
  const report = await api<SmokeReport>("POST", "/api/admin/smoke");
  for (const s of report.steps) (s.ok ? ok : fail)(`${s.name} (${s.ms} ms)${s.detail ? ` · ${s.detail}` : ""}`);
  return report.ok && report.sha ? { sha: report.sha, fork: report.fork } : null;
}

async function viaLocalGit(): Promise<{ sha: string; fork: string } | null> {
  const work = mkdtempSync(join(tmpdir(), "braid-smoke-"));
  try {
    let prep = await api<Prepared>("POST", "/api/admin/smoke/prepare");
    ok(`braid-smoke ready (${prep.source.empty ? "empty" : "has commits"})`);
    if (prep.source.empty) {
      const seed = join(work, "seed");
      mkdirSync(seed);
      git(seed, ["init", "-q", "-b", "main"]);
      writeFileSync(join(seed, "README.md"), "# braid-smoke\n\nCreated by the Headwaters smoke test.\n");
      git(seed, ["add", "README.md"]);
      git(seed, ["-c", "user.name=Headwaters", "-c", "user.email=agents@braid.drp.icu", "commit", "-q", "-m", "Initial commit"]);
      git(seed, ["push", "-q", prep.source.remote, "HEAD:main"], prep.source.token);
      ok("seeded braid-smoke with a first commit");
      prep = await api<Prepared>("POST", "/api/admin/smoke/prepare");
    }
    ok(`forked → ${prep.fork.name}`);
    ok(`write token issued (expires ${prep.fork.expiresAt})`);

    const dir = join(work, "fork");
    git(work, ["clone", "-q", prep.fork.remote, dir], prep.fork.token);
    ok("cloned the fork with local git");
    const path = `smoke/${prep.runId}.txt`;
    const content = `Headwaters smoke ${prep.runId}\n`;
    mkdirSync(join(dir, "smoke"), { recursive: true });
    writeFileSync(join(dir, path), content);
    const message = withTrailers(`Smoke test ${prep.runId}`, { intent: "smoke", channel: "ch-0", agent: "headwaters-smoke", model: "none" });
    git(dir, ["add", "-A"]);
    git(dir, ["-c", "user.name=Headwaters", "-c", "user.email=agents@braid.drp.icu", "commit", "-q", "-m", message]);
    git(dir, ["push", "-q", "origin", "HEAD:main"], prep.fork.token);
    const sha = git(dir, ["rev-parse", "HEAD"]);
    ok(`pushed ${sha.slice(0, 7)}`);

    const v = await api<{ ok: boolean; readFile: string | null; head: string | null }>("POST", "/api/admin/smoke/verify", { path, content, sha });
    (v.ok ? ok : fail)(`readFile + log read it back (${v.ok ? "match" : `got ${JSON.stringify(v.readFile)} @ ${v.head}`})`);
    return v.ok ? { sha, fork: prep.fork.name } : null;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function waitForPushEvent(fork: string, sha: string): Promise<boolean> {
  const deadline = Date.now() + 150_000;
  process.stdout.write("  … waiting for cf.artifacts.repo.pushed in R2");
  while (Date.now() < deadline) {
    const day = new Date().toISOString().slice(0, 10);
    const list = await api<{ objects: Array<{ key: string }> }>("GET", `/api/admin/events?day=${day}&contains=pushed-${fork}`);
    for (const o of list.objects) {
      const res = await fetch(`${BRAID_URL}/api/admin/events/object?key=${encodeURIComponent(o.key)}`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      if (!(await res.text()).includes(sha)) continue;
      process.stdout.write("\n");
      ok(`raw push event in R2: ${o.key}`);
      return true;
    }
    process.stdout.write(".");
    await sleep(5000);
  }
  process.stdout.write("\n");
  fail("no push event in R2 after 150 s (events only fire on the deployed Worker)");
  return false;
}

console.log(`Headwaters smoke → ${BRAID_URL} (${localGit ? "local git" : "sandbox"})`);
const result = localGit ? await viaLocalGit() : await viaSandbox();
if (!result) {
  console.log("SMOKE FAILED");
  process.exit(1);
}
const events = waitEvents ? await waitForPushEvent(result.fork, result.sha) : true;
console.log(events ? "SMOKE PASSED" : "SMOKE PASSED (without the R2 event check)");
process.exit(events ? 0 : 2);
