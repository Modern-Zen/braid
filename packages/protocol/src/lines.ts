// Lines: live claims on file globs that a Channel intends to touch.
// Two Lines overlap when some path could match both globs. This is decided
// statically (glob ∩ glob ≠ ∅), so it works before any file exists.
//
// Supported glob syntax: `*` (within a segment), `?`, `**` (any number of
// segments), `{a,b}` alternation, and a trailing `/` meaning "everything below".

export interface Line {
  channelId: string;
  intentId?: string;
  glob: string;
  note?: string;
  declaredAt: number;
}

export interface LineOverlap {
  /** The Channel that already holds the Line. */
  channelId: string;
  intentId?: string;
  theirs: string;
  ours: string;
  /** A human-readable path both globs cover, e.g. "src/components/Gauge.tsx". */
  path: string;
}

/** Normalise a glob: forward slashes, no leading ./ or /, trailing / means "/**". */
export function normalizeGlob(glob: string): string {
  let g = glob.trim().replace(/\\/g, "/");
  while (g.startsWith("./")) g = g.slice(2);
  g = g.replace(/^\/+/, "");
  g = g.replace(/\/{2,}/g, "/");
  if (g.endsWith("/")) g = `${g}**`;
  if (g === "") g = "**";
  return g;
}

/** Expand `{a,b}` alternations (non-nested and nested) into plain globs. */
export function expandBraces(glob: string): string[] {
  const open = glob.indexOf("{");
  if (open === -1) return [glob];
  let depth = 0;
  let close = -1;
  for (let i = open; i < glob.length; i++) {
    if (glob[i] === "{") depth++;
    else if (glob[i] === "}") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return [glob];
  const inner = glob.slice(open + 1, close);
  const parts: string[] = [];
  depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  const prefix = glob.slice(0, open);
  const suffix = glob.slice(close + 1);
  return parts.flatMap((p) => expandBraces(`${prefix}${p}${suffix}`));
}

/** Do two single-segment patterns (with * and ?) share at least one string? */
function segmentsIntersect(a: string, b: string): boolean {
  const memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    const key = i * 4096 + j;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let r: boolean;
    if (i === a.length && j === b.length) r = true;
    else if (i < a.length && a[i] === "*") r = go(i + 1, j) || (j < b.length && (b[j] === "*" ? go(i, j + 1) || go(i + 1, j) : go(i, j + 1)));
    else if (j < b.length && b[j] === "*") r = go(i, j + 1) || (i < a.length && go(i + 1, j));
    else if (i < a.length && j < b.length && (a[i] === "?" || b[j] === "?" || a[i] === b[j])) r = go(i + 1, j + 1);
    else r = false;
    memo.set(key, r);
    return r;
  };
  return go(0, 0);
}

/** Do two path globs (segments split on /, with **) share at least one path? */
function pathsIntersect(a: string[], b: string[]): boolean {
  const memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    const key = i * 4096 + j;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let r: boolean;
    if (i === a.length && j === b.length) r = true;
    else if (i < a.length && a[i] === "**") r = go(i + 1, j) || (j < b.length && go(i, j + 1));
    else if (j < b.length && b[j] === "**") r = go(i, j + 1) || (i < a.length && go(i + 1, j));
    else if (i < a.length && j < b.length) r = segmentsIntersect(a[i]!, b[j]!) && go(i + 1, j + 1);
    else r = false;
    memo.set(key, r);
    return r;
  };
  return go(0, 0);
}

export function globsOverlap(a: string, b: string): boolean {
  const as = expandBraces(normalizeGlob(a));
  const bs = expandBraces(normalizeGlob(b));
  return as.some((x) => bs.some((y) => pathsIntersect(x.split("/"), y.split("/"))));
}

const isLiteral = (g: string) => !/[*?{]/.test(g);

/** Pick the path to show for an overlap: the literal glob if there is one, else the narrower. */
export function overlapPath(a: string, b: string): string {
  const na = normalizeGlob(a);
  const nb = normalizeGlob(b);
  if (isLiteral(na)) return na;
  if (isLiteral(nb)) return nb;
  const score = (g: string) => g.replace(/\*\*/g, "").replace(/[*?]/g, "").length;
  return score(na) >= score(nb) ? na : nb;
}

/**
 * Check a declaration against the live Lines of other Channels.
 * A Channel never conflicts with itself.
 */
export function findOverlaps(channelId: string, globs: string[], live: Line[]): LineOverlap[] {
  const out: LineOverlap[] = [];
  const seen = new Set<string>();
  for (const line of live) {
    if (line.channelId === channelId) continue;
    for (const ours of globs) {
      if (!globsOverlap(ours, line.glob)) continue;
      const key = `${line.channelId}|${line.glob}|${ours}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        channelId: line.channelId,
        intentId: line.intentId,
        theirs: line.glob,
        ours,
        path: overlapPath(ours, line.glob),
      });
    }
  }
  return out;
}
