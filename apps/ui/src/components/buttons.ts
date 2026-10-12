// Button recipes from the design. Hover lives in base.css (color/border shifts only).
import type { CSSProperties } from "react";

export type ButtonKind = "primary" | "secondary" | "tertiary" | "human" | "human-outline";

const CLASS: Record<ButtonKind, string> = {
  primary: "hw-btn",
  secondary: "hw-btn-outline",
  tertiary: "hw-btn-text",
  human: "hw-btn-human",
  "human-outline": "hw-btn-human-outline",
};

export function buttonClass(kind: ButtonKind): string {
  return CLASS[kind];
}

/** Uppercase label buttons: primary ink/paper · secondary outlined · tertiary text ink-3. */
export function buttonStyle(kind: ButtonKind, padding = "13px 20px", tracking = "0.16em"): CSSProperties {
  const base: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: tracking,
    textTransform: "uppercase",
    padding,
    borderRadius: "var(--hw-radius-md)",
    cursor: "pointer",
    lineHeight: 1.5,
    whiteSpace: "nowrap",
  };
  switch (kind) {
    case "primary":
      return { ...base, border: 0, background: "var(--hw-color-ink)", color: "var(--hw-color-paper)" };
    case "secondary":
      return { ...base, border: "1px solid var(--hw-color-line-strong)", background: "transparent", color: "var(--hw-color-ink)" };
    case "tertiary":
      return { ...base, border: 0, background: "transparent", color: "var(--hw-color-ink-3)" };
    case "human":
      return { ...base, border: 0, background: "var(--hw-color-human)", color: "#fff" };
    case "human-outline":
      return { ...base, border: "1px solid var(--hw-color-human)", background: "transparent", color: "var(--hw-color-human)" };
  }
}

/** Small outlined action (Preview card): 12px, pad 7×12, radius 6. */
export function smallButtonStyle(kind: "secondary" | "tertiary"): CSSProperties {
  return {
    fontSize: 12,
    padding: "7px 12px",
    borderRadius: "var(--hw-radius-sm)",
    border: kind === "secondary" ? "1px solid var(--hw-color-line-strong)" : "1px solid transparent",
    background: "transparent",
    color: kind === "secondary" ? "var(--hw-color-ink)" : "var(--hw-color-ink-3)",
    cursor: "pointer",
    lineHeight: 1.5,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  };
}

/** Section label: Inter 600 11px, tracked, uppercase. */
export const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};
