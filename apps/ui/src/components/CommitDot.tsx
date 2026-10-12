// Commit dot: one per commit, placed along the channel where it landed. The open ring is HEAD.
// r 3 filled · HEAD r 5, paper fill, 1.5px stroke · inherits the channel stroke ·
// hw-fade-in 400ms as the line reaches it · hit area ≥ 16px with a tooltip.
import type { CSSProperties, ReactElement } from "react";

export interface CommitDotProps {
  cx: number;
  cy: number;
  color: string;
  head?: boolean;
  /** Seconds until the drawing line reaches this dot. Omit to render at rest. */
  enterDelay?: number;
  reduced?: boolean;
  /** Tooltip: hash + message. */
  title?: string;
  onClick?: () => void;
}

export function CommitDot({ cx, cy, color, head = false, enterDelay, reduced = false, title, onClick }: CommitDotProps): ReactElement {
  const enter: CSSProperties | undefined =
    reduced || enterDelay === undefined ? undefined : { opacity: 0, animation: `hw-fade-in 0.4s var(--hw-motion-ease-out) ${enterDelay}s forwards` };
  return (
    <g style={{ ...enter, cursor: onClick ? "pointer" : undefined }} onClick={onClick}>
      <circle cx={cx} cy={cy} r={8} fill="transparent" pointerEvents="all" />
      {head ? (
        <circle cx={cx} cy={cy} r={5} fill="var(--hw-color-paper)" stroke={color} strokeWidth={1.5} />
      ) : (
        <circle cx={cx} cy={cy} r={3} fill={color} />
      )}
      {title ? <title>{title}</title> : null}
    </g>
  );
}
