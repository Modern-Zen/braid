// Pure parsers for review output (no Workers runtime imports, so they unit-test in Node).
import type { DiffFile, DiffStat, TestResult } from "@braid/protocol";

/** The alias URL from `wrangler versions upload` output, else any workers.dev URL. */
export function pickPreviewUrl(out: string, alias: string): string | null {
  const urls = [...out.matchAll(/https:\/\/[a-z0-9.-]+\.workers\.dev\S*/gi)].map((m) => m[0].replace(/[).,]+$/, ""));
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
  // Vitest: "      Tests  2 failed | 12 passed (14)"; Jest: "Tests:       2 failed, 12 passed, 14 total".
  // Not "Test Files  1 passed (1)".
  const line = [...clean.matchAll(/^\s*Tests:?\s+(\d.*)$/gm)].map((m) => m[1]!).pop();
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
  return { risk: Math.round(Math.min(0.95, risk) * 100) / 100, reasons, source: "heuristic" };
}
