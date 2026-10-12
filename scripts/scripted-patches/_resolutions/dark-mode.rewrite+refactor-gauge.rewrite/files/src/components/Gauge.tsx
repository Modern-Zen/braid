import { useGauge, type Units } from "../hooks/useGauge";
import type { ColorScheme } from "../theme/useColorScheme";
import type { GaugeKind, Reading } from "../types";

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
  /** A reading as the API returns it (US units). */
  reading: Reading;
  /** Units shown until the reader clicks the value to switch. */
  defaultUnits?: Units;
  scheme?: ColorScheme;
}

export function Gauge({ kind, label, reading, defaultUnits, scheme = "light" }: GaugeProps) {
  const gauge = useGauge(kind, label, reading, defaultUnits);
  const colors = GAUGE_COLORS[scheme];

  return (
    <div className="gauge" data-kind={kind} data-alert={gauge.alert || undefined}>
      <div className="gauge-head">
        <span className="gauge-label" style={{ color: colors.label }}>
          {label}
        </span>
        <button className="gauge-value" {...gauge.getToggleProps()} style={{ color: colors.value }}>
          {gauge.text}
        </button>
      </div>
      <div
        className="gauge-track"
        {...gauge.getMeterProps()}
        style={{ background: gauge.alert ? colors.alertTrack : colors.track }}
      >
        <div
          className="gauge-bar"
          style={{ width: `${Math.round(gauge.pct)}%`, background: gauge.alert ? colors.alert : colors.bar }}
        />
      </div>
    </div>
  );
}
