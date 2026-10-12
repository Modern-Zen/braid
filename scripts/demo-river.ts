// Shared by seed-demo, demo and reset-demo: the demo River and its three Intents.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { OpenIntentRequest } from "@braid/protocol";
import { git, repoRoot } from "./lib.ts";

export const RIVER = { id: "riverlevels", name: "riverlevels", owner: "modern-zen" };

export const DEMO_INTENTS: OpenIntentRequest[] = [
  {
    id: "dark-mode",
    title: "Add a dark mode",
    goal: "Add a dark mode to the dashboard. Respect prefers-color-scheme and keep the light palette's contrast.",
    checks: ["Tests pass", "Gauge labels keep at least 4.5:1 contrast in both themes", "prefers-color-scheme is respected"],
  },
  {
    id: "rate-limit-api",
    title: "Add rate limiting to /api",
    goal: "Rate-limit /api with a Durable Object–backed token bucket: 10 req/s per token, 429 on overflow, and cache /levels for 60s.",
    checks: ["Tests pass", "429 with retryAfter after 10 req/s per token", "/levels is cached for 60s"],
  },
  {
    id: "refactor-gauge",
    title: "Refactor the gauge component",
    goal: "Extract the gauge's state and formatting logic from Gauge.tsx into a useGauge hook. No visual change.",
    checks: ["Tests pass", "src/hooks/useGauge.ts holds the gauge logic", "No visual change"],
  },
];

const FIXED_DATE = "2026-10-12T09:00:00Z";

/**
 * Build the seed commit from apps/demo-riverlevels as committed in this repo (git ls-files),
 * with a fixed author and date so every seed produces the same tree and commit.
 */
export function buildSeedRepo(): { dir: string; sha: string; cleanup: () => void } {
  const work = mkdtempSync(join(tmpdir(), "braid-seed-"));
  const files = execFileSync("git", ["ls-files", "apps/demo-riverlevels"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  if (files.length === 0) throw new Error("apps/demo-riverlevels has no committed files yet");
  for (const f of files) {
    const rel = f.slice("apps/demo-riverlevels/".length);
    const to = join(work, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(repoRoot, f), to);
  }
  writeFileSync(join(work, ".gitattributes"), "* text=auto eol=lf\n");
  git(work, ["init", "-q", "-b", "main"]);
  git(work, ["-c", "core.autocrlf=false", "add", "-A"]);
  const env = { GIT_AUTHOR_DATE: FIXED_DATE, GIT_COMMITTER_DATE: FIXED_DATE };
  execFileSync(
    "git",
    ["-c", "user.name=Headwaters", "-c", "user.email=agents@braid.drp.icu", "-c", "core.autocrlf=false", "commit", "-q", "-m", "Initial commit: riverlevels"],
    { cwd: work, env: { ...process.env, ...env } },
  );
  const sha = git(work, ["rev-parse", "HEAD"]);
  return { dir: work, sha, cleanup: () => rmSync(work, { recursive: true, force: true }) };
}
