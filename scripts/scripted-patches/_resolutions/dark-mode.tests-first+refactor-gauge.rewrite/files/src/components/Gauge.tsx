import { useGauge, type Units } from "../hooks/useGauge";
import { usePalette } from "../theme/ThemeContext";
import type { GaugeKind, Reading } from "../types";

export interface GaugeProps {
  kind: GaugeKind;
  label: string;
  /** A reading as the API returns it (US units). */
  reading: Reading;
  /** Units shown until the reader clicks the value to switch. */
  defaultUnits?: Units;
}

export function Gauge({ kind, label, reading, defaultUnits }: GaugeProps) {
  const palette = usePalette();
  const gauge = useGauge(kind, label, reading, defaultUnits);
  const barColor = gauge.alert ? palette.alert : palette.bar;

  return (
    <div className="gauge" data-kind={kind} data-alert={gauge.alert || undefined}>
      <span className="gauge-label" style={{ color: palette.muted }}>
        {label}
      </span>
      <div className="gauge-track" {...gauge.getMeterProps()} style={{ background: `${barColor}22` }}>
        <div className="gauge-bar" style={{ width: `${Math.round(gauge.pct)}%`, background: barColor }} />
      </div>
      <button className="gauge-value" {...gauge.getToggleProps()} style={{ color: palette.ink }}>
        {gauge.text}
      </button>
    </div>
  );
}
