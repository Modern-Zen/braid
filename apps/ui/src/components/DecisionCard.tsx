// Decision card: one question, the minimum context, one to three actions.
// The amber edge means a person is needed.
// max-w 760 · pad 24×28 · radius 12 · 3px amber bar left · question Lora 22 ·
// meta mono 11.5 ink-3 · context Inter 15/1.6 ink-2 · actions 8px gap · shadow-sm on surface.
import type { ReactElement } from "react";
import type { EddyCard } from "@braid/protocol";
import { buttonClass, buttonStyle } from "./buttons.ts";

export interface DecisionCardProps {
  card: Pick<EddyCard, "id" | "question" | "meta" | "context" | "actions">;
  onAction?: (actionId: string) => void;
  /** The action in flight, if any. */
  pending?: string | null;
}

export function DecisionCard({ card, onAction, pending }: DecisionCardProps): ReactElement {
  return (
    <article
      style={{
        border: "1px solid var(--hw-color-line)",
        borderLeft: "none",
        background: "var(--hw-color-surface)",
        borderRadius: "var(--hw-radius-lg)",
        boxShadow: "var(--hw-shadow-sm)",
        padding: "24px 28px",
        display: "grid",
        gridTemplateColumns: "4px minmax(0,1fr)",
        gap: "0 22px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "var(--hw-color-human)" }} />
      <span />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--hw-font-display)", fontWeight: 500, fontSize: 22, letterSpacing: "-0.01em" }}>{card.question}</h2>
          <span style={{ fontFamily: "var(--hw-font-mono)", fontSize: 11.5, color: "var(--hw-color-ink-3)" }}>{card.meta}</span>
        </div>
        <p style={{ margin: 0, color: "var(--hw-color-ink-2)", lineHeight: 1.6, textWrap: "pretty" }}>{card.context}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {card.actions.slice(0, 3).map((a) => (
            <button
              key={a.id}
              type="button"
              className={buttonClass(a.style)}
              style={buttonStyle(a.style, "12px 18px", "0.14em")}
              disabled={pending != null}
              aria-busy={pending === a.id}
              onClick={() => onAction?.(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}
