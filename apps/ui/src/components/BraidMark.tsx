// The Headwaters mark: one line splits into three channels.
import type { ReactElement } from "react";

export function BraidMark({ size = 28 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={(size * 20) / 28} viewBox="0 0 28 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M1 10 H6 C10 10 10 4 14 4 H27" />
      <path d="M6 10 H27" />
      <path d="M6 10 C10 10 10 16 14 16 H27" />
    </svg>
  );
}
