// Preview card: one Channel in Scout. A live screenshot of the Channel's deployment,
// a skeleton while it builds, and the prototype's mini "River levels" dashboard when
// there is no screenshot yet.
// Frame: 1px line, radius 12, header 14×16 · 16:10 preview, full column width ·
// skeleton surface-2 with line bars, hw-pulse staggered 300ms ·
// status row 2×2 grid, label 10.5 upper ink-4, mono 12.5 · actions outlined 12px, pad 7×12, radius 6.
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { formatCost, type ScoutChannel } from "@braid/protocol";
import { formatDiff, formatDuration } from "../lib/format.ts";
import { AgentChip } from "./AgentChip.tsx";
import { smallButtonStyle } from "./buttons.ts";
import { RiskGauge } from "./RiskGauge.tsx";

const TERMINAL = new Set(["done", "failed", "merged", "dropped"]);

/** A Channel is "ready" in Scout once it has finished or been ranked. */
export function isReady(c: Pick<ScoutChannel, "rank" | "status">): boolean {
  return c.rank !== null || TERMINAL.has(c.status);
}

export interface PreviewCardProps {
  channel: ScoutChannel;
  /** The Scout state: a tie paints the top Channels amber. */
  tie?: boolean;
  /** Mini preview colors when there is no screenshot (fixture hint). */
  dark?: boolean;
  onViewDiff?: () => void;
  onReplay?: () => void;
}

export function PreviewCard({ channel: c, tie = false, dark = false, onViewDiff, onReplay }: PreviewCardProps): ReactElement {
  const ready = isReady(c);
  const top = ready && c.rank === 1;
  const accent = tie ? "var(--hw-color-human)" : "var(--hw-color-channel)";
  const rankLabel = c.rank !== null ? (tie && c.rank === 1 ? "tied" : `#${c.rank}`) : c.status === "failed" ? "failed" : ready ? "done" : "running";
  const rankColor = !ready ? "var(--hw-color-ink-4)" : top ? accent : "var(--hw-color-ink-3)";
  const dash = "—";
  const tests = c.tests ? `${c.tests.passed}/${c.tests.total}` : dash;
  const testsFailed = !!c.tests && c.tests.passed < c.tests.total;
  const cost = c.costUsd !== null && c.durationMs !== null ? `${formatCost(c.costUsd)} · ${formatDuration(c.durationMs)}` : c.costUsd !== null ? formatCost(c.costUsd) : dash;

  return (
    <article
      style={{
        border: `1px solid ${top ? accent : "var(--hw-color-line)"}`,
        background: "var(--hw-color-surface)",
        borderRadius: "var(--hw-radius-lg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "border-color var(--hw-motion-slow) var(--hw-motion-ease-out)",
      }}
    >
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--hw-color-line)", minWidth: 0 }}>
        <AgentChip channel={c} />
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: rankColor,
            flex: "none",
          }}
        >
          {rankLabel}
        </span>
      </div>

      {!ready ? (
        <PreviewSkeleton status={c.statusText} />
      ) : c.screenshotUrl ? (
        <PreviewShot url={c.screenshotUrl} alt={`Preview of ${c.id}`} />
      ) : (
        <MiniPreview dark={dark} note={c.note ?? ""} />
      )}

      <div
        style={{
          padding: "14px 16px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px 12px",
          fontSize: 12.5,
          borderTop: "1px solid var(--hw-color-line)",
        }}
      >
        <Stat label="Tests">
          <span style={{ fontFamily: "var(--hw-font-mono)", color: testsFailed ? "var(--hw-color-conflict)" : "var(--hw-color-ink-2)" }}>{tests}</span>
        </Stat>
        <Stat label="Diff">
          <span style={{ fontFamily: "var(--hw-font-mono)", color: "var(--hw-color-ink-2)" }}>{c.diff ? formatDiff(c.diff) : dash}</span>
        </Stat>
        <Stat label="Cost · time">
          <span style={{ fontFamily: "var(--hw-font-mono)", color: "var(--hw-color-ink-2)" }}>{cost}</span>
        </Stat>
        <Stat label="Risk">
          <RiskGauge value={c.risk} />
        </Stat>
      </div>

      <div style={{ padding: "0 16px 14px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {c.previewUrl ? (
          <a className="hw-btn-outline" href={c.previewUrl} target="_blank" rel="noreferrer" style={smallButtonStyle("secondary")}>
            Open preview
          </a>
        ) : (
          <button type="button" className="hw-btn-outline" style={smallButtonStyle("secondary")} disabled>
            Open preview
          </button>
        )}
        <button type="button" className="hw-btn-outline" style={smallButtonStyle("secondary")} onClick={onViewDiff} disabled={!onViewDiff}>
          View diff
        </button>
        <button type="button" className="hw-btn-text" style={smallButtonStyle("tertiary")} onClick={onReplay} disabled={!onReplay}>
          Replay from commit…
        </button>
      </div>
    </article>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--hw-color-ink-4)" }}>{label}</span>
      {children}
    </div>
  );
}

const bar = (width: string, delay: number, height = 8): CSSProperties => ({
  height,
  width,
  borderRadius: 4,
  background: "var(--hw-color-line)",
  animation: `hw-pulse var(--hw-motion-pulse) var(--hw-motion-ease-in-out) ${delay}s infinite`,
});

/** Skeleton while the Channel builds: surface-2 with line bars, staggered 300ms. */
export function PreviewSkeleton({ status }: { status?: string }): ReactElement {
  return (
    <div style={{ aspectRatio: "16/10", background: "var(--hw-color-surface-2)", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={bar("46%", 0, 12)} />
      <div style={bar("70%", 0.3)} />
      <div style={bar("62%", 0.6)} />
      <div style={bar("76%", 0.9)} />
      {status ? <div style={{ marginTop: "auto", fontFamily: "var(--hw-font-mono)", fontSize: 11, color: "var(--hw-color-ink-4)" }}>{status}</div> : null}
    </div>
  );
}

function PreviewShot({ url, alt }: { url: string; alt: string }): ReactElement {
  return (
    <div style={{ aspectRatio: "16/10", background: "var(--hw-color-surface-2)", overflow: "hidden" }}>
      <img src={url} alt={alt} loading="lazy" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
    </div>
  );
}

/** The prototype's stand-in for the riverlevels dashboard. Its own palette, not the app's. */
export function MiniPreview({ dark, note }: { dark: boolean; note: string }): ReactElement {
  const pv = dark
    ? { bg: "#1c1917", fg: "#fafaf9", muted: "#a8a29e", track: "#44403c", bar: "#2dd4bf" }
    : { bg: "#ffffff", fg: "#1c1917", muted: "#78716c", track: "#e7e5e4", bar: "#0d9488" };
  const rows: Array<[string, string, string]> = [
    ["Stage", "62%", "6.2 ft"],
    ["Flow", "48%", "4,810"],
    ["Temp", "35%", "51°F"],
  ];
  return (
    <div
      style={{
        aspectRatio: "16/10",
        background: pv.bg,
        color: pv.fg,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: "var(--hw-font-ui)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontFamily: "var(--hw-font-display)", fontSize: 15 }}>River levels</div>
        <div style={{ fontSize: 10, color: pv.muted }}>Snake River · Moose, WY</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 40px", gap: "8px 10px", alignItems: "center", fontSize: 10.5 }}>
        {rows.map(([label, w, value]) => [
          <span key={`${label}-l`} style={{ color: pv.muted }}>
            {label}
          </span>,
          <div key={`${label}-b`} style={{ height: 6, borderRadius: 3, background: pv.track }}>
            <div style={{ height: 6, width: w, borderRadius: 3, background: pv.bar }} />
          </div>,
          <span key={`${label}-v`} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {value}
          </span>,
        ])}
      </div>
      <div style={{ marginTop: "auto", fontSize: 10, color: pv.muted }}>{note}</div>
    </div>
  );
}
