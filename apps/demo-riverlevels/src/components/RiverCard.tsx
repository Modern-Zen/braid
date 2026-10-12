import type { River } from "../types";
import { Gauge } from "./Gauge";

/** "2026-10-12T14:00:00Z" → "14:00 UTC". UTC on purpose: gauges report in UTC. */
function formatUpdated(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "unknown" : `${date.toISOString().slice(11, 16)} UTC`;
}

export function RiverCard({ river }: { river: River }) {
  const headingId = `river-${river.id}`;
  return (
    <article className="river-card" aria-labelledby={headingId}>
      <header className="river-card-header">
        <h2 id={headingId}>{river.name}</h2>
        <span className="river-site">{river.site}</span>
      </header>
      <div className="river-gauges">
        <Gauge kind="stage" label="Stage" {...river.stage} />
        <Gauge kind="flow" label="Flow" {...river.flow} />
        <Gauge kind="temp" label="Temp" {...river.temp} />
      </div>
      <footer className="river-updated">{`Updated ${formatUpdated(river.updatedAt)}`}</footer>
    </article>
  );
}
