// The prototype's floating state switcher. Only with ?states=1 (for recording);
// it forces fixture states per screen. Hidden on screens without states (Logbook).
import type { ReactElement } from "react";

export interface StateBarProps<T extends string> {
  options: Array<[T, string]>;
  value: T;
  onChange: (value: T) => void;
}

export function StateBar<T extends string>({ options, value, onChange }: StateBarProps<T>): ReactElement | null {
  if (options.length === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Demo state"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 16,
        transform: "translateX(-50%)",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 4,
        borderRadius: "var(--hw-radius-full)",
        background: "var(--hw-color-ink)",
        color: "var(--hw-color-paper)",
        boxShadow: "var(--hw-shadow-lg)",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <span style={{ padding: "0 10px 0 12px", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.6 }}>State</span>
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(v)}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--hw-radius-full)",
              border: 0,
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1.5,
              background: on ? "var(--hw-color-paper)" : "transparent",
              color: on ? "var(--hw-color-ink)" : "var(--hw-color-paper)",
              transition: "background var(--hw-motion-fast) var(--hw-motion-ease-out), color var(--hw-motion-fast) var(--hw-motion-ease-out)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
