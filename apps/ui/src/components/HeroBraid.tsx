// The hero braid: a mainline splits into n channels that run side by side and
// rejoin as a bolder mainline. Ported 1:1 from Headwaters Landing.dc.html `braid()`.
// Geometry: viewBox 1200×360, fork/rejoin are cubic Béziers with horizontal
// tangents 110px either side of the bend, ±9px S-drift on the run.
// Timing: hw-draw 900ms per path; channel i at 0.5s + 0.1s·i; agents ride the path
// with SMIL animateMotion (13s + 1.3s·i); one channel carries the 14s amber "human" loop.
import type { CSSProperties, ReactElement } from "react";
import { prefersReducedMotion } from "../theme.ts";

export interface HeroBraidProps {
  /** Number of channels, 3–9. */
  channels?: number;
  /** Labels per channel. Pass real agent names when showing live data. */
  labels?: string[];
  /** One channel turns amber for a moment: a person has a decision to make. */
  humanMoment?: boolean;
}

const W = 1200;
const CY = 180;
const X1 = 150;
const X2 = 380;
const X3 = 860;
const X4 = 1060;
const DRAW = 0.9;

export function channelPath(y: number, drift: number): string {
  const xm = (X2 + X3) / 2;
  return (
    `M${X1} ${CY} C${X1 + 110} ${CY} ${X2 - 110} ${y} ${X2} ${y}` +
    ` C${xm - 130} ${y} ${xm - 70} ${y + drift} ${xm} ${y + drift}` +
    ` C${xm + 70} ${y + drift} ${xm + 130} ${y} ${X3} ${y}` +
    ` C${X3 + 110} ${y} ${X4 - 110} ${CY} ${X4} ${CY}`
  );
}

export function HeroBraid({ channels = 7, labels, humanMoment = true }: HeroBraidProps): ReactElement {
  const n = Math.max(3, Math.min(9, channels));
  const reduced = prefersReducedMotion();
  const spread = 11 * (n - 1) + 8;

  const lineStyle = (delay: number, extra?: string): CSSProperties => ({
    strokeDasharray: 1,
    strokeDashoffset: reduced ? 0 : 1,
    animation: reduced
      ? extra ?? "none"
      : `hw-draw ${DRAW}s var(--hw-motion-ease-in-out) ${delay}s forwards${extra ? `, ${extra}` : ""}`,
  });

  const paths: ReactElement[] = [
    <path key="main-l" d={`M0 ${CY} H${X1}`} fill="none" stroke="var(--hw-color-mainline)" strokeWidth={2.5} strokeLinecap="round" pathLength={1} style={lineStyle(0)} />,
  ];
  const dots: ReactElement[] = [];

  for (let i = 0; i < n; i++) {
    const y = CY - spread + i * ((2 * spread) / (n - 1));
    const drift = i % 2 ? 9 : -9;
    const d = channelPath(y, drift);
    const isHuman = humanMoment && i === Math.floor(n / 2);
    const delay = 0.5 + i * 0.1;
    const humanAnim = `hw-human 14s var(--hw-motion-ease-in-out) ${delay + DRAW + 2}s infinite`;
    paths.push(
      <path key={`ch${i}`} d={d} fill="none" stroke="var(--hw-color-channel)" strokeWidth={1.5} strokeLinecap="round" pathLength={1} style={lineStyle(delay, isHuman ? humanAnim : undefined)} />,
    );

    const label = labels?.[i] ?? `ch-${i + 1}`;
    const dotStyle: CSSProperties = isHuman
      ? { animation: `hw-human-fill 14s var(--hw-motion-ease-in-out) ${delay + DRAW + 2}s infinite` }
      : {};
    const children = [
      <circle key="g" r={9} fill="var(--hw-color-channel-glow)" style={{ animation: `hw-pulse var(--hw-motion-pulse) var(--hw-motion-ease-in-out) ${i * 0.3}s infinite` }} />,
      <circle key="d" r={3.5} fill="var(--hw-color-channel)" style={dotStyle} />,
      <text key="t" x={12} y={-8} fontFamily="var(--hw-font-mono)" fontSize={11} fill="var(--hw-color-ink-3)">
        {label}
      </text>,
    ];
    if (reduced) {
      const sx = X2 + (X3 - X2) * (0.15 + 0.7 * (i / (n - 1)));
      dots.push(
        <g key={`dot${i}`} transform={`translate(${sx} ${y})`}>
          {children}
        </g>,
      );
    } else {
      const begin = delay + DRAW;
      dots.push(
        <g key={`dot${i}`} style={{ opacity: 0, animation: `hw-fade-in 0.6s var(--hw-motion-ease-out) ${begin}s forwards` }}>
          {children}
          <animateMotion dur={`${13 + i * 1.3}s`} begin={`${begin}s`} repeatCount="indefinite" path={d} calcMode="spline" keyTimes="0;1" keySplines="0.45 0 0.55 1" />
        </g>,
      );
    }
  }

  paths.push(
    <path key="main-r" d={`M${X4} ${CY} H${W}`} fill="none" stroke="var(--hw-color-mainline)" strokeWidth={3.5} strokeLinecap="round" pathLength={1} style={lineStyle(0.5 + n * 0.1 + DRAW * 0.6)} />,
  );

  return (
    <svg viewBox={`0 0 ${W} 360`} width="100%" style={{ display: "block", overflow: "visible", height: "auto" }} role="img" aria-label="A single line splits into parallel channels and rejoins as a bolder mainline">
      {paths}
      {dots}
    </svg>
  );
}
