import type { ColorScheme } from "../theme/useColorScheme";
import type { River } from "../types";
import { Gauge } from "./Gauge";

const CARD_COLORS = {
  light: { background: "#ffffff", border: "#e7e5e4", title: "#1c1917", meta: "#78716c" },
  dark: { background: "#1c1917", border: "#292524", title: "#fafaf9", meta: "#a8a29e" },
} as const;

/** "2026-10-12T14:00:00Z" → "14:00 UTC". UTC on purpose: gauges report in UTC. */
function formatUpdated(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "unknown" : `${date.toISOString().slice(11, 16)} UTC`;
}

export interface RiverCardProps {
  river: River;
  scheme?: ColorScheme;
}

export function RiverCard({ river, scheme = "light" }: RiverCardProps) {
  const headingId = `river-${river.id}`;
  const colors = CARD_COLORS[scheme];
  return (
    <article
      className="river-card"
      aria-labelledby={headingId}
      style={{ background: colors.background, borderColor: colors.border }}
    >
      <header className="river-card-header">
        <h2 id={headingId} style={{ color: colors.title }}>
          {river.name}
        </h2>
        <span className="river-site" style={{ color: colors.meta }}>
          {river.site}
        </span>
      </header>
      <div className="river-gauges">
        <Gauge kind="stage" label="Stage" scheme={scheme} reading={river.stage} />
        <Gauge kind="flow" label="Flow" scheme={scheme} reading={river.flow} />
        <Gauge kind="temp" label="Temp" scheme={scheme} reading={river.temp} />
      </div>
      <footer className="river-updated" style={{ color: colors.meta }}>
        {`Updated ${formatUpdated(river.updatedAt)}`}
      </footer>
    </article>
  );
}
