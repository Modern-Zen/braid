// Risk gauge: a 180° arc. Low risk is teal, mid is grey, high is amber because it will
// need approval. 36×20 · 3px stroke · track line · < 0.40 teal · 0.40–0.59 ink-3 ·
// ≥ 0.60 amber · value mono 12.5 beside the arc · draws to its value over 600ms.
import { useEffect, useState, type ReactElement } from "react";
import { formatRisk, riskBand, type RiskBand } from "@braid/protocol";
import { prefersReducedMotion } from "../theme.ts";

const ARC = "M3 18 A15 15 0 0 1 33 18";

const BAND: Record<RiskBand, string> = {
  low: "var(--hw-color-channel)",
  mid: "var(--hw-color-ink-3)",
  high: "var(--hw-color-human)",
};

export function riskColor(risk: number): string {
  return BAND[riskBand(risk)];
}

export interface RiskGaugeProps {
  /** 0..1, or null while unknown ("—"). */
  value: number | null;
  showValue?: boolean;
}

export function RiskGauge({ value, showValue = true }: RiskGaugeProps): ReactElement {
  const target = value === null ? 0 : Math.max(0, Math.min(1, value));
  const [drawn, setDrawn] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setDrawn(target);
      return;
    }
    // A timer rather than rAF: it still fires when the window isn't painting.
    const t = setTimeout(() => setDrawn(target), 30);
    return () => clearTimeout(t);
  }, [target]);
  const color = value === null ? "var(--hw-color-line)" : riskColor(value);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <svg width="36" height="20" viewBox="0 0 36 20" fill="none" strokeLinecap="round" aria-hidden="true">
        <path d={ARC} stroke="var(--hw-color-line)" strokeWidth={3} />
        <path
          d={ARC}
          stroke={color}
          strokeWidth={3}
          pathLength={1}
          strokeDasharray={value === null ? "0 1" : `${drawn} 1`}
          style={{ transition: "stroke-dasharray 600ms var(--hw-motion-ease-out)" }}
        />
      </svg>
      {showValue ? (
        <span style={{ fontFamily: "var(--hw-font-mono)", fontSize: 12.5, color: "var(--hw-color-ink-2)" }}>{value === null ? "—" : formatRisk(value)}</span>
      ) : null}
    </span>
  );
}
