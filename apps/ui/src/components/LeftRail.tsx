// Left rail: five destinations. The active item is a surface well, not a colored bar.
// Eddy carries the only badge, and only when decisions > 0.
// 200px · surface-2 · 1px line right · item h 38, pad 9×10, radius 8, Inter 13.5/500 ·
// active bg surface, ink; idle ink-2 · icon 16px · badge amber pill h 20, 11/600 white ·
// footer: River name Lora 15 · owner/repo mono 11.5.
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { BraidMark } from "./BraidMark.tsx";
import { EddyIcon, IntentsIcon, LogbookIcon, RiversIcon, ScoutIcon } from "./icons.tsx";

export type RailDest = "rivers" | "intents" | "scout" | "eddy" | "logbook";

export interface LeftRailProps {
  active: RailDest | null;
  decisions: number;
  river: { name: string; owner: string };
  href: (dest: RailDest) => string;
  /** Client-side navigation; plain clicks only. */
  onNavigate: (href: string) => void;
  /** Optional River switcher, shown in the footer when there is more than one. */
  rivers?: Array<{ id: string; name: string }>;
  onRiverChange?: (id: string) => void;
}

const ITEMS: Array<[RailDest, string, (p: { size?: number }) => ReactElement]> = [
  ["rivers", "Rivers", RiversIcon],
  ["intents", "Intents", IntentsIcon],
  ["scout", "Scout", ScoutIcon],
  ["eddy", "Eddy", EddyIcon],
  ["logbook", "Logbook", LogbookIcon],
];

export function LeftRail({ active, decisions, river, href, onNavigate, rivers, onRiverChange }: LeftRailProps): ReactElement {
  const click = (to: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(to);
  };
  return (
    <aside
      style={{
        gridRow: "1 / span 2",
        borderRight: "1px solid var(--hw-color-line)",
        background: "var(--hw-color-surface-2)",
        display: "flex",
        flexDirection: "column",
        padding: "16px 12px",
        minHeight: 0,
      }}
    >
      <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 20px", color: "var(--hw-color-ink)" }}>
        <BraidMark size={26} />
        <span style={{ fontFamily: "var(--hw-font-display)", fontSize: 17, fontWeight: 500 }}>Headwaters</span>
      </a>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }} aria-label="Primary">
        {ITEMS.map(([dest, label, Icon]) => {
          const on = active === dest;
          const to = href(dest);
          return (
            <RailItem key={dest} href={to} onClick={click(to)} on={on}>
              <Icon size={16} />
              <span>{label}</span>
              {dest === "eddy" && decisions > 0 ? (
                <span
                  aria-label={`${decisions} ${decisions === 1 ? "decision" : "decisions"} for you`}
                  style={{
                    marginLeft: "auto",
                    minWidth: 20,
                    height: 20,
                    padding: "0 6px",
                    borderRadius: "var(--hw-radius-full)",
                    background: "var(--hw-color-human)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {decisions}
                </span>
              ) : null}
            </RailItem>
          );
        })}
      </nav>
      <div style={{ marginTop: "auto", padding: "12px 10px", borderTop: "1px solid var(--hw-color-line)", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--hw-color-ink-4)" }}>River</div>
        {rivers && rivers.length > 1 && onRiverChange ? (
          <select
            className="hw-select"
            aria-label="River"
            value={rivers.find((r) => r.name === river.name)?.id ?? river.name}
            onChange={(e) => onRiverChange(e.target.value)}
            style={{ fontFamily: "var(--hw-font-display)", fontSize: 15, color: "var(--hw-color-ink)" }}
          >
            {rivers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <div style={{ fontFamily: "var(--hw-font-display)", fontSize: 15 }}>{river.name}</div>
        )}
        <div style={{ fontFamily: "var(--hw-font-mono)", fontSize: 11.5, color: "var(--hw-color-ink-3)" }}>
          {river.owner ? `${river.owner} / ${river.name}` : river.name}
        </div>
      </div>
    </aside>
  );
}

function RailItem({ href, onClick, on, children }: { href: string; onClick: (e: MouseEvent<HTMLAnchorElement>) => void; on: boolean; children: ReactNode }): ReactElement {
  return (
    <a
      href={href}
      onClick={onClick}
      className={on ? undefined : "hw-rail-item"}
      aria-current={on ? "page" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "9px 10px",
        borderRadius: "var(--hw-radius-md)",
        textAlign: "left",
        fontSize: 13.5,
        fontWeight: 500,
        lineHeight: 1.5,
        background: on ? "var(--hw-color-surface)" : "transparent",
        color: on ? "var(--hw-color-ink)" : "var(--hw-color-ink-2)",
      }}
    >
      {children}
    </a>
  );
}
