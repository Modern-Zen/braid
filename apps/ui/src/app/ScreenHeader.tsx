import type { ReactElement, ReactNode } from "react";

/** "River  3 intents · 9 channels running": Lora 500 24 + Inter 13 ink-3, baseline-aligned. */
export function ScreenHeader({ title, children, align = "baseline" }: { title: string; children?: ReactNode; align?: "baseline" | "center" }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: align, gap: align === "center" ? 16 : 12 }}>
      <h1 style={{ margin: 0, fontFamily: "var(--hw-font-display)", fontWeight: 500, fontSize: 24, letterSpacing: "-0.01em" }}>{title}</h1>
      {children}
    </div>
  );
}

export function Subtitle({ children }: { children: ReactNode }): ReactElement {
  return <span style={{ fontSize: 13, color: "var(--hw-color-ink-3)" }}>{children}</span>;
}
