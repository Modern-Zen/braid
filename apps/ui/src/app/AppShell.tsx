// App shell placeholder for M0: the River's empty state, wearing the tokens.
// Screens A–D (River, Scout, Eddy, Logbook) are ported from Headwaters App.dc.html in M6.
import type { ReactElement } from "react";
import { BraidMark } from "../landing/Landing.tsx";
import { useTheme } from "../theme.ts";

export function AppShell(): ReactElement {
  const [, toggle] = useTheme();
  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "var(--hw-rail-width) minmax(0,1fr)",
        gridTemplateRows: "var(--hw-topbar-height) minmax(0,1fr)",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <aside style={{ gridRow: "1 / span 2", borderRight: "1px solid var(--hw-color-line)", background: "var(--hw-color-surface-2)", padding: "16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 20px" }}>
          <BraidMark size={26} />
          <span style={{ fontFamily: "var(--hw-font-display)", fontSize: 17, fontWeight: 500 }}>Headwaters</span>
        </div>
      </aside>
      <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 32px", borderBottom: "1px solid var(--hw-color-line)" }}>
        <div style={{ fontFamily: "var(--hw-font-display)", fontSize: 18, fontWeight: 500 }}>Headwaters</div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--hw-color-ink-3)" }}>nothing for you</div>
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          style={{ width: 32, height: 32, borderRadius: "var(--hw-radius-md)", border: "1px solid var(--hw-color-line)", background: "transparent", color: "var(--hw-color-ink-3)", cursor: "pointer" }}
        >
          ◐
        </button>
      </header>
      <main style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg viewBox="0 0 1000 40" width="100%" height="40" fill="none" stroke="var(--hw-color-mainline)" strokeWidth={2} strokeLinecap="round" style={{ position: "absolute", left: 0, right: 0, top: "50%", marginTop: -20, opacity: 0.9 }}>
          <path d="M0 20 H1000" />
        </svg>
        <div style={{ position: "relative", background: "var(--hw-color-paper)", padding: "0 24px", fontFamily: "var(--hw-font-display)", fontSize: 22, color: "var(--hw-color-ink-2)" }}>
          A quiet river.
        </div>
      </main>
    </div>
  );
}
