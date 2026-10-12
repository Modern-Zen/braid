// Shared by seed-demo, demo and reset-demo: the demo River and its three Intents.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OpenIntentRequest } from "@braid/protocol";
import { createBase } from "./scripted-patches/verify.ts";

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

/**
 * The seed commit for river-riverlevels: apps/demo-riverlevels as committed here, built by the
 * same helper the recorded patch series were verified against, so main is byte-identical to
 * their base (same files, identity and dates = same sha).
 */
export function buildSeedRepo(): { dir: string; sha: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "braid-seed-"));
  const sha = createBase(dir);
  return { dir, sha, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
