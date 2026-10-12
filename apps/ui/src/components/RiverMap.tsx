// The River map: the prototype's riverMap() generalized from 3 hardcoded Intents to
// N Intents with N Channels each. Geometry kept from the design:
//   W=1000, H=620, mainline y=400, xEnd=880; Channel spacing 45, 70 between Intents;
//   fork curves C fx+70 my, x0−70 y, x0 y (x0 = fork + 150); chips at the run end;
//   commit dots at `marks`; shoal ellipses + dashed rose connector + tooltip for overlaps;
//   merged: ink-4 Channels rejoin at xEnd and a 4px mainline-out draws on.
// With the design's 3 Intents × 3 Channels this reproduces the prototype exactly:
// two Intents above the mainline (y 70–160, 230–320) and one below (470–560).
import { useMemo, type ReactElement } from "react";
import type { ChannelOverlap, ChannelView, IntentView, RiverState } from "@braid/protocol";
import { intentShortName } from "../lib/format.ts";
import { AgentChipSvg, type ChipTone } from "./AgentChip.tsx";
import { ChannelLine, channelStroke, type ChannelState } from "./ChannelLine.tsx";
import { CommitDot } from "./CommitDot.tsx";

const W = 1000;
const H = 620;
const MY = 400;
const X_END = 880;
const MERGED_RUN_END = 760;
const SPACING = 45;
const GAP = 70;
const TOP = 70;
const ABOVE = 80; // last Channel above the mainline sits this far above it
const BELOW = 70; // first Channel below the mainline sits this far below it
const SHOAL_X = 560;

interface Placed {
  intent: IntentView;
  fork: number;
  x0: number;
  ys: number[];
  labelY: number;
  merged: boolean;
}

interface Layout {
  my: number;
  vy: number;
  vh: number;
  intents: Placed[];
}

/** Two of every three Intents ride above the mainline, the rest below (3 → 2 + 1, as designed). */
export function layoutRiver(intents: IntentView[]): Layout {
  const n = intents.length;
  const above = n - Math.floor(n / 3);
  const block = (it: IntentView) => Math.max(0, it.channels.length - 1) * SPACING;
  const aboveHeight = intents.slice(0, above).reduce((h, it) => h + block(it), 0) + GAP * Math.max(0, above - 1);
  let my = MY;
  const top = my - ABOVE - aboveHeight;
  if (top < TOP) my += TOP - top;
  const step = n > 1 ? Math.min(40, 200 / (n - 1)) : 0;

  const placed: Placed[] = [];
  let y = my - ABOVE - aboveHeight;
  let bottom = my;
  intents.forEach((it, i) => {
    if (i === above) y = my + BELOW;
    const ys = it.channels.map((_, ci) => y + ci * SPACING);
    const fork = 80 + step * i;
    placed.push({
      intent: it,
      fork,
      x0: fork + 150,
      ys,
      labelY: i >= above ? y - 20 : y - 18,
      merged: it.status === "merged",
    });
    bottom = Math.max(bottom, y + block(it));
    y += block(it) + GAP;
  });

  const firstY = placed[0]?.ys[0] ?? my;
  const vy = Math.min(0, firstY - TOP);
  const vh = Math.max(H + (my - MY), bottom + 60) - vy;
  // Crop empty sky above a short River so the map isn't a sliver.
  const crop = n > 0 && firstY - TOP > 0 ? firstY - TOP : 0;
  return { my, vy: vy + crop, vh: vh - crop, intents: placed };
}

function channelState(c: ChannelView, intentMerged: boolean): ChannelState {
  if (intentMerged || c.status === "merged") return "merged";
  if (c.status === "failed" || c.status === "dropped") return "idle";
  return "active";
}

function chipTone(state: ChannelState): ChipTone {
  return state === "merged" ? "merged" : "active";
}

function statusColor(c: ChannelView): string {
  if (c.status === "failed") return "var(--hw-color-conflict)";
  if (c.statusText.includes("✓")) return "var(--hw-color-merged)";
  return "var(--hw-color-ink-3)";
}

export interface RiverMapProps {
  river: RiverState;
  reduced?: boolean;
  onIntent?: (intent: IntentView) => void;
  onChannel?: (channel: ChannelView, intent: IntentView) => void;
  onCommit?: (channel: ChannelView, intent: IntentView) => void;
}

export function RiverMap({ river, reduced = false, onIntent, onChannel, onCommit }: RiverMapProps): ReactElement {
  const layout = useMemo(() => layoutRiver(river.intents), [river.intents]);
  const { my } = layout;
  const merged = river.merged;
  const els: ReactElement[] = [];

  els.push(<path key="main" d={`M0 ${my} H${W}`} fill="none" stroke="var(--hw-color-mainline)" strokeWidth={merged ? 2 : 2.5} strokeLinecap="round" />);
  if (merged) {
    els.push(
      <path
        key="main2"
        d={`M${X_END} ${my} H${W}`}
        fill="none"
        stroke="var(--hw-color-mainline)"
        strokeWidth={4}
        strokeLinecap="round"
        pathLength={1}
        style={reduced ? undefined : { strokeDasharray: 1, strokeDashoffset: 1, animation: "hw-draw var(--hw-motion-draw) var(--hw-motion-ease-in-out) 1.6s forwards" }}
      />,
    );
  }

  const pos = new Map<string, { x0: number; y: number; runEnd: number; intent: IntentView; merged: boolean }>();
  const chips: ReactElement[] = [];
  let k = 0;
  for (const p of layout.intents) {
    const { intent: it, fork: fx, x0 } = p;
    els.push(
      <text
        key={`il-${it.id}`}
        x={x0}
        y={p.labelY}
        fontFamily="var(--hw-font-display)"
        fontStyle="italic"
        fontSize={13.5}
        fill="var(--hw-color-ink-3)"
        style={onIntent ? { cursor: "pointer" } : undefined}
        onClick={onIntent ? () => onIntent(it) : undefined}
      >
        {it.title}
      </text>,
    );
    it.channels.forEach((c, ci) => {
      const y = p.ys[ci]!;
      const state = channelState(c, p.merged);
      const isMerged = state === "merged";
      const progress = Math.max(0, Math.min(1, c.progress));
      const runEnd = isMerged ? MERGED_RUN_END : x0 + (X_END - x0) * progress;
      let d = `M${fx} ${my} C${fx + 70} ${my} ${x0 - 70} ${y} ${x0} ${y} H${runEnd}`;
      if (isMerged) d += ` C${runEnd + 60} ${y} ${X_END - 60} ${my} ${X_END} ${my}`;
      const stroke = channelStroke(state);
      const delay = 0.15 + k * 0.08;
      els.push(<ChannelLine key={`c-${c.id}`} d={d} state={state} drawDelay={delay} reduced={reduced} {...(c.headSha ? { pulseKey: c.headSha } : {})} />);
      c.marks.forEach((f, j) => {
        const last = j === c.marks.length - 1;
        const title = `${c.id} · commit ${j + 1} of ${Math.max(c.commits, c.marks.length)}${last && c.headSha ? ` · ${c.headSha.slice(0, 7)}` : ""}`;
        els.push(
          <CommitDot
            key={`d-${c.id}-${j}`}
            cx={x0 + (X_END - x0) * f}
            cy={y}
            color={stroke}
            enterDelay={delay + 0.9 * f}
            reduced={reduced}
            title={title}
            {...(onCommit && last && c.headSha ? { onClick: () => onCommit(c, it) } : {})}
          />,
        );
      });
      pos.set(c.id, { x0, y, runEnd, intent: it, merged: isMerged });
      if (!isMerged) {
        chips.push(
          <AgentChipSvg
            key={`chip-${c.id}`}
            channel={c}
            x={runEnd}
            y={y}
            status={c.statusText}
            statusColor={statusColor(c)}
            tone={chipTone(state)}
            pulseDelay={k * 0.25}
            enterDelay={delay + 0.9}
            reduced={reduced}
            maxX={W + 30}
            {...(onChannel ? { onClick: () => onChannel(c, it) } : {})}
          />,
        );
      }
      k++;
    });
  }
  els.push(...chips);

  if (merged) {
    const yours = river.feed.filter((e) => e.type === "confluence.picked" && e.by === "you").length;
    const n = river.intents.length;
    els.push(
      <text key="mt" x={X_END + 12} y={my - 14} fontFamily="var(--hw-font-mono)" fontSize={12} fill="var(--hw-color-ink)">
        main @ {river.head ?? "—"}
      </text>,
      <text key="mt2" x={X_END + 12} y={my + 24} fontFamily="var(--hw-font-ui)" fontSize={12} fill="var(--hw-color-ink-3)">
        {n === 1 ? "1 intent merged" : `${n} intents merged`}
      </text>,
      <text key="mt3" x={X_END + 12} y={my + 42} fontFamily="var(--hw-font-ui)" fontSize={12} fill="var(--hw-color-ink-3)">
        {yours === 0 ? "no decision needed you" : yours === 1 ? "1 decision was yours" : `${yours} decisions were yours`}
      </text>,
    );
  }

  river.overlaps.forEach((o, oi) => els.push(...shoal(o, oi, pos, my, reduced)));

  return (
    <svg
      viewBox={`0 ${layout.vy} ${W} ${layout.vh}`}
      width="100%"
      role="img"
      aria-label={`${river.name}: ${river.intents.length} intents on the mainline`}
      style={{ display: "block", overflow: "visible", maxHeight: "100%" }}
    >
      {els}
    </svg>
  );
}

/** A shoal: two Channels claim the same path. Ellipses on both, a dashed rose connector, a tooltip. */
function shoal(
  o: ChannelOverlap,
  oi: number,
  pos: Map<string, { x0: number; y: number; runEnd: number; intent: IntentView; merged: boolean }>,
  my: number,
  reduced: boolean,
): ReactElement[] {
  const a = pos.get(o.a);
  const b = pos.get(o.b);
  if (!a || !b || a.merged || b.merged) return [];
  const lo = Math.max(a.x0, b.x0) + 24;
  const hi = Math.min(a.runEnd, b.runEnd) - 24;
  const sx = hi >= lo ? Math.min(Math.max(SHOAL_X, lo), hi) : lo;
  const fade = (delay: number) => (reduced ? undefined : { animation: `hw-fade-in 0.6s var(--hw-motion-ease-out) ${delay}s both` });
  const who =
    a.intent.id === b.intent.id
      ? `${o.a} and ${o.b} both claim`
      : `${o.a} (${intentShortName(a.intent.title)}) and ${o.b} (${intentShortName(b.intent.title)}) both claim`;
  const w = Math.max(356, who.length * 6.6 + 28, o.path.length * 7.3 + 28);
  const tx = Math.min(sx + 18, W + 30 - w);
  const ty = my + 8 + oi * 56;
  const key = `shoal-${o.a}-${o.b}-${oi}`;
  return [
    <path key={`${key}-l`} d={`M${sx} ${a.y} V${b.y}`} stroke="var(--hw-color-conflict)" strokeWidth={1} strokeDasharray="3 4" opacity={0.55} style={fade(1.2)} />,
    ...[a, b].map((p, i) => (
      <ellipse key={`${key}-${i}`} cx={sx} cy={p.y} rx={16} ry={6} fill="var(--hw-color-conflict-soft)" stroke="var(--hw-color-conflict)" strokeWidth={1} style={fade(1.2)} />
    )),
    <g key={`${key}-tip`} transform={`translate(${tx} ${ty})`} style={fade(1.6)}>
      <rect width={w} height={48} rx={6} fill="var(--hw-color-surface)" stroke="var(--hw-color-conflict)" />
      <text x={14} y={19} fontFamily="var(--hw-font-ui)" fontSize={12.5} fill="var(--hw-color-ink)">
        {who}
      </text>
      <text x={14} y={37} fontFamily="var(--hw-font-mono)" fontSize={12} fill="var(--hw-color-conflict)">
        {o.path}
      </text>
    </g>,
  ];
}
