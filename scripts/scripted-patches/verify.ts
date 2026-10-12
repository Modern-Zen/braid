// Verify the recorded patch series against a fresh copy of apps/demo-riverlevels.
//
//   npx tsx scripts/scripted-patches/verify.ts                 # every series applies with git am
//   npx tsx scripts/scripted-patches/verify.ts --conflicts     # + dark-mode x refactor-gauge merge matrix
//   npx tsx scripts/scripted-patches/verify.ts --resolutions   # + each _resolutions pair, both merge orders
//   npx tsx scripts/scripted-patches/verify.ts --test          # + pnpm test and tsc after each, compared to result.json / meta.tests
//   npx tsx scripts/scripted-patches/verify.ts --all --keep    # everything; keep the scratch repo and print its path
//
// Run from the repo root in PowerShell. Needs git and, for --test, pnpm (it runs
// `pnpm install --frozen-lockfile` once in the scratch copy). Exits 1 on any failure.

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const APP = "apps/demo-riverlevels";

/** The seed commit: same files + same identity + same dates = same sha everywhere. */
export const BASE_COMMIT = {
  message: "Seed riverlevels",
  name: "Headwaters",
  email: "agents@braid.drp.icu",
  date: "2026-10-12T12:00:00Z",
};

const args = new Set(process.argv.slice(2));
const all = args.has("--all");
const opts = {
  conflicts: all || args.has("--conflicts"),
  resolutions: all || args.has("--resolutions"),
  test: all || args.has("--test"),
  keep: args.has("--keep"),
};

interface SeriesMeta {
  intent: string;
  strategy: string;
  base: string;
  commits: Array<{ file: string; subject: string; delaySec: [number, number] }>;
}
interface Series {
  id: string; // "dark-mode.minimal-diff"
  dir: string;
  meta: SeriesMeta;
  patches: string[];
}
interface ResolutionMeta {
  pair: [string, string];
  conflicted: string[];
  tests?: { passed: number; total: number };
}

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`  FAIL ${msg}`);
};
const ok = (msg: string) => console.log(`  ok   ${msg}`);

function run(cmd: string, argv: string[], cwd: string, extra: SpawnSyncOptions = {}) {
  const res = spawnSync(cmd, argv, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32" && cmd === "pnpm",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    ...extra,
  });
  return { status: res.status ?? 1, stdout: String(res.stdout ?? ""), stderr: String(res.stderr ?? "") };
}

function git(cwd: string, ...argv: string[]) {
  return run("git", ["-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", ...argv], cwd);
}

function mustGit(cwd: string, ...argv: string[]): string {
  const res = git(cwd, ...argv);
  if (res.status !== 0) throw new Error(`git ${argv.join(" ")} failed:\n${res.stderr || res.stdout}`);
  return res.stdout.trim();
}

/**
 * Copy the tracked files of apps/demo-riverlevels into `dir` (an empty folder),
 * commit them as the seed, and return the commit sha. Same files, same sha.
 */
export function createBase(dir: string): string {
  const listed = mustGit(ROOT, "ls-files", "-z", "--", APP).split("\0").filter(Boolean);
  if (listed.length === 0) throw new Error(`${APP} has no tracked files`);
  for (const path of listed) {
    const target = join(dir, relative(APP, path));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(ROOT, path), target);
  }
  mustGit(dir, "init", "-q", "-b", "main");
  mustGit(dir, "config", "core.autocrlf", "false");
  mustGit(dir, "config", "user.name", BASE_COMMIT.name);
  mustGit(dir, "config", "user.email", BASE_COMMIT.email);
  mustGit(dir, "add", "-A");
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: BASE_COMMIT.name,
    GIT_AUTHOR_EMAIL: BASE_COMMIT.email,
    GIT_AUTHOR_DATE: BASE_COMMIT.date,
    GIT_COMMITTER_NAME: BASE_COMMIT.name,
    GIT_COMMITTER_EMAIL: BASE_COMMIT.email,
    GIT_COMMITTER_DATE: BASE_COMMIT.date,
  };
  const res = run("git", ["-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", "commit", "-q", "-m", BASE_COMMIT.message], dir, { env });
  if (res.status !== 0) throw new Error(`seed commit failed: ${res.stderr}`);
  return mustGit(dir, "rev-parse", "HEAD");
}

function findSeries(): Series[] {
  const out: Series[] = [];
  for (const intent of readdirSync(HERE).sort()) {
    const intentDir = join(HERE, intent);
    if (intent.startsWith("_") || !statSync(intentDir).isDirectory()) continue;
    for (const strategy of readdirSync(intentDir).sort()) {
      const dir = join(intentDir, strategy);
      if (!statSync(dir).isDirectory() || !existsSync(join(dir, "meta.json"))) continue;
      const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as SeriesMeta;
      const patches = readdirSync(dir).filter((f) => /^\d{4}-.*\.patch$/.test(f)).sort();
      out.push({ id: `${intent}.${strategy}`, dir, meta, patches });
    }
  }
  return out;
}

/** Branch <id> = base + the series, via git am. */
function applySeries(repo: string, base: string, s: Series): boolean {
  mustGit(repo, "checkout", "-q", "-B", s.id, base);
  const res = git(repo, "am", "-q", ...s.patches.map((p) => join(s.dir, p)));
  if (res.status !== 0) {
    git(repo, "am", "--abort");
    fail(`${s.id}: git am failed\n${(res.stderr || res.stdout).trim()}`);
    return false;
  }
  return true;
}

let installed = false;
function testResult(repo: string): { passed: number; total: number; failures: string[] } {
  if (!installed) {
    const res = run("pnpm", ["install", "--frozen-lockfile"], repo);
    if (res.status !== 0) throw new Error(`pnpm install failed:\n${res.stderr || res.stdout}`);
    installed = true;
  }
  const out = join(repo, ".verify-vitest.json");
  run("pnpm", ["test", "--reporter=json", `--outputFile=${out}`], repo);
  if (!existsSync(out)) return { passed: 0, total: 0, failures: ["vitest wrote no report"] };
  const report = JSON.parse(readFileSync(out, "utf8"));
  rmSync(out);
  const failed: string[] = [];
  // Vitest strips types without checking them; the build's tsc step does.
  const tsc = run("pnpm", ["exec", "tsc", "--noEmit"], repo);
  if (tsc.status !== 0) failed.push(`tsc: ${(tsc.stdout || tsc.stderr).trim().split("\n").slice(0, 5).join(" | ")}`);
  for (const file of report.testResults ?? []) {
    for (const t of file.assertionResults ?? []) if (t.status === "failed") failed.push(t.fullName);
    if (file.status === "failed" && !(file.assertionResults ?? []).length) failed.push(`${file.name}: ${file.message}`);
  }
  return { passed: report.numPassedTests, total: report.numTotalTests, failures: failed };
}

/** Merge branch `second` into `first`; returns conflicted paths ([] = clean). Leaves the merge in progress. */
function merge(repo: string, first: string, second: string, branch: string): string[] | null {
  mustGit(repo, "checkout", "-q", "-B", branch, first);
  const res = git(repo, "merge", "--no-ff", "--no-edit", "-m", `Merge ${second} into ${first}`, second);
  if (res.status === 0) return [];
  const conflicted = mustGit(repo, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
  return conflicted.length ? conflicted : null;
}

function main() {
  const repo = mkdtempSync(join(tmpdir(), "riverlevels-verify-"));
  try {
    console.log(`scratch repo: ${repo}`);
    const base = createBase(repo);
    const series = findSeries();
    console.log(`base ${base}\n\nseries (${series.length})`);

    const expected = new Set(series.map((s) => s.meta.base));
    if (expected.size === 1 && expected.has(base)) ok(`every meta.json names base ${base.slice(0, 7)}`);
    else fail(`base mismatch: built ${base}, meta.json says ${[...expected].join(", ")}`);

    const applied = new Map<string, Series>();
    for (const s of series) {
      const listed = s.meta.commits.map((c) => c.file);
      if (JSON.stringify(listed) !== JSON.stringify(s.patches)) {
        fail(`${s.id}: meta.json commits don't match the .patch files`);
        continue;
      }
      if (!applySeries(repo, base, s)) continue;
      const count = Number(mustGit(repo, "rev-list", "--count", `${base}..HEAD`));
      if (count !== s.patches.length) {
        fail(`${s.id}: expected ${s.patches.length} commits, got ${count}`);
        continue;
      }
      applied.set(s.id, s);
      let line = `${s.id}: ${count} commits apply cleanly`;
      if (opts.test) {
        const want = JSON.parse(readFileSync(join(s.dir, "result.json"), "utf8"));
        const got = testResult(repo);
        const typeErrors = got.failures.filter((f) => f.startsWith("tsc:"));
        if (got.passed !== want.passed || got.total !== want.total || typeErrors.length) {
          fail(`${s.id}: tests ${got.passed}/${got.total}, result.json says ${want.passed}/${want.total} ${typeErrors.join("; ")}`);
          continue;
        }
        line += `, tests ${got.passed}/${got.total} as recorded, tsc clean`;
      }
      ok(line);
    }

    if (opts.conflicts) {
      // Every pair of series from different Intents, merged with git merge. The
      // dark-mode x refactor-gauge pairs are meant to conflict on Gauge.tsx.
      console.log("\ncross-Intent merges (git merge)");
      const ids = [...applied.keys()];
      const intentOf = (id: string) => id.split(".")[0];
      for (const a of ids) {
        for (const b of ids) {
          if (a >= b || intentOf(a) === intentOf(b)) continue;
          const conflicted = merge(repo, a, b, "matrix");
          git(repo, "merge", "--abort");
          console.log(`  ${a} + ${b}: ${conflicted === null ? "merge failed" : conflicted.length ? `CONFLICT ${conflicted.join(", ")}` : "clean"}`);
        }
      }
      git(repo, "checkout", "-q", "main");
    }

    if (opts.resolutions) {
      const root = join(HERE, "_resolutions");
      const dirs = existsSync(root) ? readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory()).sort() : [];
      console.log(`\nresolutions (${dirs.length})`);
      for (const name of dirs) {
        const dir = join(root, name);
        const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as ResolutionMeta;
        const [a, b] = meta.pair;
        if (!applied.has(a) || !applied.has(b)) {
          fail(`${name}: series ${a} or ${b} didn't apply`);
          continue;
        }
        const filesDir = join(dir, "files");
        const files = listFiles(filesDir);
        const trees: string[] = [];
        for (const [first, second] of [
          [a, b],
          [b, a],
        ] as const) {
          const label = `${name} (${second} merged into ${first})`;
          const conflicted = merge(repo, first, second, "resolution");
          if (conflicted === null) {
            fail(`${label}: merge failed without conflicts`);
            git(repo, "merge", "--abort");
            continue;
          }
          const missing = conflicted.filter((p) => !files.includes(p));
          if (missing.length) fail(`${label}: no resolved content for ${missing.join(", ")}`);
          for (const p of files) {
            mkdirSync(dirname(join(repo, p)), { recursive: true });
            copyFileSync(join(filesDir, p), join(repo, p));
          }
          mustGit(repo, "add", "-A");
          const markers = git(repo, "grep", "-n", "-E", "^(<<<<<<<|>>>>>>>)", "--cached");
          if (markers.status === 0) fail(`${label}: conflict markers remain\n${markers.stdout}`);
          mustGit(repo, "commit", "-q", "--no-edit");
          trees.push(mustGit(repo, "rev-parse", "HEAD^{tree}"));
          let line = `${label}: conflicted ${conflicted.join(", ") || "nothing"}, resolved`;
          if (opts.test) {
            const got = testResult(repo);
            const want = meta.tests;
            if (got.failures.length || (want && (got.passed !== want.passed || got.total !== want.total))) {
              fail(`${label}: tests ${got.passed}/${got.total}${want ? `, meta says ${want.passed}/${want.total}` : ""} ${got.failures.join("; ")}`);
              continue;
            }
            line += `, tests ${got.passed}/${got.total}, tsc clean`;
          }
          ok(line);
        }
        if (trees.length === 2) {
          if (trees[0] === trees[1]) ok(`${name}: both merge orders give tree ${trees[0]!.slice(0, 7)}`);
          else fail(`${name}: merge orders give different trees ${trees.join(" vs ")}`);
        }
      }
      git(repo, "checkout", "-q", "main");
    }
  } finally {
    if (opts.keep) console.log(`\nkept ${repo}`);
    else rmSync(repo, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} failure(s)` : "\nall good");
  process.exit(failures ? 1 : 0);
}

function listFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, rel));
    else out.push(rel);
  }
  return out.sort();
}

// Run only as a script, so other scripts can import createBase and BASE_COMMIT.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
