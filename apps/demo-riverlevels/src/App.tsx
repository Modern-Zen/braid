import { useEffect, useState } from "react";
import { RiverCard } from "./components/RiverCard";
import type { LevelsResponse, River } from "./types";

/** The dashboard refreshes every 30 s: one request per open tab, well under any limit. */
export const REFRESH_MS = 30_000;

export interface AppProps {
  /** Rendered immediately; the dashboard still refreshes from /api/levels. */
  initialRivers?: River[];
}

export function App({ initialRivers }: AppProps) {
  const [rivers, setRivers] = useState<River[] | null>(initialRivers ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/levels");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as LevelsResponse;
        if (!alive) return;
        setRivers(body.rivers);
        setError(null);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="app">
      <header className="app-header">
        <h1>River levels</h1>
        <p className="app-subtitle">Stage, flow and water temperature</p>
      </header>
      {error && (
        <p className="app-error" role="alert">
          {`Couldn’t refresh the gauges: ${error}`}
        </p>
      )}
      {rivers === null ? (
        <p className="app-loading">Loading gauges…</p>
      ) : (
        <section className="river-grid" aria-label="Rivers">
          {rivers.map((river) => (
            <RiverCard key={river.id} river={river} />
          ))}
        </section>
      )}
    </main>
  );
}
