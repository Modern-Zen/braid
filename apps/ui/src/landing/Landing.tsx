// Landing page. M0 ships the nav, hero and braid wearing the real tokens and fonts;
// the remaining sections (shift, five ideas, counter, flow, agents, Cloudflare, OSS)
// are ported from Headwaters Landing.dc.html in M6.
import type { CSSProperties, ReactElement } from "react";
import { HeroBraid } from "../components/HeroBraid.tsx";
import { useTheme } from "../theme.ts";

const SOURCE = "https://github.com/Modern-Zen/braid";
// Illustrative labels from the design. The app itself only ever shows real agents.
const HERO_LABELS = ["claude-code", "codex", "gemini", "claude-code", "devin", "aider", "claude-code", "codex", "gemini"].map(
  (a, i) => `ch-${i + 1} · ${a}`,
);

const container: CSSProperties = { maxWidth: "var(--hw-container-max)", margin: "0 auto", padding: "0 var(--hw-container-pad)" };
const navLink: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--hw-color-ink-2)" };
const primary: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  padding: "15px 26px",
  borderRadius: "var(--hw-radius-md)",
  background: "var(--hw-color-ink)",
  color: "var(--hw-color-paper)",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
};
const secondary: CSSProperties = { ...primary, background: "transparent", border: "1px solid var(--hw-color-line-strong)", color: "var(--hw-color-ink)" };

export function Landing(): ReactElement {
  const [theme, toggle] = useTheme();
  return (
    <div style={{ minHeight: "100vh", fontSize: 16, lineHeight: 1.625 }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "color-mix(in srgb, var(--hw-color-paper) 84%, transparent)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid var(--hw-color-line)",
        }}
      >
        <div style={{ ...container, padding: "14px var(--hw-container-pad)", display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <a href="#top" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--hw-color-ink)" }}>
            <BraidMark />
            <span style={{ fontFamily: "var(--hw-font-display)", fontSize: 19, fontWeight: 500, letterSpacing: "-0.01em" }}>Headwaters</span>
          </a>
          <nav style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <a href="#ideas" style={navLink}>Ideas</a>
            <a href="#flow" style={navLink}>Flow</a>
            <a href="#agents" style={navLink}>Agents</a>
            <a href="#source" style={navLink}>Source</a>
          </nav>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              style={{
                width: 36,
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--hw-radius-md)",
                border: "1px solid var(--hw-color-line-strong)",
                background: "transparent",
                color: "var(--hw-color-ink-2)",
                cursor: "pointer",
              }}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <a href={SOURCE} style={{ ...primary, fontSize: 11, padding: "12px 18px" }}>
              Read the source
            </a>
          </div>
        </div>
      </header>

      <section id="top" style={{ ...container, padding: "96px var(--hw-container-pad) 0" }}>
        <div className="hw-label">Headwaters · by Modern Zen</div>
        <h1
          className="hw-display"
          style={{ margin: "20px 0 0", fontSize: "clamp(48px, 8vw, 96px)", lineHeight: 1.02, letterSpacing: "-0.025em", textWrap: "balance", maxWidth: 900 }}
        >
          Many agents. One river.
        </h1>
        <p style={{ margin: "28px 0 0", maxWidth: 560, fontSize: "clamp(17px, 1.6vw, 20px)", lineHeight: 1.6, color: "var(--hw-color-ink-2)", textWrap: "pretty" }}>
          A Git platform for the agentic era. Agents work in parallel, each in its own repo. You make the few decisions that matter.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 36 }}>
          <a href="/app/" style={primary}>See it run</a>
          <a href={SOURCE} style={secondary}>Read the source</a>
        </div>
      </section>
      <div id="demo" style={{ maxWidth: 1320, margin: "40px auto 0", padding: "0 var(--hw-container-pad)" }}>
        <HeroBraid channels={7} labels={HERO_LABELS} />
      </div>

      <footer style={{ borderTop: "1px solid var(--hw-color-line)", marginTop: 96 }}>
        <div style={{ ...container, padding: "40px var(--hw-container-pad)", display: "flex", flexWrap: "wrap", gap: "16px 32px", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "var(--hw-font-display)", fontStyle: "italic", fontSize: 18, color: "var(--hw-color-ink-2)" }}>Calm hands, fast water.</div>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 13, color: "var(--hw-color-ink-3)" }}>
            <span>Modern Zen Strategies</span>
            <span style={{ color: "var(--hw-color-ink-4)" }}>·</span>
            <a href="https://modernzen.co" style={{ color: "var(--hw-color-ink-3)" }}>modernzen.co</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function BraidMark({ size = 28 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={(size * 20) / 28} viewBox="0 0 28 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M1 10 H6 C10 10 10 4 14 4 H27" />
      <path d="M6 10 H27" />
      <path d="M6 10 C10 10 10 16 14 16 H27" />
    </svg>
  );
}

function MoonIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SunIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
