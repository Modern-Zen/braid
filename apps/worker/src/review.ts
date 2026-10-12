// Review: what ReviewWorkflow does for one push to a Channel repo.
// Tests, diffstat and the diff run in a sandbox with plain git; risk comes from Workers AI
// with a deterministic fallback, so a review always completes.
import type { DiffFile, DiffStat, TestResult } from "@braid/protocol";
import { mintToken, remoteParts } from "./artifacts.ts";
import { q, sandboxFor, type CommandResult } from "./sandbox.ts";

export interface ReviewInput {
  repo: string;
  remote: string;
  sha: string;
  mainRepo: string;
  mainRemote: string;
  intentTitle: string;
}

export interface ReviewRun {
  tests: TestResult;
  testsRan: boolean;
  diff: DiffStat;
  paths: string[];
  files: DiffFile[];
  /** First 20 kB of the unified diff, for the risk model. */
  rawDiff: string;
  subject: string;
  message: string;
  logKey: string | null;
  /** Live preview of this push (Workers preview alias), when previews are configured. */
  previewUrl: string | null;
}

export interface ReviewOptions {
  /** Upload a preview version with this alias (e.g. "ch-3") when tests pass. */
  previewAlias?: string;
}

type PreviewEnv = Env & { CF_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string };

export function previewsEnabled(env: Env): boolean {
  const e = env as PreviewEnv;
  return !!e.CF_ACCOUNT_ID && !!e.CLOUDFLARE_API_TOKEN;
}

const RISK_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Clone at `sha`, diff against main's merge-base, install, run the tests. One sandbox per repo. */
export async function runReview(env: Env, input: ReviewInput, opts: ReviewOptions = {}): Promise<ReviewRun> {
  const sandbox = sandboxFor(env, `review:${input.repo}`);
  const [own, main] = await Promise.all([
    mintToken(env.ARTIFACTS, input.repo, "read", 1800),
    mintToken(env.ARTIFACTS, input.mainRepo, "read", 1800),
  ]);
  const a = remoteParts(input.remote);
  const m = remoteParts(input.mainRemote);
  await sandbox.grant(
    {
      artifactsHost: a.host,
      repos: { [a.path]: { token: own.plaintext, write: false }, [m.path]: { token: main.plaintext, write: false } },
      allowNpm: true,
      ...(opts.previewAlias && previewsEnabled(env) ? { cfApi: { accountId: (env as PreviewEnv).CF_ACCOUNT_ID! } } : {}),
    },
    "standard-2",
  );

  const dir = `/workspace/r-${input.sha.slice(0, 12)}`;
  const prep = await sandbox.sh(
    [
      `rm -rf ${dir} && git clone -q ${q(input.remote)} ${dir} && cd ${dir}`,
      `git checkout -q --force ${q(input.sha)}`,
      `git fetch -q ${q(input.mainRemote)} main:refs/remotes/main/main`,
      "base=$(git merge-base HEAD refs/remotes/main/main || git rev-list --max-parents=0 HEAD | tail -1)",
      'git diff --numstat "$base" HEAD > ../numstat-$$.txt && mv ../numstat-$$.txt .braid-numstat',
      'git diff --no-color --unified=3 "$base" HEAD > .braid-diff',
      "git log -1 --format=%B HEAD > .braid-message",
    ].join("\n"),
    { timeoutSec: 180 },
  );
  if (prep.exitCode !== 0) throw new Error(`review checkout failed (${prep.exitCode}): ${prep.stderr.slice(-600)}`);

  const numstat = (await sandbox.readFile(`${dir}/.braid-numstat`)) ?? "";
  const rawDiff = (await sandbox.readFile(`${dir}/.braid-diff`)) ?? "";
  const message = ((await sandbox.readFile(`${dir}/.braid-message`)) ?? "").trim();
  const { diff, paths } = parseNumstat(numstat);

  const hasPackage = (await sandbox.sh(`test -f ${dir}/package.json`)).exitCode === 0;
  let test: CommandResult | null = null;
  if (hasPackage) {
    test = await sandbox.sh(
      [
        `cd ${dir}`,
        "pnpm install --frozen-lockfile --prefer-offline --reporter=silent || pnpm install --prefer-offline --reporter=silent",
        "pnpm test 2>&1",
      ].join("\n"),
      { timeoutSec: 480, env: { CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" } },
    );
  }
  const log = test ? `${test.stdout}\n${test.stderr}` : "";
  const tests = test ? parseTestOutput(log, test.exitCode) : { passed: 0, total: 0 };

  // Green and previews configured: upload this push as a preview version of the River's Worker.
  let previewUrl: string | null = null;
  if (opts.previewAlias && test && previewsEnabled(env) && tests.total > 0 && tests.passed === tests.total) {
    const up = await sandbox.sh(
      [
        `cd ${dir}`,
        `if node -e "process.exit(require('./package.json').scripts?.build ? 0 : 1)"; then pnpm build >/dev/null; fi`,
        `wrangler versions upload --preview-alias ${q(opts.previewAlias)} --message ${q(input.sha.slice(0, 7))} 2>&1`,
      ].join("\n"),
      {
        timeoutSec: 300,
        env: {
          // Placeholder: the Outbound gateway adds the real token for Workers API calls.
          CLOUDFLARE_API_TOKEN: "provided-by-worker",
          CLOUDFLARE_ACCOUNT_ID: (env as PreviewEnv).CF_ACCOUNT_ID!,
          WRANGLER_SEND_METRICS: "false",
          CI: "1",
        },
      },
    );
    previewUrl = pickPreviewUrl(up.stdout, opts.previewAlias);
    if (!previewUrl) console.error("preview upload gave no URL", { repo: input.repo, out: up.stdout.slice(-800) });
  }
  await sandbox.sh(`rm -rf ${dir}`).catch(() => undefined);
  const logKey = test ? `logs/${input.repo}/${input.sha}.txt` : null;
  if (logKey) await env.BLOBS.put(logKey, log, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });

  return {
    tests,
    testsRan: !!test,
    diff,
    paths,
    files: parseUnifiedDiff(rawDiff),
    rawDiff: rawDiff.slice(0, 20_000),
    subject: message.split("\n")[0] ?? "",
    message,
    logKey,
    previewUrl,
  };
}

/** The alias URL from `wrangler versions upload` output, else any workers.dev URL. */
export function pickPreviewUrl(out: string, alias: string): string | null {
  const urls = [...out.matchAll(/https:\/\/[a-z0-9.-]+\.workers\.dev\S*/gi)].map((m) => m[0].replace(/[).,]+$/, ""));
  return urls.find((u) => new URL(u).hostname.startsWith(`${alias}-`)) ?? urls[0] ?? null;
}

export function parseNumstat(text: string): { diff: DiffStat; paths: string[] } {
  let added = 0;
  let removed = 0;
  const paths: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim());
    if (!m) continue;
    added += m[1] === "-" ? 0 : Number(m[1]);
    removed += m[2] === "-" ? 0 : Number(m[2]);
    paths.push(m[3]!);
  }
  return { diff: { added, removed, files: paths.length }, paths };
}

/** Vitest / Jest / node:test summaries → passed/total. Falls back to the exit code. */
export function parseTestOutput(log: string, exitCode: number): TestResult {
  const clean = log.replace(/\x1b\[[0-9;]*m/g, "");
  const line = [...clean.matchAll(/^\s*Tests?:?\s+(.+)$/gm)].map((m) => m[1]!).pop();
  if (line) {
    const passed = Number(/(\d+) passed/.exec(line)?.[1] ?? 0);
    const failed = Number(/(\d+) failed/.exec(line)?.[1] ?? 0);
    const total = Number(/\((\d+)\)/.exec(line)?.[1] ?? /(\d+) total/.exec(line)?.[1] ?? passed + failed);
    const failures = [...clean.matchAll(/^\s*(?:×|✗|FAIL)\s+(.+)$/gm)].map((m) => m[1]!.trim()).slice(0, 10);
    return { passed, total, failures };
  }
  return exitCode === 0 ? { passed: 1, total: 1 } : { passed: 0, total: 1, failures: ["test command failed"] };
}

export function parseUnifiedDiff(text: string, maxLinesPerFile = 400): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let oldN = 0;
  let newN = 0;
  for (const line of text.split("\n")) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (header) {
      cur = { path: header[2]!, added: 0, removed: 0, lines: [] };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldN = Number(hunk[1]);
      newN = Number(hunk[2]);
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file")) continue;
    const sign = line[0];
    if (sign === "+") {
      cur.added++;
      if (cur.lines.length < maxLinesPerFile) cur.lines.push({ n: String(newN), sign: "+", text: line.slice(1) });
      newN++;
    } else if (sign === "-") {
      cur.removed++;
      if (cur.lines.length < maxLinesPerFile) cur.lines.push({ n: String(oldN), sign: "-", text: line.slice(1) });
      oldN++;
    } else if (sign === " ") {
      if (cur.lines.length < maxLinesPerFile) cur.lines.push({ n: String(newN), sign: " ", text: line.slice(1) });
      oldN++;
      newN++;
    }
  }
  return files;
}

// ── Risk ──────────────────────────────────────────────────────────────────────

export interface RiskScore {
  risk: number;
  reasons: string[];
  source: "workers-ai" | "heuristic";
}

/** Deterministic floor: public surface, config, dependencies, size, failing tests. */
export function heuristicRisk(paths: string[], diff: DiffStat, tests: TestResult): RiskScore {
  const reasons: string[] = [];
  let risk = 0.08;
  if (paths.some((p) => /(^|\/)api\//.test(p) || /routes?|middleware/.test(p))) {
    risk += 0.24;
    reasons.push("Touches the public API surface.");
  }
  if (paths.some((p) => /wrangler\.(jsonc?|toml)$/.test(p))) {
    risk += 0.18;
    reasons.push("Changes Worker configuration or bindings.");
  }
  if (paths.some((p) => /(^|\/)package\.json$/.test(p))) {
    risk += 0.1;
    reasons.push("Changes dependencies.");
  }
  const size = diff.added + diff.removed;
  risk += Math.min(0.2, size / 800);
  if (size > 150) reasons.push(`Large diff (${size} lines across ${diff.files} files).`);
  if (tests.total > 0 && tests.passed < tests.total) {
    risk += 0.25;
    reasons.push(`${tests.total - tests.passed} failing test${tests.total - tests.passed === 1 ? "" : "s"}.`);
  }
  if (reasons.length === 0) reasons.push("Small, contained change with passing tests.");
  return { risk: round2(Math.min(0.95, risk)), reasons, source: "heuristic" };
}

export async function scoreRisk(env: Env, input: { intentTitle: string; paths: string[]; diff: DiffStat; tests: TestResult; rawDiff: string }): Promise<RiskScore> {
  const floor = heuristicRisk(input.paths, input.diff, input.tests);
  try {
    const prompt = `You review code changes for a Git platform where AI agents propose changes. Rate the risk of merging this change to main without a human looking at it, from 0 (trivial, safe) to 1 (dangerous). Consider public API surface, security, data loss, config/bindings, dependency changes, size, and test results. Reply with JSON only: {"risk": number, "reasons": [one to three short sentences]}.

Intent: ${input.intentTitle}
Tests: ${input.tests.passed}/${input.tests.total} passed
Diffstat: +${input.diff.added} -${input.diff.removed} in ${input.diff.files} files
Files: ${input.paths.join(", ")}

Diff (truncated):
${input.rawDiff.slice(0, 7000)}`;
    const out = (await env.AI.run(RISK_MODEL as keyof AiModels, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.1,
    } as never)) as { response?: string | { risk?: number; reasons?: string[] } };
    const parsed = typeof out.response === "string" ? extractJson(out.response) : out.response;
    const risk = Number(parsed?.risk);
    if (!Number.isFinite(risk)) return floor;
    // Never below the deterministic floor: the model can raise risk, not hide it.
    const final = round2(Math.max(floor.risk, Math.min(1, Math.max(0, risk))));
    const reasons = Array.isArray(parsed?.reasons) && parsed.reasons.length ? parsed.reasons.slice(0, 3).map(String) : floor.reasons;
    return { risk: final, reasons, source: "workers-ai" };
  } catch (err) {
    console.error("risk model failed", String(err));
    return floor;
  }
}

function extractJson(text: string): { risk?: number; reasons?: string[] } | undefined {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return undefined;
  try {
    return JSON.parse(m[0]) as { risk?: number; reasons?: string[] };
  } catch {
    return undefined;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
