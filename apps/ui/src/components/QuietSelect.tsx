// A native <select> laid invisibly over its visible label, so the control is exactly as
// wide as the chosen text (a bare <select> sizes to its longest option) and still opens
// the platform picker, with full keyboard and screen-reader support.
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { ChevronIcon } from "./icons.tsx";

export interface QuietSelectProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
  /** What the closed control shows; defaults to the selected option's label. */
  children?: ReactNode;
  style?: CSSProperties;
  chevronColor?: string;
}

export function QuietSelect<T extends string>({ value, options, onChange, label, children, style, chevronColor = "currentColor" }: QuietSelectProps<T>): ReactElement {
  const current = options.find((o) => o.value === value);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, ...style }}>
      <span>{children ?? current?.label ?? value}</span>
      <ChevronIcon style={{ color: chevronColor, flex: "none" }} />
      <select
        className="hw-select"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
