// Event row: the live feed. Event name in mono, colored by family; relative time only.
// grid 1fr auto · gap 4×12 · pad 10×20 · mono 11.5/1.4 · 1px line between rows · detail ellipsis.
// Colors: repo.* teal · review.passed emerald · line.conflict rose · confluence by-you amber · meta ink-3.
import type { ReactElement } from "react";
import { feedFamily, type FeedEvent, type FeedFamily } from "@braid/protocol";
import { relTime } from "../lib/format.ts";

const FAMILY: Record<FeedFamily, string> = {
  channel: "var(--hw-color-channel)",
  merged: "var(--hw-color-merged)",
  conflict: "var(--hw-color-conflict)",
  human: "var(--hw-color-human)",
  meta: "var(--hw-color-ink-3)",
};

export function eventColor(e: Pick<FeedEvent, "type" | "by">): string {
  return FAMILY[feedFamily(e)];
}

export interface EventRowProps {
  event: Pick<FeedEvent, "type" | "by" | "detail" | "at">;
  now: number;
}

export function EventRow({ event, now }: EventRowProps): ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        gap: "4px 12px",
        padding: "10px 20px",
        borderTop: "1px solid var(--hw-color-line)",
        fontFamily: "var(--hw-font-mono)",
        fontSize: 11.5,
        lineHeight: 1.4,
      }}
    >
      <span style={{ color: eventColor(event), fontWeight: 600 }}>{event.type}</span>
      <span style={{ color: "var(--hw-color-ink-4)" }}>{relTime(event.at, now)}</span>
      <span
        title={event.detail}
        style={{ gridColumn: "1 / span 2", color: "var(--hw-color-ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {event.detail}
      </span>
    </div>
  );
}
