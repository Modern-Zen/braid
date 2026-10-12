// End-to-end smoke test against the real account, run from the Worker because the
// Artifacts binding and the sandbox live here. scripts/smoke.ts calls it over HTTP.
//
//   create braid-smoke → seed a first commit → fork it → issue a write token →
//   clone the fork in a sandbox → push a commit → read it back with readFile.
// The push also starts ReviewWorkflow (triggers.events), which writes the raw
// cf.artifacts.repo.pushed event to R2; scripts/smoke.ts waits for it.
import { withTrailers } from "@braid/protocol";
import {
  deleteRepoIfExists,
  ensureRepo,
  forkRepo,
  headCommit,
  mintToken,
  readText,
  remoteParts,
  waitReady,
} from "./artifacts.ts";
import { q, sandboxFor } from "./sandbox.ts";

const SOURCE = "braid-smoke";
const FORK = "braid-smoke-fork";

export interface SmokeStep {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
}

export interface SmokeReport {
  ok: boolean;
  runId: string;
  fork: string;
  sha?: string;
  path?: string;
  steps: SmokeStep[];
}

export async function runSmoke(env: Env): Promise<SmokeReport> {
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const steps: SmokeStep[] = [];
  const report: SmokeReport = { ok: false, runId, fork: FORK, steps };

  const step = async <T>(name: string, fn: () => Promise<T>, detail?: (v: T) => string): Promise<T> => {
    const t = Date.now();
    try {
      const v = await fn();
      steps.push({ name, ok: true, ms: Date.now() - t, detail: detail?.(v) });
      return v;
    } catch (err) {
      steps.push({ name, ok: false, ms: Date.now() - t, detail: errorText(err) });
      throw err;
    }
  };

  try {
    const source = await step("create or reuse braid-smoke", () => ensureRepo(env.ARTIFACTS, SOURCE, { description: "Headwaters smoke test" }), (r) =>
      r.created ? "created" : "exists",
    );
    const { host, path: sourcePath } = remoteParts(source.remote);
    const sandbox = sandboxFor(env, "smoke");

    const seeded = await headCommit(env.ARTIFACTS, SOURCE);
    if (!seeded) {
      const token = await mintToken(env.ARTIFACTS, SOURCE, "write", 600);
      await sandbox.grant({ artifactsHost: host, repos: { [sourcePath]: { token: token.plaintext, write: true } }, allowNpm: false });
      await step("seed first commit on braid-smoke", async () => {
        const r = await sandbox.sh(
          [
            "rm -rf /workspace/seed && mkdir -p /workspace/seed && cd /workspace/seed",
            "git init -q -b main",
            "printf '# braid-smoke\\n\\nCreated by the Headwaters smoke test.\\n' > README.md",
            "git add README.md && git commit -q -m 'Initial commit'",
            `git push -q ${q(source.remote)} HEAD:main`,
          ].join("\n"),
        );
        if (r.exitCode !== 0) throw new Error(`git push failed (${r.exitCode}): ${r.stderr.slice(-800)}`);
        return r;
      });
    } else {
      steps.push({ name: "seed first commit on braid-smoke", ok: true, ms: 0, detail: `already at ${seeded.hash.slice(0, 7)}` });
    }

    await step("delete previous fork", () => deleteRepoIfExists(env.ARTIFACTS, FORK), (d) => (d ? "deleted" : "none"));
    const fork = await step("fork braid-smoke → braid-smoke-fork", async () => {
      const f = await forkRepo(env.ARTIFACTS, SOURCE, FORK, `Smoke ${runId}`);
      await waitReady(env.ARTIFACTS, FORK);
      return f;
    }, (f) => f.name);

    const token = await step("issue write token (10 min)", () => mintToken(env.ARTIFACTS, FORK, "write", 600), (t) =>
      `scope=${t.scope} expires=${t.expiresAt}`,
    );

    const forkPath = remoteParts(fork.remote).path;
    await sandbox.grant({ artifactsHost: host, repos: { [forkPath]: { token: token.plaintext, write: true } }, allowNpm: false });

    const path = `smoke/${runId}.txt`;
    const content = `Headwaters smoke ${runId}\n`;
    const message = withTrailers(`Smoke test ${runId}`, {
      intent: "smoke",
      channel: "ch-0",
      agent: "headwaters-smoke",
      model: "none",
    });
    const pushed = await step("clone in sandbox, commit, push", async () => {
      const r = await sandbox.sh(
        [
          "rm -rf /workspace/fork",
          `git clone -q ${q(fork.remote)} /workspace/fork`,
          "cd /workspace/fork",
          `mkdir -p smoke && printf %s ${q(content)} > ${q(path)}`,
          `git add -A && git commit -q -F - <<'MSG'\n${message}MSG`,
          "git push -q origin HEAD:main",
          "git rev-parse HEAD",
        ].join("\n"),
      );
      if (r.exitCode !== 0) throw new Error(`exit ${r.exitCode}: ${r.stderr.slice(-800)}`);
      return r.stdout.trim().split("\n").pop()!;
    }, (sha) => sha);
    report.sha = pushed;
    report.path = path;

    await step("read it back with readFile", async () => {
      const text = await readText(env.ARTIFACTS, FORK, "main", path);
      if (text !== content) throw new Error(`readFile returned ${JSON.stringify(text)}`);
      const head = await headCommit(env.ARTIFACTS, FORK);
      if (head?.hash !== pushed) throw new Error(`log() head is ${head?.hash}, expected ${pushed}`);
      return head;
    }, (h) => `log head ${h.hash.slice(0, 7)} · ${h.message.split("\n")[0]}`);

    await sandbox.destroy();
    report.ok = true;
  } catch {
    report.ok = false;
  }
  return report;
}

/**
 * Operator-only, for `pnpm smoke --local-git`: everything except the push, which the
 * operator's own git client does with the returned short-lived tokens. Proves Artifacts
 * end to end before the sandbox image is available.
 */
export async function prepareSmoke(env: Env): Promise<{
  runId: string;
  source: { name: string; remote: string; empty: boolean; token?: string };
  fork: { name: string; remote: string; token: string; expiresAt: string };
}> {
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const source = await ensureRepo(env.ARTIFACTS, SOURCE, { description: "Headwaters smoke test" });
  const empty = !(await headCommit(env.ARTIFACTS, SOURCE));
  if (empty) {
    // An empty repo can't be forked meaningfully; hand back a token to seed it first.
    const token = await mintToken(env.ARTIFACTS, SOURCE, "write", 600);
    return {
      runId,
      source: { name: SOURCE, remote: source.remote, empty, token: token.plaintext },
      fork: { name: FORK, remote: "", token: "", expiresAt: "" },
    };
  }
  await deleteRepoIfExists(env.ARTIFACTS, FORK);
  const fork = await forkRepo(env.ARTIFACTS, SOURCE, FORK, `Smoke ${runId}`);
  await waitReady(env.ARTIFACTS, FORK);
  const token = await mintToken(env.ARTIFACTS, FORK, "write", 600);
  return {
    runId,
    source: { name: SOURCE, remote: source.remote, empty },
    fork: { name: FORK, remote: fork.remote, token: token.plaintext, expiresAt: token.expiresAt },
  };
}

export async function verifySmoke(
  env: Env,
  args: { path: string; content: string; sha: string },
): Promise<{ ok: boolean; readFile: string | null; head: string | null; message: string | null }> {
  const text = await readText(env.ARTIFACTS, FORK, "main", args.path);
  const head = await headCommit(env.ARTIFACTS, FORK);
  return {
    ok: text === args.content && head?.hash === args.sha,
    readFile: text,
    head: head?.hash ?? null,
    message: head?.message ?? null,
  };
}

function errorText(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    return `${err.name}${code ? ` ${code}` : ""}: ${err.message}`;
  }
  return String(err);
}
