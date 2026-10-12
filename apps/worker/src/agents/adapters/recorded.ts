// Recorded patch series: real agent output, replayed one commit at a time in scripted mode.
import { RESOLUTIONS, SERIES } from "../../generated/patches.ts";

export interface RecordedCommit {
  file: string;
  /** Raw `git format-patch` output. */
  patch: string;
  delaySec: [number, number] | null;
}

export interface RecordedSeries {
  intent: string;
  strategy: string;
  /** Who really produced the patches when they were recorded. Shown in the UI. */
  agent: string;
  model: string;
  base: string | null;
  lines: string[];
  turns: number | null;
  durationMs: number | null;
  costUsd: number | null;
  logbook: string;
  result: { passed: number; total: number; failures?: string[] } | null;
  commits: RecordedCommit[];
}

export interface RecordedResolution {
  intent: string;
  file: string;
  patch: string;
  notes: string;
}

export function recordedSeries(intent: string, strategy: string): RecordedSeries | null {
  return SERIES[`${intent}/${strategy}`] ?? null;
}

export function recordedStrategies(intent: string): string[] {
  return Object.values(SERIES)
    .filter((s) => s.intent === intent)
    .map((s) => s.strategy);
}

export function recordedResolutions(intent: string): RecordedResolution[] {
  return Object.values(RESOLUTIONS).filter((r) => r.intent === intent);
}

/** Subject and body from a `git format-patch` file. */
export function patchMessage(patch: string): { subject: string; body: string } {
  const text = patch.replace(/\r\n/g, "\n");
  const headerEnd = text.indexOf("\n\n");
  const header = text.slice(0, headerEnd);
  // Subject may wrap onto continuation lines starting with a space.
  const m = /^Subject: (.*(?:\n [^\n]*)*)/m.exec(header);
  const subject = (m?.[1] ?? "Update").replace(/\n /g, " ").replace(/^\[PATCH[^\]]*\]\s*/, "").trim();
  const rest = text.slice(headerEnd + 2);
  const sep = rest.search(/^---\s*$/m);
  const body = (sep === -1 ? "" : rest.slice(0, sep)).trim();
  return { subject, body };
}

/** Files a patch touches (from its `diff --git` headers). */
export function patchFiles(patch: string): string[] {
  const files = new Set<string>();
  for (const m of patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)) files.add(m[2]!);
  return [...files];
}
