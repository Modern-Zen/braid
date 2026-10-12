import { useState } from "react";
import { palette } from "../theme/tokens";
import type { GaugeKind } from "../types";

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
  defaultUnits?: "us" | "metric";
}

export function Gauge({ kind, label, value, min, max, alertAt, defaultUnits = "us" }: GaugeProps) {
  const [units, setUnits] = useState(defaultUnits);
  const metric = units === "metric";

  let shown = value;
  let unit = "ft";
  if (kind === "stage") {
    shown = metric ? value * 0.3048 : value;
    unit = metric ? "m" : "ft";
  } else if (kind === "flow") {
    shown = metric ? value * 0.0283168 : value;
    unit = metric ? "m³/s" : "cfs";
  } else {
    shown = metric ? ((value - 32) * 5) / 9 : value;
    unit = metric ? "°C" : "°F";
  }

  let reading: string;
  if (kind === "temp") reading = `${Math.round(shown)}${unit}`;
  else if (kind === "flow" && !metric) reading = `${Math.round(shown).toLocaleString("en-US")} ${unit}`;
  else reading = `${shown.toFixed(1)} ${unit}`;

  const span = max - min;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0;
  const alert = alertAt !== undefined && value >= alertAt;
  const barColor = alert ? palette.alert : palette.bar;

  return (
    <div className="gauge" data-kind={kind} data-alert={alert || undefined}>
      <span className="gauge-label" style={{ color: palette.muted }}>
        {label}
      </span>
      <div
        className="gauge-track"
        role="meter"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={reading}
        style={{ background: `${barColor}22` }}
      >
        <div className="gauge-bar" style={{ width: `${Math.round(pct)}%`, background: barColor }} />
      </div>
      <button
        type="button"
        className="gauge-value"
        title={metric ? "Show US units" : "Show metric units"}
        onClick={() => setUnits(metric ? "us" : "metric")}
        style={{ color: palette.ink }}
      >
        {reading}
      </button>
    </div>
  );
}
