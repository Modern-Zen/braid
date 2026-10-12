// Screen A · River: the map of every Intent's Channels on the mainline, and the live feed.
// States: empty / running / overlap / merged.
import { useEffect, useState, type ReactElement } from "react";
import type { RiverState } from "@braid/protocol";
import { EmptyState } from "../../components/EmptyState.tsx";
import { EventRow } from "../../components/EventRow.tsx";
import { RiverMap } from "../../components/RiverMap.tsx";
import { plural } from "../../lib/format.ts";
import type { RiverSource } from "../data/useRiver.ts";
import { navigate } from "../router.tsx";
import { ScreenHeader, Subtitle } from "../ScreenHeader.tsx";
import { OpenIntentDialog } from "./OpenIntentDialog.tsx";

export function riverSubtitle(river: RiverState, source: RiverSource): string {
  if (source === "connecting") return "Connecting…";
  const n = river.intents.length;
  if (n === 0) return "No intents yet";
  if (river.merged) return `${plural(n, "intent")} merged · river is quiet`;
  const channels = river.intents.reduce((s, it) => s + it.channels.length, 0);
  const overlaps = river.overlaps.length;
  if (overlaps > 0) return `${plural(n, "intent")} · ${plural(channels, "channel")} · ${plural(overlaps, "overlap")}`;
  return `${plural(n, "intent")} · ${plural(channels, "channel")} running`;
}

export interface RiverScreenProps {
  river: RiverState;
  source: RiverSource;
  now: number;
  reduced: boolean;
  fixtures: boolean;
}

export function RiverScreen({ river, source, now, reduced, fixtures }: RiverScreenProps): ReactElement {
  const [opening, setOpening] = useState(false);
  const live = source === "live" || source === "fixtures";

  // The design only offers "Open an Intent" on an empty River; "i" opens it any time.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "i" || e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      setOpening(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <section data-screen-label="A · River" style={{ height: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px" }}>
      <div style={{ position: "relative", padding: "28px 32px", minWidth: 0, display: "flex", flexDirection: "column" }}>
        <ScreenHeader title="River">
          <Subtitle>{riverSubtitle(river, source)}</Subtitle>
        </ScreenHeader>
        {source === "connecting" ? (
          <div style={{ flex: 1 }} />
        ) : river.intents.length === 0 ? (
          <EmptyState variant="river" onOpenIntent={() => setOpening(true)} />
        ) : (
          <div style={{ flex: 1, marginTop: 12, minHeight: 0, display: "flex", alignItems: "center" }}>
            <RiverMap
              river={river}
              reduced={reduced}
              onIntent={(it) => navigate({ screen: "scout", intent: it.id })}
              onChannel={(_c, it) => navigate({ screen: "scout", intent: it.id })}
              onCommit={(c) => c.headSha && navigate({ screen: "logbook", sha: c.headSha, repo: c.repo })}
            />
          </div>
        )}
      </div>
      <aside style={{ borderLeft: "1px solid var(--hw-color-line)", background: "var(--hw-color-surface)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div
          style={{
            padding: "20px 20px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--hw-color-ink-3)",
          }}
          title={live ? undefined : "The River's socket is unreachable; showing sample data until it reconnects."}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: live ? "var(--hw-color-channel)" : "var(--hw-color-ink-4)", display: "inline-block" }} />
          {live ? "Live" : source === "connecting" ? "Connecting" : "Sample data"}
        </div>
        <div style={{ overflow: "auto", display: "flex", flexDirection: "column" }}>
          {river.feed.map((e) => (
            <EventRow key={e.id} event={e} now={now} />
          ))}
        </div>
      </aside>
      {opening ? <OpenIntentDialog riverId={river.riverId} fixtures={fixtures} onClose={() => setOpening(false)} /> : null}
    </section>
  );
}
