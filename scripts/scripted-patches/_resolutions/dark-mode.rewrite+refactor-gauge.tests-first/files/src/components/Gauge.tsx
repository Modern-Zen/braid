import { useGauge, type Units } from "../hooks/useGauge";
import type { ColorScheme } from "../theme/useColorScheme";
import type { GaugeKind } from "../types";

/** The gauge's own colors, one set per scheme. */
export const GAUGE_COLORS = {
  light: {
    label: "#78716c",
    value: "#1c1917",
    track: "#e7e5e4",
    bar: "#0d9488",
    alertTrack: "#fde4d6",
    alert: "#c2410c",
  },
  dark: {
    label: "#a8a29e",
    value: "#f5f5f4",
    track: "#292524",
    bar: "#2dd4bf",
    alertTrack: "#431407",
    alert: "#fb923c",
  },
} as const;

export interface GaugeProps {
  kind: GaugeKind;
  label: string;
  /** Reading in US units: feet (stage), cubic feet per second (flow), °F (temp). */
  value: number;
  min: number;
  max: number;
  /** At or above this value the bar switches to the alert color. */
  alertAt?: number;
  /** Units shown until the reader clicks the value to switch. */
  defaultUnits?: Units;
  scheme?: ColorScheme;
}

export function Gauge({ kind, label, value, min, max, alertAt, defaultUnits = "us", scheme = "light" }: GaugeProps) {
  const { reading, pct, alert, units, toggleUnits } = useGauge({ kind, value, min, max, alertAt, defaultUnits });
  const colors = GAUGE_COLORS[scheme];

  return (
    <div className="gauge" data-kind={kind} data-alert={alert || undefined}>
      <div className="gauge-head">
        <span className="gauge-label" style={{ color: colors.label }}>
          {label}
        </span>
        <button
          type="button"
          className="gauge-value"
          title={units === "metric" ? "Show US units" : "Show metric units"}
          onClick={toggleUnits}
          style={{ color: colors.value }}
        >
          {reading}
        </button>
      </div>
      <div
        className="gauge-track"
        role="meter"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={reading}
        style={{ background: alert ? colors.alertTrack : colors.track }}
      >
        <div
          className="gauge-bar"
          style={{ width: `${Math.round(pct)}%`, background: alert ? colors.alert : colors.bar }}
        />
      </div>
    </div>
  );
}
