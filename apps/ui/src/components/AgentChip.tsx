// Agent chip: names a Channel and the agent working it. Lives at the head of a
// channel line (SVG, on the River map) and in Scout column headers (HTML).
// Spec: h 22 · pad 3×8 · radius 4 · mono 11 ink; status mono 11 ink-3 4px below.
// Dot r 3.5 + r 9 halo (channel-glow), hw-pulse 2.4s.
// States: active teal · merged ink-4 · conflict rose · human amber (dot only).
// Honest labels: the agent comes from data. Replayed (scripted) work carries a "replay" tag.
import type { CSSProperties, ReactElement } from "react";

export type ChipTone = "active" | "merged" | "conflict" | "human";

const DOT: Record<ChipTone, string> = {
  active: "var(--hw-color-channel)",
  merged: "var(--hw-color-ink-4)",
  conflict: "var(--hw-color-conflict)",
  human: "var(--hw-color-human)",
};
const GLOW: Record<ChipTone, string> = {
  active: "var(--hw-color-channel-glow)",
  merged: "transparent",
  conflict: "var(--hw-color-conflict-soft)",
  human: "var(--hw-color-human-soft)",
};

export interface ChipIdentity {
  id: string;
  agent: string;
  strategy?: string;
  replay?: boolean;
}

export function chipLabel(c: ChipIdentity): string {
  return [c.id, c.agent, c.strategy].filter(Boolean).join(" · ");
}

/** Mono width estimate used by the design (11px mono ≈ 6.7px per glyph). */
const GLYPH = 6.7;
const REPLAY_W = 46;

/** Width of the SVG chip for a label. */
export function chipWidth(c: ChipIdentity): number {
  return chipLabel(c).length * GLYPH + 16 + (c.replay ? REPLAY_W + 6 : 0);
}

export interface AgentChipSvgProps {
  channel: ChipIdentity;
  /** The channel's run end; the chip's dot sits here. */
  x: number;
  y: number;
  status?: string;
  statusColor?: string;
  tone?: ChipTone;
  /** Delay for the halo's breathing, so neighbours don't pulse in lockstep. */
  pulseDelay?: number;
  /** Fade in when the line reaches the chip (seconds). */
  enterDelay?: number;
  reduced?: boolean;
  /** Flip the chip to the left of the dot if it would cross this x. */
  maxX?: number;
  onClick?: () => void;
}

/** The River map chip: dot at (x, y), chip 10px to its right, status 4px below. */
export function AgentChipSvg({
  channel,
  x,
  y,
  status,
  statusColor = "var(--hw-color-ink-3)",
  tone = "active",
  pulseDelay = 0,
  enterDelay,
  reduced = false,
  maxX = Infinity,
  onClick,
}: AgentChipSvgProps): ReactElement {
  const label = chipLabel(channel);
  const w = chipWidth(channel);
  const flip = x + 10 + w > maxX;
  const chipX = flip ? x - 10 - w : x + 10;
  const dotX = x - chipX;
  const enter: CSSProperties | undefined =
    reduced || enterDelay === undefined ? undefined : { opacity: 0, animation: `hw-fade-in 0.5s var(--hw-motion-ease-out) ${enterDelay}s forwards` };
  return (
    <g transform={`translate(${chipX} ${y - 11})`} style={{ ...enter, cursor: onClick ? "pointer" : undefined }} onClick={onClick}>
      <circle cx={dotX} cy={11} r={7} fill={GLOW[tone]} style={{ animation: `hw-pulse var(--hw-motion-pulse) var(--hw-motion-ease-in-out) ${pulseDelay}s infinite` }} />
      <circle cx={dotX} cy={11} r={3.5} fill={DOT[tone]} />
      <rect width={w} height={22} rx={4} fill="var(--hw-color-surface)" stroke="var(--hw-color-line)" />
      <text x={8} y={15} fontFamily="var(--hw-font-mono)" fontSize={11} fill="var(--hw-color-ink)">
        {label}
      </text>
      {channel.replay ? (
        <g transform={`translate(${8 + label.length * GLYPH + 6} 4)`}>
          <rect width={REPLAY_W} height={14} rx={4} fill="none" stroke="var(--hw-color-line)" />
          <text x={REPLAY_W / 2} y={10.5} textAnchor="middle" fontFamily="var(--hw-font-mono)" fontSize={10.5} fill="var(--hw-color-ink-4)">
            replay
          </text>
        </g>
      ) : null}
      {status ? (
        <text x={flip ? w : 0} y={38} textAnchor={flip ? "end" : "start"} fontFamily="var(--hw-font-mono)" fontSize={11} fill={statusColor}>
          {status}
        </text>
      ) : null}
      <title>{channel.replay ? `${label} · replay of a recorded run` : label}</title>
    </g>
  );
}

/** The "replay" tag: mono 10.5, ink-4, 1px line border, radius 4. */
export function ReplayTag(): ReactElement {
  return (
    <span
      title="Replay of a recorded run"
      style={{
        fontFamily: "var(--hw-font-mono)",
        fontSize: 10.5,
        lineHeight: "14px",
        color: "var(--hw-color-ink-4)",
        border: "1px solid var(--hw-color-line)",
        borderRadius: 4,
        padding: "0 4px",
        whiteSpace: "nowrap",
      }}
    >
      replay
    </span>
  );
}

export interface AgentChipProps {
  channel: ChipIdentity;
  tone?: ChipTone;
  /** Framed: the bordered chip from the spec. Bare: Scout's column header. */
  framed?: boolean;
  status?: string;
}

/** HTML chip: Scout column headers (bare) and anywhere else a Channel is named (framed). */
export function AgentChip({ channel, tone = "active", framed = false, status }: AgentChipProps): ReactElement {
  const dot = (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: DOT[tone],
        display: "inline-block",
        flex: "none",
        boxShadow: `0 0 0 3px ${GLOW[tone]}`,
      }}
    />
  );
  const rest = [channel.agent, channel.strategy].filter(Boolean).join(" · ");
  if (!framed) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {dot}
        <span style={{ fontFamily: "var(--hw-font-mono)", fontSize: 12, color: "var(--hw-color-ink)", whiteSpace: "nowrap" }}>{channel.id}</span>
        <span style={{ fontFamily: "var(--hw-font-mono)", fontSize: 12, color: "var(--hw-color-ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          · {rest}
        </span>
        {channel.replay ? <ReplayTag /> : null}
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {dot}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--hw-font-mono)",
          fontSize: 11.5,
          padding: "3px 8px",
          borderRadius: 4,
          border: "1px solid var(--hw-color-line)",
          background: "var(--hw-color-surface)",
          color: "var(--hw-color-ink)",
        }}
      >
        {chipLabel(channel)}
        {channel.replay ? <ReplayTag /> : null}
      </span>
      {status ? <span style={{ fontFamily: "var(--hw-font-mono)", fontSize: 11.5, color: "var(--hw-color-ink-3)" }}>{status}</span> : null}
    </span>
  );
}
