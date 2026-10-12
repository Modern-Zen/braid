import { useGauge } from "../hooks/useGauge";
import { usePalette } from "../theme/ThemeContext";
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
  const palette = usePalette();
  const { reading, pct, alert, metric, toggleUnits } = useGauge({ kind, value, min, max, alertAt, defaultUnits });
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
        onClick={toggleUnits}
        style={{ color: palette.ink }}
      >
        {reading}
      </button>
    </div>
  );
}
