// Git commit trailers: the agent protocol on the wire.
// Agents add the first five to every commit. Confluence adds Cost and Risk to the
// commit it lands on main, because risk is only known after review.

export const TRAILER_KEYS = [
  "Headwaters-Intent",
  "Headwaters-Channel",
  "Headwaters-Agent",
  "Headwaters-Model",
  "Headwaters-Cost",
  "Headwaters-Risk",
  "Logbook",
] as const;

export type TrailerKey = (typeof TRAILER_KEYS)[number];

export interface Trailers {
  intent?: string;
  channel?: string;
  agent?: string;
  model?: string;
  cost?: string; // "$0.27"
  risk?: string; // "0.72"
  logbook?: string; // "0012"
}

const FIELD: Record<TrailerKey, keyof Trailers> = {
  "Headwaters-Intent": "intent",
  "Headwaters-Channel": "channel",
  "Headwaters-Agent": "agent",
  "Headwaters-Model": "model",
  "Headwaters-Cost": "cost",
  "Headwaters-Risk": "risk",
  Logbook: "logbook",
};

/** Ordered key/value pairs, the way the Logbook screen renders trailer tags. */
export function trailerPairs(t: Trailers): Array<{ key: TrailerKey; value: string }> {
  const order: TrailerKey[] = [
    "Headwaters-Channel",
    "Headwaters-Intent",
    "Headwaters-Agent",
    "Headwaters-Model",
    "Headwaters-Cost",
    "Headwaters-Risk",
    "Logbook",
  ];
  const out: Array<{ key: TrailerKey; value: string }> = [];
  for (const key of order) {
    const value = t[FIELD[key]];
    if (value !== undefined && value !== "") out.push({ key, value });
  }
  return out;
}

export function formatTrailers(t: Trailers): string {
  const lines: string[] = [];
  for (const key of TRAILER_KEYS) {
    const value = t[FIELD[key]];
    if (value === undefined || value === "") continue;
    if (/[\r\n]/.test(value)) throw new Error(`Trailer ${key} must be a single line`);
    lines.push(`${key}: ${value}`);
  }
  return lines.join("\n");
}

/** Append trailers to a commit message, merging with any trailer block already present. */
export function withTrailers(message: string, t: Trailers): string {
  const { body, trailers, extra } = splitMessage(message);
  const block = [...extra, formatTrailers({ ...trailers, ...stripUndefined(t) })]
    .filter(Boolean)
    .join("\n");
  return block ? `${body.trimEnd()}\n\n${block}\n` : `${body.trimEnd()}\n`;
}

export function parseTrailers(message: string): Trailers {
  return splitMessage(message).trailers;
}

/**
 * Split a commit message into body and its final trailer paragraph. Unknown
 * trailers (Co-Authored-By, Signed-off-by) are kept verbatim in `extra`.
 * A single-paragraph message is all body, never trailers.
 */
function splitMessage(message: string): { body: string; trailers: Trailers; extra: string[] } {
  const lines = message.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const trailers: Trailers = {};
  const extra: string[] = [];
  let i = lines.length - 1;
  for (; i >= 0; i--) {
    const line = lines[i]!;
    if (line.trim() === "") break;
    const m = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(line);
    if (!m) return { body: message, trailers: {}, extra: [] };
    const key = m[1] as TrailerKey;
    if (key in FIELD) trailers[FIELD[key]] = m[2]!.trim();
    else extra.unshift(line);
  }
  if (i <= 0 || i === lines.length - 1) return { body: message, trailers: {}, extra: [] };
  return { body: lines.slice(0, i).join("\n"), trailers, extra };
}

function stripUndefined(t: Trailers): Trailers {
  const out: Trailers = {};
  for (const [k, v] of Object.entries(t)) if (v !== undefined) out[k as keyof Trailers] = v;
  return out;
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function formatRisk(risk: number): string {
  return risk.toFixed(2);
}
