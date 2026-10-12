// Verdict banner: the judge's ranking and a two-sentence rationale. Border color is the state.
// pad 20×24 · radius 12 · grid 1fr auto ·
// Watching: border line, label ink-3 · Ready: border teal, label teal, rank chips mono 11.5 ·
// Tie: border amber, bg human-soft, two amber buttons · Rationale Lora 17/1.45, max-w 760.
import type { ReactElement, ReactNode } from "react";

export type VerdictState = "watching" | "ready" | "tie";

const LOOK: Record<VerdictState, { label: string; border: string; bg: string; color: string }> = {
  watching: { label: "Scout is watching", border: "var(--hw-color-line)", bg: "var(--hw-color-surface)", color: "var(--hw-color-ink-3)" },
  ready: { label: "Verdict", border: "var(--hw-color-channel)", bg: "var(--hw-color-surface)", color: "var(--hw-color-channel)" },
  tie: { label: "Tie · your call", border: "var(--hw-color-human)", bg: "var(--hw-color-human-soft)", color: "var(--hw-color-human)" },
};

export interface VerdictBannerProps {
  state: VerdictState;
  text: string;
  /** Ranked Channels, best first: "1 · ch-2", "2 · ch-3", "3 · ch-1". */
  ranks?: Array<{ rank: number; id: string }>;
  /** Buttons (Pick ch-n) or the "Verdict in ~1m" note. */
  actions?: ReactNode;
}

export function VerdictBanner({ state, text, ranks = [], actions }: VerdictBannerProps): ReactElement {
  const look = LOOK[state];
  return (
    <div
      style={{
        border: `1px solid ${look.border}`,
        background: look.bg,
        borderRadius: "var(--hw-radius-lg)",
        padding: "20px 24px",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        gap: 24,
        alignItems: "center",
        transition: "border-color var(--hw-motion-slow) var(--hw-motion-ease-out), background var(--hw-motion-slow) var(--hw-motion-ease-out)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: look.color,
          }}
        >
          <span>{look.label}</span>
          {state !== "watching" && ranks.length > 0 ? (
            <span
              style={{
                display: "inline-flex",
                gap: 6,
                fontFamily: "var(--hw-font-mono)",
                fontSize: 11.5,
                letterSpacing: 0,
                textTransform: "none",
                fontWeight: 500,
                color: "var(--hw-color-ink-2)",
              }}
            >
              {ranks.map((r, i) => (
                <span
                  key={r.id}
                  style={
                    i === 0
                      ? { padding: "2px 7px", borderRadius: "var(--hw-radius-xs)", background: "var(--hw-color-channel-soft)", color: "var(--hw-color-channel)" }
                      : { padding: "2px 7px", borderRadius: "var(--hw-radius-xs)", border: "1px solid var(--hw-color-line)" }
                  }
                >
                  {r.rank} · {r.id}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--hw-font-display)",
            fontSize: 17,
            lineHeight: 1.45,
            color: "var(--hw-color-ink)",
            maxWidth: 760,
            textWrap: "pretty",
          }}
        >
          {text}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>
    </div>
  );
}
