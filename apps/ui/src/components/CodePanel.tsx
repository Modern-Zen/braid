// Code panel: dark in both modes. Accent is teal; prompt glyphs are ink-4.
// code-bg · radius 12 · pad 24×28 · mono 12–13 / 1.7, code-fg · pre-wrap, never a horizontal scrollbar.
import type { CSSProperties, ReactElement, ReactNode } from "react";

export interface CodePanelProps {
  /** Small uppercase caption above the code ("MCP", "Git"). */
  label?: string;
  children: ReactNode;
  lineHeight?: number;
  /** URLs break anywhere; prose-ish code breaks at words. */
  breakAll?: boolean;
  style?: CSSProperties;
}

export function CodePanel({ label, children, lineHeight = 1.7, breakAll = false, style }: CodePanelProps): ReactElement {
  return (
    <div
      style={{
        background: "var(--hw-color-code-bg)",
        color: "var(--hw-color-code-fg)",
        borderRadius: "var(--hw-radius-lg)",
        padding: "24px 28px",
        fontFamily: "var(--hw-font-mono)",
        fontSize: 12,
        lineHeight,
        minWidth: 0,
        ...style,
      }}
    >
      {label ? (
        <div
          style={{
            fontFamily: "var(--hw-font-ui)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--hw-color-ink-4)",
            marginBottom: 16,
          }}
        >
          {label}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", whiteSpace: "pre-wrap", wordBreak: breakAll ? "break-all" : "break-word" }}>{children}</div>
    </div>
  );
}

/** A shell prompt glyph. */
export function Prompt(): ReactElement {
  return <span style={{ color: "var(--hw-color-ink-4)" }}>$</span>;
}

/** An identifier the reader should read. */
export function Accent({ children }: { children: ReactNode }): ReactElement {
  return <span style={{ color: "var(--hw-color-code-accent)" }}>{children}</span>;
}
