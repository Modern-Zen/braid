// Logbook: the versioned *why*, stored in the repo next to the code.
// Path: .headwaters/logbook/<NNNN>-ch-<n>.md, numbered per River.

export const LOGBOOK_DIR = ".headwaters/logbook";

export interface LogbookFrontMatter {
  intent: string;
  channel: string;
  agent: string;
  model: string;
  strategy?: string;
  costUsd?: number;
  durationMs?: number;
  turns?: number;
  /** R2 key of the full transcript. Never a token or a secret. */
  transcript?: string;
}

export interface LogbookEntry {
  number: string; // "0012"
  meta: LogbookFrontMatter;
  plan: string;
  decisions: string[];
  rejected: string[];
  notes: string;
}

export function logbookNumber(n: number): string {
  return String(n).padStart(4, "0");
}

export function logbookPath(number: string | number, channel: string): string {
  const num = typeof number === "number" ? logbookNumber(number) : number;
  return `${LOGBOOK_DIR}/${num}-${channel}.md`;
}

export function parseLogbookPath(path: string): { number: string; channel: string } | null {
  const m = /(?:^|\/)\.headwaters\/logbook\/(\d{4,})-(ch-\d+)\.md$/.exec(path);
  return m ? { number: m[1]!, channel: m[2]! } : null;
}

const SECTIONS = {
  plan: "Plan",
  decisions: "Decisions",
  rejected: "Rejected approaches",
  notes: "Notes for reviewers",
} as const;

export function formatLogbook(e: LogbookEntry): string {
  const fm = Object.entries(e.meta)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`)
    .join("\n");
  const para = (items: string[]) => items.map((s) => s.trim()).filter(Boolean).join("\n\n");
  return [
    "---",
    fm,
    "---",
    "",
    `# Logbook ${e.number}`,
    "",
    `## ${SECTIONS.plan}`,
    "",
    e.plan.trim(),
    "",
    `## ${SECTIONS.decisions}`,
    "",
    para(e.decisions),
    "",
    `## ${SECTIONS.rejected}`,
    "",
    para(e.rejected),
    "",
    `## ${SECTIONS.notes}`,
    "",
    e.notes.trim(),
    "",
  ].join("\n");
}

export function parseLogbook(markdown: string, number = "0000"): LogbookEntry {
  const text = markdown.replace(/\r\n/g, "\n");
  const meta: Record<string, string | number> = {};
  let body = text;
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    body = text.slice(fm[0].length);
    for (const line of fm[1]!.split("\n")) {
      const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
      if (!m) continue;
      const raw = m[2]!.trim();
      let value: string | number = raw;
      if (raw.startsWith('"')) {
        try {
          value = JSON.parse(raw) as string;
        } catch {
          value = raw.slice(1, -1);
        }
      } else if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw);
      meta[m[1]!] = value;
    }
  }
  const sections = new Map<string, string>();
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current !== null) sections.set(current, buf.join("\n").trim());
  };
  for (const line of body.split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      current = h[1]!.toLowerCase();
      buf = [];
    } else if (current !== null) buf.push(line);
  }
  flush();
  const paras = (s: string | undefined) =>
    (s ?? "")
      .split(/\n\s*\n/)
      .map((p) => p.replace(/^\s*[-*]\s+/, "").trim())
      .filter(Boolean);
  return {
    number,
    meta: {
      intent: String(meta.intent ?? ""),
      channel: String(meta.channel ?? ""),
      agent: String(meta.agent ?? ""),
      model: String(meta.model ?? ""),
      strategy: meta.strategy !== undefined ? String(meta.strategy) : undefined,
      costUsd: typeof meta.costUsd === "number" ? meta.costUsd : undefined,
      durationMs: typeof meta.durationMs === "number" ? meta.durationMs : undefined,
      turns: typeof meta.turns === "number" ? meta.turns : undefined,
      transcript: meta.transcript !== undefined ? String(meta.transcript) : undefined,
    },
    plan: sections.get(SECTIONS.plan.toLowerCase()) ?? "",
    decisions: paras(sections.get(SECTIONS.decisions.toLowerCase())),
    rejected: paras(sections.get(SECTIONS.rejected.toLowerCase())),
    notes: sections.get(SECTIONS.notes.toLowerCase()) ?? "",
  };
}
