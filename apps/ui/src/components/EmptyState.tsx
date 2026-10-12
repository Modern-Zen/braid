// Empty states: a single calm line and one sentence. No illustration, no gradient.
//   River  mainline 2px across · "A quiet river." · Open an Intent
//   Eddy   hairline 1.5px, gentle S · "Nothing needs you. The river is running."
//   Scout  skeleton previews · "Scout is watching"
// Type: Lora 22 ink-2, centered.
import type { ReactElement } from "react";
import { buttonClass, buttonStyle } from "./buttons.ts";
import { PreviewSkeleton } from "./PreviewCard.tsx";
import { VerdictBanner } from "./VerdictBanner.tsx";

const sentence = { fontFamily: "var(--hw-font-display)", fontSize: 22, color: "var(--hw-color-ink-2)" } as const;

export type EmptyStateProps =
  | { variant: "river"; onOpenIntent?: () => void; label?: string }
  | { variant: "eddy" }
  | { variant: "scout"; text?: string; channels?: number };

export function EmptyState(props: EmptyStateProps): ReactElement {
  switch (props.variant) {
    case "river":
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, position: "relative" }}>
          <svg
            viewBox="0 0 1000 40"
            width="100%"
            height="40"
            fill="none"
            stroke="var(--hw-color-mainline)"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
            style={{ position: "absolute", left: 0, right: 0, top: "50%", marginTop: -20, opacity: 0.9 }}
          >
            <path d="M0 20 H1000" />
          </svg>
          <div style={{ position: "relative", background: "var(--hw-color-paper)", padding: "0 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={sentence}>{props.label ?? "A quiet river."}</div>
            {props.onOpenIntent ? (
              <button type="button" className={buttonClass("primary")} style={buttonStyle("primary", "13px 22px")} onClick={props.onOpenIntent}>
                Open an Intent
              </button>
            ) : null}
          </div>
        </div>
      );
    case "eddy":
      return (
        <div style={{ width: "100%", maxWidth: 760, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, minHeight: 360 }}>
          <svg viewBox="0 0 760 24" width="100%" height="24" fill="none" stroke="var(--hw-color-mainline)" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
            <path d="M0 12 C120 12 160 10 260 10 S420 14 520 14 S680 12 760 12" />
          </svg>
          <div style={{ ...sentence, textAlign: "center" }}>Nothing needs you. The river is running.</div>
        </div>
      );
    case "scout": {
      const n = props.channels ?? 3;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <VerdictBanner state="watching" text={props.text ?? "No Channels are running yet. Previews and tests will appear here as they land."} actions={null} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} style={{ border: "1px solid var(--hw-color-line)", background: "var(--hw-color-surface)", borderRadius: "var(--hw-radius-lg)", overflow: "hidden" }}>
                <div style={{ height: 49, borderBottom: "1px solid var(--hw-color-line)" }} />
                <PreviewSkeleton />
              </div>
            ))}
          </div>
        </div>
      );
    }
  }
}
