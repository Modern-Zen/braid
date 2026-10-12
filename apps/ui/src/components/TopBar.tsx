// Top bar: River name, HEAD, and the counter. Nothing else.
// 56px · 1px line bottom · pad 0×32 · name Lora 500 18 · HEAD mono 12 chip, pad 4×8, radius 6 ·
// counter right-aligned, Inter 13, nowrap · theme: 32px outlined toggle, ink-3.
import type { ReactElement } from "react";
import { MoonIcon } from "./icons.tsx";
import { StatCounter, type Counts } from "./StatCounter.tsx";

export interface TopBarProps {
  name: string;
  head: string | null;
  counts: Counts;
  onToggleTheme: () => void;
}

export function TopBar({ name, head, counts, onToggleTheme }: TopBarProps): ReactElement {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 32px",
        borderBottom: "1px solid var(--hw-color-line)",
        background: "var(--hw-color-paper)",
        minWidth: 0,
      }}
    >
      <div style={{ fontFamily: "var(--hw-font-display)", fontSize: 18, fontWeight: 500 }}>{name}</div>
      <div
        style={{
          fontFamily: "var(--hw-font-mono)",
          fontSize: 12,
          color: "var(--hw-color-ink-2)",
          padding: "4px 8px",
          border: "1px solid var(--hw-color-line)",
          borderRadius: "var(--hw-radius-sm)",
          background: "var(--hw-color-surface)",
          whiteSpace: "nowrap",
        }}
      >
        main @ {head ?? "—"}
      </div>
      <StatCounter variant="topbar" {...counts} style={{ marginLeft: "auto" }} />
      <button
        type="button"
        onClick={onToggleTheme}
        aria-label="Toggle theme"
        className="hw-icon-btn"
        style={{
          width: 32,
          height: 32,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--hw-radius-md)",
          border: "1px solid var(--hw-color-line)",
          background: "transparent",
          color: "var(--hw-color-ink-3)",
          cursor: "pointer",
          flex: "none",
        }}
      >
        <MoonIcon size={14} />
      </button>
    </header>
  );
}
