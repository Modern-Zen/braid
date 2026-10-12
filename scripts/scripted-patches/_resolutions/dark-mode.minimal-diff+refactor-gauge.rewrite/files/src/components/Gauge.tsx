import { useGauge, type Units } from "../hooks/useGauge";
import { tokens } from "../theme/tokens";
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
  const gauge = useGauge(kind, label, reading, defaultUnits);
  const barColor = gauge.alert ? tokens.alert : tokens.bar;

  return (
    <div className="gauge" data-kind={kind} data-alert={gauge.alert || undefined}>
      <span className="gauge-label" style={{ color: tokens.muted }}>
        {label}
      </span>
      <div
        className="gauge-track"
        {...gauge.getMeterProps()}
        style={{ background: `color-mix(in srgb, ${barColor} 13%, transparent)` }}
      >
        <div className="gauge-bar" style={{ width: `${Math.round(gauge.pct)}%`, background: barColor }} />
      </div>
      <button className="gauge-value" {...gauge.getToggleProps()} style={{ color: tokens.ink }}>
        {gauge.text}
      </button>
    </div>
  );
}
