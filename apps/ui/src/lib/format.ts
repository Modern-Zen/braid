// Display formatting shared by the app and its components. Relative times only.

/** "now", "12s", "4m", "3h", "2d" — the feed's timestamps. */
export function relTime(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** "just now", "12 min ago", "3 h ago", "2 d ago" — headers. */
export function relTimeLong(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** 168000 → "2m48s", 9000 → "9s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return `${m}m${String(s).padStart(2, "0")}s`;
}

/** {82, 11, 4} → "+82 −11 · 4 files" (U+2212 minus, as in the design). */
export function formatDiff(d: { added: number; removed: number; files: number }): string {
  return `+${d.added} −${d.removed} · ${d.files} ${d.files === 1 ? "file" : "files"}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** 3 → "Three"; 14 → "14". */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * The noun phrase an Intent is about, for sentences like
 * "Three channels are working on a dark mode."
 *   "Add a dark mode"              → "working on a dark mode"
 *   "Refactor the gauge component" → "refactoring the gauge component"
 */
export function intentActivity(title: string): string {
  const t = title.trim();
  const m = /^(\S+)\s+(.*)$/.exec(t);
  if (!m) return `working on ${t.toLowerCase()}`;
  const verb = m[1]!.toLowerCase();
  const rest = m[2]!;
  if (verb === "add" || verb === "build" || verb === "create" || verb === "make") return `working on ${rest}`;
  return `${gerund(verb)} ${rest}`;
}

function gerund(verb: string): string {
  if (verb.endsWith("ie")) return `${verb.slice(0, -2)}ying`;
  if (verb.endsWith("e") && !verb.endsWith("ee")) return `${verb.slice(0, -1)}ing`;
  return `${verb}ing`;
}

/**
 * A short name for an Intent inside a sentence:
 *   "Add a dark mode" → "dark mode", "Refactor the gauge component" → "refactor",
 *   "Add rate limiting to /api" → "rate limiting".
 */
export function intentShortName(title: string): string {
  const words = title.trim().split(/\s+/);
  if (words.length === 0) return title;
  if (words[0]!.toLowerCase() === "add") {
    let rest = words.slice(1);
    if (rest[0] && /^(a|an|the)$/i.test(rest[0])) rest = rest.slice(1);
    return rest.slice(0, 2).join(" ").toLowerCase() || title;
  }
  return words[0]!.toLowerCase();
}
