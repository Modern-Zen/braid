// Trailer tag: a Git commit trailer rendered as a tag. Key muted, value ink.
// pad 3×8 · radius 4 · 1px line · mono 11.5 · key ink-4 · value ink-2 · flex, 6px gap.
import type { ReactElement } from "react";

export function TrailerTag({ k, v }: { k: string; v: string }): ReactElement {
  return (
    <span
      style={{
        fontFamily: "var(--hw-font-mono)",
        fontSize: 11.5,
        padding: "3px 8px",
        borderRadius: "var(--hw-radius-xs)",
        border: "1px solid var(--hw-color-line)",
        color: "var(--hw-color-ink-2)",
        background: "var(--hw-color-paper)",
      }}
    >
      <span style={{ color: "var(--hw-color-ink-4)" }}>{k}:</span> {v}
    </span>
  );
}

export function TrailerTags({ trailers }: { trailers: Array<{ key: string; value: string }> }): ReactElement {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {trailers.map((t) => (
        <TrailerTag key={t.key} k={t.key} v={t.value} />
      ))}
    </div>
  );
}
