// pnpm walkthroughs:render
//
// Renders the README's user-story diagrams (docs/walkthroughs/<story>-{light,dark}.svg) in the
// Headwaters style: one mainline, an Intent per braid, Channels that rejoin when they merge,
// a rose shoal where Lines overlapped, and amber rings where a person decided.
// The README embeds both variants with <picture> so they follow the GitHub theme.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./lib.ts";

type State = "merged" | "dropped" | "active";
interface Chan {
  id: string;
  label: string; // "claude-code · tests-first"
  state: State;
  commits: number;
  human?: string; // amber ring + callout
}
interface Intent {
  title: string;
  channels: Chan[];
}
interface Story {
  slug: string;
  intents: Intent[];
  shoal?: { a: string; b: string; label: string };
  head: string; // "main @ …"
}

const PALETTE = {
  light: { ink: "#1c1917", ink2: "#57534e", ink3: "#78716c", ink4: "#a8a29e", line: "#e7e5e4", chan: "#0d9488", glow: "rgba(13,148,136,0.16)", human: "#d97706", humanSoft: "rgba(217,119,6,0.14)", conflict: "#e11d48", conflictSoft: "rgba(225,29,72,0.10)", chip: "#ffffff" },
  dark: { ink: "#fafaf9", ink2: "#d6d3d1", ink3: "#a8a29e", ink4: "#78716c", line: "#44403c", chan: "#2dd4bf", glow: "rgba(45,212,191,0.22)", human: "#d97706", humanSoft: "rgba(217,119,6,0.20)", conflict: "#e11d48", conflictSoft: "rgba(225,29,72,0.18)", chip: "#292524" },
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(story: Story, theme: "light" | "dark"): string {
  const c = PALETTE[theme];
  const W = 1200;
  const ROW = 36;
  const GAP = 44;
  const TOP = 34;
  // Lay out Intents top to bottom; the mainline runs underneath them.
  let y = TOP;
  const placed = story.intents.map((intent, i) => {
    const labelY = y + 4;
    y += 44;
    const ys = intent.channels.map((_, k) => y + k * ROW);
    y += intent.channels.length * ROW + GAP - ROW;
    return { intent, i, labelY, ys };
  });
  const my = y + 28; // mainline
  const H = my + 92;
  const xs = (i: number) => ({ fork: 60 + i * 64, x0: 60 + i * 64 + 150, rejoin: 1010 + i * 40 });

  const out: string[] = [];
  const pos = new Map<string, { y: number; x0: number; end: number; clearX: number }>();
  // Everything drawn above the mainline, so the shoal label can find a free gap.
  const boxes: Array<{ top: number; bottom: number; x1: number; x2: number }> = [];
  out.push(`<path d="M0 ${my} H${W}" stroke="${c.ink}" stroke-width="2.5" stroke-linecap="round" fill="none"/>`);
  out.push(`<path d="M${xs(story.intents.length).rejoin - 20} ${my} H${W}" stroke="${c.ink}" stroke-width="4" stroke-linecap="round" fill="none"/>`);

  for (const p of placed) {
    const { fork, x0, rejoin } = xs(p.i);
    out.push(`<text x="${x0}" y="${p.labelY}" font-family="${SERIF}" font-style="italic" font-size="18" fill="${c.ink3}">${esc(p.intent.title)}</text>`);
    boxes.push({ top: p.labelY - 15, bottom: p.labelY + 4, x1: x0, x2: x0 + p.intent.title.length * 8.6 });
    p.intent.channels.forEach((ch, k) => {
      const cy = p.ys[k]!;
      const runEnd = ch.state === "merged" ? rejoin - 120 : ch.state === "dropped" ? x0 + 300 + k * 26 : x0 + 470;
      let d = `M${fork} ${my} C${fork + 70} ${my} ${x0 - 70} ${cy} ${x0} ${cy} H${runEnd}`;
      if (ch.state === "merged") d += ` C${runEnd + 70} ${cy} ${rejoin - 70} ${my} ${rejoin} ${my}`;
      const stroke = ch.state === "merged" ? c.chan : ch.state === "dropped" ? c.ink4 : c.chan;
      const width = ch.state === "merged" ? 2 : 1.5;
      out.push(`<path d="${d}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" fill="none"${ch.state === "dropped" ? ' opacity="0.8"' : ""}/>`);
      for (let n = 0; n < ch.commits; n++) {
        const cx = x0 + 24 + ((runEnd - x0 - 48) * (n + 0.5)) / ch.commits;
        out.push(`<circle cx="${cx.toFixed(1)}" cy="${cy}" r="3" fill="${stroke}"/>`);
      }
      if (ch.state === "dropped") out.push(`<circle cx="${runEnd}" cy="${cy}" r="4.5" fill="none" stroke="${c.ink4}" stroke-width="1.5"/>`);
      boxes.push({ top: cy - 5, bottom: cy + 5, x1: x0 - 70, x2: ch.state === "merged" ? rejoin : runEnd + 6 });
      const chip = `${ch.id} · ${ch.label}`;
      const chipX = x0 + 6;
      const chipY = cy - 9;
      let chipEnd: number;
      if (ch.state === "dropped") {
        out.push(`<text x="${chipX + 2}" y="${chipY}" font-family="${MONO}" font-size="12.5" fill="${c.ink4}">${esc(chip)}</text>`);
        chipEnd = chipX + 2 + chip.length * 7.55;
        boxes.push({ top: chipY - 13, bottom: chipY + 3, x1: chipX, x2: chipEnd });
      } else {
        const w = chip.length * 7.55 + 16;
        out.push(`<rect x="${chipX}" y="${chipY - 14}" width="${w.toFixed(0)}" height="21" rx="4" fill="${c.chip}" stroke="${c.line}"/>`);
        out.push(`<text x="${chipX + 8}" y="${chipY + 1}" font-family="${MONO}" font-size="12.5" fill="${c.ink}">${esc(chip)}</text>`);
        chipEnd = chipX + w;
        boxes.push({ top: chipY - 14, bottom: chipY + 7, x1: chipX, x2: chipEnd });
      }
      pos.set(ch.id, { y: cy, x0, end: runEnd, clearX: Math.max(chipEnd, ch.state === "dropped" ? runEnd + 6 : 0) });
      if (ch.human) {
        // The decision sits on the Channel's own run, just before it rejoins; label above the line.
        const hx = runEnd - 30;
        out.push(`<circle cx="${hx}" cy="${cy}" r="10" fill="${c.humanSoft}" stroke="${c.human}" stroke-width="1.5"/>`);
        out.push(`<circle cx="${hx}" cy="${cy}" r="3.5" fill="${c.human}"/>`);
        out.push(`<text x="${hx - 16}" y="${cy - 10}" text-anchor="end" font-family="${SANS}" font-size="14" font-weight="600" fill="${c.human}">${esc(ch.human)}</text>`);
        boxes.push({ top: cy - 24, bottom: cy - 6, x1: hx - 16 - ch.human.length * 7.6, x2: hx + 10 });
      }
    });
  }

  if (story.shoal) {
    const a = pos.get(story.shoal.a)!;
    const b = pos.get(story.shoal.b)!;
    // The shoal sits where both Channels are running, clear of every chip and end ring it spans.
    const spanned = [...pos.values()].filter((p) => p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y));
    const sx = Math.max(a.x0 + 250, b.x0 + 250, ...spanned.map((p) => p.clearX + 24));
    out.push(`<path d="M${sx} ${a.y} V${b.y}" stroke="${c.conflict}" stroke-width="1" stroke-dasharray="3 4" opacity="0.7"/>`);
    for (const p of [a, b]) out.push(`<ellipse cx="${sx}" cy="${p.y}" rx="15" ry="6" fill="${c.conflictSoft}" stroke="${c.conflict}"/>`);
    // Label: the free gap between the two ellipses closest to the shoal line (and to the middle).
    const line1 = `${story.shoal.a} ↔ ${story.shoal.b} both declared`;
    const labelW = Math.max(line1.length * 7.4, story.shoal.label.length * 7.9);
    const mid = (a.y + b.y) / 2;
    let best = { cost: Infinity, lx: sx + 16, ly: mid };
    for (let ly = Math.min(a.y, b.y) + 24; ly <= Math.max(a.y, b.y) - 24; ly++) {
      let lx = sx + 16;
      for (let moved = true, n = 0; moved && n < 20; n++) {
        moved = false;
        for (const box of boxes) {
          if (box.bottom < ly - 20 || box.top > ly + 22 || box.x2 < lx || box.x1 > lx + labelW) continue;
          lx = box.x2 + 14;
          moved = true;
        }
      }
      const cost = (lx - sx - 16) * 4 + Math.abs(ly - mid);
      if (cost < best.cost) best = { cost, lx, ly };
    }
    const { lx, ly } = best;
    if (lx > sx + 16) out.push(`<path d="M${sx + 4} ${ly + 5} H${lx - 6}" stroke="${c.conflict}" stroke-width="1" stroke-dasharray="3 4" opacity="0.7"/>`);
    out.push(`<text x="${lx}" y="${ly - 3}" font-family="${SANS}" font-size="14" fill="${c.ink2}">${esc(line1)}</text>`);
    out.push(`<text x="${lx}" y="${ly + 15}" font-family="${MONO}" font-size="13" fill="${c.conflict}">${esc(story.shoal.label)}</text>`);
  }

  out.push(`<text x="16" y="${my + 30}" font-family="${MONO}" font-size="13.5" fill="${c.ink2}">${esc(story.head)}</text>`);
  const all = story.intents.flatMap((i) => i.channels);
  const decisions = all.filter((ch) => ch.human).length;
  const counter = `${all.length} agents · ${all.reduce((n, ch) => n + ch.commits, 0)} commits · ${decisions} ${decisions === 1 ? "decision" : "decisions"} asked of you`;
  out.push(`<text x="${W - 16}" y="${my + 30}" text-anchor="end" font-family="${SERIF}" font-size="21" fill="${c.ink}">${esc(counter)}</text>`);

  // Legend.
  const ly = H - 18;
  const legend: Array<[string, string]> = [
    [`<path d="M0 0 H22" stroke="${c.chan}" stroke-width="2"/>`, "a Channel (one agent, its own fork)"],
    [`<path d="M0 0 H22" stroke="${c.ink4}" stroke-width="1.5"/><circle cx="26" cy="0" r="3.5" fill="none" stroke="${c.ink4}" stroke-width="1.5"/>`, "not picked"],
    [`<path d="M0 0 H22" stroke="${c.conflict}" stroke-dasharray="3 4"/>`, "Lines overlapped"],
    [`<circle cx="10" cy="0" r="7" fill="${c.humanSoft}" stroke="${c.human}" stroke-width="1.5"/>`, "a decision for you"],
  ];
  let lx = 0;
  for (const [mark, text] of legend) {
    out.push(`<g transform="translate(${lx} ${ly})">${mark}<text x="36" y="5" font-family="${SANS}" font-size="14" fill="${c.ink3}">${esc(text)}</text></g>`);
    lx += 36 + text.length * 7.4 + 36;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">\n${out.join("\n")}\n</svg>\n`;
}

const STORIES: Story[] = [
  {
    slug: "tollgate",
    head: "main @ 7c41e02",
    shoal: { a: "ch-5", b: "ch-8", label: "src/billing/money.ts" },
    intents: [
      {
        title: "Meter API calls per customer",
        channels: [
          { id: "ch-1", label: "claude-code · minimal-diff", state: "merged", commits: 3 },
          { id: "ch-2", label: "claude-code · bold", state: "dropped", commits: 2 },
          { id: "ch-3", label: "claude-code · conservative", state: "dropped", commits: 3 },
        ],
      },
      {
        title: "Prorate plan changes mid-cycle",
        channels: [
          { id: "ch-4", label: "claude-code · minimal-diff", state: "dropped", commits: 2 },
          { id: "ch-5", label: "claude-code · tests-first", state: "merged", commits: 4, human: "Approve a high-risk change" },
          { id: "ch-6", label: "claude-code · conservative", state: "dropped", commits: 3 },
        ],
      },
      {
        title: "Build a printable invoice",
        channels: [
          { id: "ch-7", label: "claude-code · minimal-diff", state: "dropped", commits: 2 },
          { id: "ch-8", label: "codex via MCP · tests-first", state: "merged", commits: 4, human: "Pick a printable invoice" },
        ],
      },
    ],
  },
  {
    slug: "paperboats",
    head: "main @ 2e9b6fa",
    shoal: { a: "ch-2", b: "ch-8", label: "src/world/current.ts" },
    intents: [
      {
        title: "Generate an endless braided river",
        channels: [
          { id: "ch-1", label: "claude-code · bold", state: "dropped", commits: 3 },
          { id: "ch-2", label: "claude-code · rewrite", state: "merged", commits: 4 },
          { id: "ch-3", label: "claude-code · conservative", state: "dropped", commits: 2 },
        ],
      },
      {
        title: "Add a water shader",
        channels: [
          { id: "ch-4", label: "claude-code · bold", state: "merged", commits: 3, human: "Pick a water shader" },
          { id: "ch-5", label: "claude-code · rewrite", state: "dropped", commits: 3 },
          { id: "ch-6", label: "claude-code · minimal-diff", state: "dropped", commits: 2 },
          { id: "ch-10", label: "claude-code · minimal-diff · replay of ch-5", state: "active", commits: 1 },
        ],
      },
      {
        title: "Make steering feel good",
        channels: [
          { id: "ch-7", label: "claude-code · minimal-diff", state: "dropped", commits: 2 },
          { id: "ch-8", label: "claude-code · tests-first", state: "merged", commits: 4, human: "Resolve a merge conflict" },
        ],
      },
      {
        title: "Add a soundtrack",
        channels: [{ id: "ch-9", label: "gemini-cli via MCP · bold", state: "merged", commits: 3, human: "Approve a high-risk change" }],
      },
    ],
  },
];

const dir = join(repoRoot, "docs", "walkthroughs");
mkdirSync(dir, { recursive: true });
for (const s of STORIES) {
  for (const theme of ["light", "dark"] as const) {
    writeFileSync(join(dir, `${s.slug}-${theme}.svg`), render(s, theme));
  }
}
console.log(`walkthroughs: ${STORIES.length * 2} diagrams → docs/walkthroughs/`);
