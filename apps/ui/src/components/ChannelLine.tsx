// Channel line: a single SVG path. Width and color carry state; the shape never changes.
// Idle line-strong 1px · active channel 1.5px · pushed channel 2px for 1200ms then 1.5 ·
// merged ink-4 1.5px · conflict rose dashed 3 4 (the shoal connector only).
// Draw: pathLength 1 · dasharray 1 · hw-draw 900ms.
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";

export type ChannelState = "idle" | "active" | "pushed" | "merged" | "conflict";

const STROKE: Record<ChannelState, string> = {
  idle: "var(--hw-color-line-strong)",
  active: "var(--hw-color-channel)",
  pushed: "var(--hw-color-channel)",
  merged: "var(--hw-color-ink-4)",
  conflict: "var(--hw-color-conflict)",
};
const WIDTH: Record<ChannelState, number> = { idle: 1, active: 1.5, pushed: 2, merged: 1.5, conflict: 1.5 };

export function channelStroke(state: ChannelState): string {
  return STROKE[state];
}

export interface ChannelLineProps {
  d: string;
  state: ChannelState;
  /** Draw on with hw-draw after this many seconds. Omit to render drawn. */
  drawDelay?: number;
  reduced?: boolean;
  /** Changes when the channel pushes (e.g. its head sha): the line swells to 2px for 1200ms. */
  pulseKey?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

export function ChannelLine({ d, state, drawDelay, reduced = false, pulseKey, strokeWidth, style }: ChannelLineProps): ReactElement {
  const pushed = usePushPulse(pulseKey);
  const width = strokeWidth ?? (pushed && state === "active" ? WIDTH.pushed : WIDTH[state]);
  const dashed = state === "conflict";
  const draw: CSSProperties =
    drawDelay === undefined || reduced || dashed
      ? {}
      : { strokeDasharray: 1, strokeDashoffset: 1, animation: `hw-draw var(--hw-motion-draw) var(--hw-motion-ease-in-out) ${drawDelay}s forwards` };
  return (
    <path
      d={d}
      fill="none"
      stroke={STROKE[state]}
      strokeWidth={width}
      strokeLinecap="round"
      {...(dashed ? { strokeDasharray: "3 4" } : { pathLength: 1 })}
      style={{ transition: "stroke-width var(--hw-motion-base) var(--hw-motion-ease-out), stroke var(--hw-motion-slow) var(--hw-motion-ease-out)", ...draw, ...style }}
    />
  );
}

/** True for 1200ms after `key` changes (never on first render). */
function usePushPulse(key: string | undefined): boolean {
  const [on, setOn] = useState(false);
  const first = useRef(key);
  useEffect(() => {
    if (key === undefined || key === first.current) return;
    first.current = key;
    setOn(true);
    const t = setTimeout(() => setOn(false), 1200);
    return () => clearTimeout(t);
  }, [key]);
  return on;
}
