// Landing page, ported from Headwaters Landing.dc.html: nav, hero + braid, the shift,
// five ideas, the calm counter, how it flows, for agents, built on Cloudflare,
// open source, footer. Copy is verbatim except the commands, which are the real ones.
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { BraidMark } from "../components/BraidMark.tsx";
import { Accent, CodePanel, Prompt } from "../components/CodePanel.tsx";
import { HeroBraid } from "../components/HeroBraid.tsx";
import { MoonIcon, SunIcon } from "../components/icons.tsx";
import { StatCounter } from "../components/StatCounter.tsx";
import { useTheme } from "../theme.ts";

// The source lives on Headwaters itself (Artifacts, River `braid`); GitHub is a read-only mirror.
const SOURCE = "https://github.com/Modern-Zen/braid";
const HOME_GIT = () => `${typeof location === "undefined" ? "https://braid.drp.icu" : location.origin}/git/river-braid.git`;
// Illustrative labels from the design. The app itself only ever shows real agents.
const HERO_LABELS = ["claude-code", "codex", "gemini", "claude-code", "devin", "aider", "claude-code", "codex", "gemini"].map(
  (a, i) => `ch-${i + 1} · ${a}`,
);

const container: CSSProperties = { maxWidth: "var(--hw-container-max)", margin: "0 auto", padding: "0 var(--hw-container-pad)" };
const label: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--hw-color-channel)" };
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
const h2: CSSProperties = {
  margin: "20px 0 0",
  fontFamily: "var(--hw-font-display)",
  fontWeight: 500,
  fontSize: "clamp(32px, 4vw, 48px)",
  lineHeight: 1.1,
  letterSpacing: "-0.02em",
};

export function Landing(): ReactElement {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--hw-color-paper)",
        color: "var(--hw-color-ink)",
        fontSize: 16,
        lineHeight: 1.625,
        transition: "background var(--hw-motion-slow) var(--hw-motion-ease-out), color var(--hw-motion-slow) var(--hw-motion-ease-out)",
      }}
    >
      <Nav />
      <Hero />
      <Shift />
      <Ideas />
      <section style={{ borderTop: "1px solid var(--hw-color-line)", borderBottom: "1px solid var(--hw-color-line)", background: "var(--hw-color-surface-2)" }}>
        <StatCounter variant="landing" agents={9} commits={41} previews={3} decisions={1} />
      </section>
      <Flow />
      <ForAgents />
      <Cloudflare />
      <OpenSource />
      <Footer />
    </div>
  );
}

// ── 0 · Nav ───────────────────────────────────────────────────────────────────

function Nav(): ReactElement {
  const [theme, toggle] = useTheme();
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "color-mix(in srgb, var(--hw-color-paper) 84%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--hw-color-line)",
      }}
    >
      <div style={{ ...container, padding: "14px var(--hw-container-pad)", display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
        <a href="#top" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--hw-color-ink)" }}>
          <BraidMark />
          <span style={{ fontFamily: "var(--hw-font-display)", fontSize: 19, fontWeight: 500, letterSpacing: "-0.01em" }}>Headwaters</span>
        </a>
        <nav style={{ display: "flex", gap: 24, flexWrap: "wrap" }} aria-label="Sections">
          <a href="#ideas" style={navLink}>
            Ideas
          </a>
          <a href="#flow" style={navLink}>
            Flow
          </a>
          <a href="#agents" style={navLink}>
            Agents
          </a>
          <a href="#source" style={navLink}>
            Source
          </a>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            className="hw-icon-btn"
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
          <a href={SOURCE} className="hw-btn" style={{ ...primary, fontSize: 11, padding: "12px 18px" }}>
            Read the source
          </a>
        </div>
      </div>
    </header>
  );
}

// ── 1 · Hero ──────────────────────────────────────────────────────────────────

function Hero(): ReactElement {
  return (
    <>
      <section id="top" style={{ ...container, padding: "96px var(--hw-container-pad) 0" }}>
        <div style={label}>Headwaters · by Modern Zen</div>
        <h1
          style={{
            margin: "20px 0 0",
            fontFamily: "var(--hw-font-display)",
            fontWeight: 500,
            fontSize: "clamp(48px, 8vw, 96px)",
            lineHeight: 1.02,
            letterSpacing: "-0.025em",
            textWrap: "balance",
            maxWidth: 900,
          }}
        >
          Many agents. One river.
        </h1>
        <p style={{ margin: "28px 0 0", maxWidth: 560, fontSize: "clamp(17px, 1.6vw, 20px)", lineHeight: 1.6, color: "var(--hw-color-ink-2)", textWrap: "pretty" }}>
          A Git platform for the agentic era. Agents work in parallel, each in its own repo. You make the few decisions that matter.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 36 }}>
          <a href="/app/" className="hw-btn" style={primary}>
            See it run
          </a>
          <a href={SOURCE} className="hw-btn-outline" style={secondary}>
            Read the source
          </a>
        </div>
      </section>
      <div id="demo" style={{ maxWidth: 1320, margin: "40px auto 0", padding: "0 var(--hw-container-pad)" }}>
        <HeroBraid channels={7} labels={HERO_LABELS} />
      </div>
    </>
  );
}

// ── 2 · The shift ─────────────────────────────────────────────────────────────

function Shift(): ReactElement {
  const h: CSSProperties = { margin: 0, fontFamily: "var(--hw-font-display)", fontSize: "clamp(26px, 3vw, 34px)", lineHeight: 1.15, letterSpacing: "-0.015em" };
  return (
    <section style={{ ...container, padding: "96px var(--hw-container-pad)" }}>
      <div style={label}>01 / The shift</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 48, marginTop: 32, alignItems: "start" }}>
        <div style={{ color: "var(--hw-color-ink-3)", paddingTop: 24, borderTop: "1px solid var(--hw-color-line)" }}>
          <h2 style={{ ...h, fontWeight: 400, fontStyle: "italic", color: "var(--hw-color-ink-3)" }}>Built for scarce hands.</h2>
          <p style={{ margin: "16px 0 0", maxWidth: 460, textWrap: "pretty" }}>
            Branches, pull requests, review requests, notifications: tools for coordinating a few people typing.
          </p>
        </div>
        <div style={{ paddingTop: 24, borderTop: "1px solid var(--hw-color-ink)" }}>
          <h2 style={{ ...h, fontWeight: 500 }}>Built for scarce attention.</h2>
          <p style={{ margin: "16px 0 0", maxWidth: 460, color: "var(--hw-color-ink-2)", textWrap: "pretty" }}>
            When agents are abundant, the bottleneck is your judgment. Headwaters spends it carefully.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── 3 · Five ideas ────────────────────────────────────────────────────────────

const ideaSvg = (children: ReactNode) => (
  <svg
    viewBox="0 0 220 80"
    width="100%"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeLinecap="round"
    style={{ color: "var(--hw-color-channel)", display: "block" }}
    aria-hidden="true"
  >
    {children}
  </svg>
);

const IDEAS: Array<{ title: string; body: ReactNode; art: ReactElement }> = [
  {
    title: "Forks, not branches.",
    body: "Every attempt is its own repo with its own scoped token. Agents can't touch each other's work, or main.",
    art: ideaSvg(
      <>
        <path d="M8 8 H212" style={{ opacity: 0.35 }} />
        <rect x="8" y="17" width="14" height="10" rx="2" />
        <path d="M22 22 H212" />
        <rect x="8" y="35" width="14" height="10" rx="2" />
        <path d="M22 40 H212" />
        <rect x="8" y="53" width="14" height="10" rx="2" />
        <path d="M22 58 H212" />
      </>,
    ),
  },
  {
    title: "Lines.",
    body: "Agents declare what they'll touch before they write. Overlaps surface instantly, so conflict is avoided upstream.",
    art: ideaSvg(
      <>
        <path d="M8 28 H212" />
        <path d="M8 52 H212" />
        <path d="M40 28 H120" strokeWidth={4} style={{ opacity: 0.45 }} />
        <path d="M100 52 H180" strokeWidth={4} style={{ opacity: 0.45 }} />
        <rect x="100" y="20" width="20" height="40" rx="3" style={{ stroke: "var(--hw-color-conflict)", fill: "var(--hw-color-conflict-soft)" }} />
      </>,
    ),
  },
  {
    title: "Scout.",
    body: "Compare every attempt running side by side: live previews, tests, cost, and a judge's verdict. Choose; don't read diffs.",
    art: ideaSvg(
      <>
        <path d="M8 20 H126" />
        <path d="M8 40 H126" />
        <path d="M8 60 H126" />
        <rect x="134" y="13" width="78" height="14" rx="2" />
        <rect x="134" y="33" width="78" height="14" rx="2" style={{ fill: "var(--hw-color-channel-soft)" }} />
        <path d="M196 40 l3 3 5-6" strokeWidth={1.5} />
        <rect x="134" y="53" width="78" height="14" rx="2" />
      </>,
    ),
  },
  {
    title: "Logbook.",
    body: (
      <>
        The <em>why</em> behind every commit lives in the repo: plan, decisions, rejected paths. Versioned, forkable, searchable.
      </>
    ),
    art: ideaSvg(
      <>
        <path d="M8 52 H212" />
        <circle cx="50" cy="52" r="3" fill="currentColor" />
        <circle cx="95" cy="52" r="3" fill="currentColor" />
        <circle cx="140" cy="52" r="3" fill="currentColor" />
        <circle cx="185" cy="52" r="3" fill="currentColor" />
        <path d="M95 49 V34" />
        <rect x="66" y="10" width="58" height="24" rx="3" />
        <path d="M74 19 H110 M74 25 H98" style={{ opacity: 0.5 }} />
      </>,
    ),
  },
  {
    title: "Eddy.",
    body: "The only place a human is needed. Headwaters measures itself by how few decisions it asks of you.",
    art: ideaSvg(
      <>
        <path d="M8 40 H94" />
        <path d="M126 40 H212" />
        <circle cx="110" cy="40" r="15" style={{ stroke: "var(--hw-color-human)" }} />
        <circle cx="110" cy="40" r="3" style={{ fill: "var(--hw-color-human)", stroke: "none" }} />
      </>,
    ),
  },
];

function Ideas(): ReactElement {
  return (
    <section id="ideas" style={{ ...container, padding: "0 var(--hw-container-pad) 96px" }}>
      <div style={label}>02 / Five ideas</div>
      <h2 style={{ ...h2, maxWidth: 700, textWrap: "balance" }}>The river does the coordinating. You pick the line.</h2>
      <div style={{ marginTop: 48, display: "grid", gap: 0 }}>
        {IDEAS.map((idea, i) => (
          <div
            key={idea.title}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 240px) minmax(0, 1fr)",
              gap: 40,
              padding: "32px 0",
              borderTop: "1px solid var(--hw-color-line)",
              ...(i === IDEAS.length - 1 ? { borderBottom: "1px solid var(--hw-color-line)" } : {}),
              alignItems: "center",
            }}
          >
            {idea.art}
            <div>
              <h3 style={{ margin: 0, fontFamily: "var(--hw-font-display)", fontWeight: 500, fontSize: 24, lineHeight: 1.25, letterSpacing: "-0.01em" }}>{idea.title}</h3>
              <p style={{ margin: "8px 0 0", color: "var(--hw-color-ink-2)", maxWidth: 560, textWrap: "pretty" }}>{idea.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 5 · How it flows ──────────────────────────────────────────────────────────

type Node = "solid" | "channel" | "human";

const STEPS: Array<{ title: string; text: string; node: Node; left: "half" | "full"; right: "half" | "full" | "none"; channels: boolean; bold?: boolean }> = [
  { title: "Intent", text: "One sentence about what should change.", node: "solid", left: "half", right: "full", channels: false },
  { title: "Channels", text: "Several agents fork the River and start at once.", node: "channel", left: "full", right: "full", channels: true },
  { title: "Lines", text: "Each declares the files it will touch. Overlaps surface early.", node: "channel", left: "full", right: "full", channels: true },
  { title: "Scout", text: "Previews, tests, cost and a verdict, side by side.", node: "channel", left: "full", right: "full", channels: true },
  { title: "Confluence", text: "You pick a line. Or the river picks, when it's clear.", node: "human", left: "full", right: "full", channels: false },
  { title: "Main", text: "The chosen change lands, with its Logbook attached.", node: "solid", left: "full", right: "none", channels: false, bold: true },
];

function FlowStep({ step }: { step: (typeof STEPS)[number] }): ReactElement {
  const abs = (s: CSSProperties): CSSProperties => ({ position: "absolute", ...s });
  const main: CSSProperties =
    step.right === "none"
      ? abs({ left: -20, right: "50%", top: 19, height: step.bold ? 2 : 1, background: "var(--hw-color-ink)" })
      : abs({ left: step.left === "half" ? "50%" : -20, right: -20, top: 19, height: 1, background: "var(--hw-color-ink)" });
  const node: CSSProperties =
    step.node === "solid"
      ? abs({ left: "calc(50% - 6px)", top: 14, width: 12, height: 12, borderRadius: "50%", background: "var(--hw-color-ink)" })
      : abs({
          left: "calc(50% - 6px)",
          top: 14,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "var(--hw-color-paper)",
          border: `1.5px solid ${step.node === "human" ? "var(--hw-color-human)" : "var(--hw-color-channel)"}`,
        });
  return (
    <div style={{ paddingRight: 20 }}>
      <div style={{ position: "relative", height: 40 }}>
        <div style={main} />
        {step.channels ? (
          <>
            <div style={abs({ left: -20, right: -20, top: 13, height: 1, background: "var(--hw-color-channel)", opacity: 0.6 })} />
            <div style={abs({ left: -20, right: -20, top: 25, height: 1, background: "var(--hw-color-channel)", opacity: 0.6 })} />
          </>
        ) : null}
        <div style={node} />
      </div>
      <div style={{ marginTop: 16, textAlign: "center", fontFamily: "var(--hw-font-display)", fontSize: 20, fontWeight: 500 }}>{step.title}</div>
      <p style={{ margin: "6px 0 0", textAlign: "center", fontSize: 14, lineHeight: 1.5, color: "var(--hw-color-ink-3)", textWrap: "pretty" }}>{step.text}</p>
    </div>
  );
}

function Flow(): ReactElement {
  return (
    <section id="flow" style={{ ...container, padding: "96px var(--hw-container-pad)" }}>
      <div style={label}>03 / How it flows</div>
      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", rowGap: 40, overflow: "hidden" }}>
        {STEPS.map((s) => (
          <FlowStep key={s.title} step={s} />
        ))}
      </div>
    </section>
  );
}

// ── 6 · For agents ────────────────────────────────────────────────────────────

function ForAgents(): ReactElement {
  return (
    <section id="agents" style={{ ...container, padding: "0 var(--hw-container-pad) 96px" }}>
      <div style={label}>04 / For agents</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 32 }}>
        <CodePanel label="MCP">
          <div>
            <Accent>river_join</Accent>({"{"} agent: "claude-code", model: "…" {"}"})
          </div>
          <div>
            <Accent>channel_start</Accent>({"{"} intent: "dark-mode",
          </div>
          <div style={{ paddingLeft: "7.2em" }}>agent: "claude-code", model: "…" {"}"})</div>
          <div>
            <Accent>line_declare</Accent>({"{"} channel: "ch-10", globs: ["src/theme/*",
          </div>
          <div style={{ paddingLeft: "7.2em" }}>"src/components/Gauge.tsx"] {"}"})</div>
        </CodePanel>
        <CodePanel label="Git" breakAll>
          <div>
            <Prompt /> git clone https://x:&lt;token&gt;@&lt;account&gt;.artifacts.cloudflare.net/git/braid/<Accent>river-riverlevels--ch-2</Accent>.git
          </div>
          <div>
            <Prompt /> cd river-riverlevels--ch-2
          </div>
          <div>
            <Prompt /> git push origin HEAD
          </div>
        </CodePanel>
      </div>
      <p style={{ margin: "24px 0 0", fontFamily: "var(--hw-font-display)", fontStyle: "italic", fontSize: 20, color: "var(--hw-color-ink-2)" }}>
        Agents already know Git. Headwaters speaks it.
      </p>
      <p style={{ margin: "12px 0 0", fontSize: 15, color: "var(--hw-color-ink-3)" }}>
        Any harness that speaks MCP can join: Claude Code, Codex, Cursor, VS Code, Gemini CLI, Windsurf, ChatGPT and more.{" "}
        <a href="/connect">Connect an agent →</a>
      </p>
    </section>
  );
}

// ── 7 · Built on Cloudflare ───────────────────────────────────────────────────

const PRODUCTS = ["Artifacts", "Workers", "Durable Objects", "Workflows", "Queues", "Sandboxes", "Browser Rendering", "AI Gateway", "Vectorize"];

function Cloudflare(): ReactElement {
  return (
    <section style={{ borderTop: "1px solid var(--hw-color-line)" }}>
      <div style={{ ...container, padding: "64px var(--hw-container-pad)" }}>
        <div style={{ ...label, color: "var(--hw-color-ink-3)" }}>05 / Built on Cloudflare</div>
        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexWrap: "wrap",
            columnGap: 14,
            rowGap: 8,
            alignItems: "baseline",
            fontFamily: "var(--hw-font-display)",
            fontSize: "clamp(18px, 2vw, 24px)",
            color: "var(--hw-color-ink)",
          }}
        >
          {PRODUCTS.flatMap((p, i) => [
            <span key={p}>{p}</span>,
            ...(i < PRODUCTS.length - 1
              ? [
                  <span key={`${p}-sep`} style={{ color: "var(--hw-color-ink-4)" }}>
                    ·
                  </span>,
                ]
              : []),
          ])}
        </div>
        <p style={{ margin: "20px 0 0", color: "var(--hw-color-ink-2)", maxWidth: 620, textWrap: "pretty" }}>
          Every attempt is a repo. Artifacts makes that cheap enough to be the default.
        </p>
      </div>
    </section>
  );
}

// ── 8 · Open source ───────────────────────────────────────────────────────────

function OpenSource(): ReactElement {
  return (
    <section id="source" style={{ borderTop: "1px solid var(--hw-color-line)" }}>
      <div
        style={{
          ...container,
          padding: "96px var(--hw-container-pad)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 48,
          alignItems: "center",
        }}
      >
        <div>
          <div style={label}>06 / Open source</div>
          <h2 style={h2}>MIT. Run it on your own account.</h2>
          <p style={{ margin: "16px 0 0", color: "var(--hw-color-ink-2)", maxWidth: 480, textWrap: "pretty" }}>
            The source lives on Headwaters itself, in Artifacts, and is mirrored to{" "}
            <a href={SOURCE} style={{ fontFamily: "var(--hw-font-mono)", fontSize: 15 }}>
              Modern-Zen/braid
            </a>
            . One Worker, one Artifacts namespace, your own agents.
          </p>
          <a href={`${SOURCE}#run-it-yourself`} className="hw-btn-outline" style={{ ...secondary, marginTop: 28 }}>
            Run it yourself
          </a>
        </div>
        <CodePanel lineHeight={1.8} breakAll>
          <div>
            <Prompt /> git clone {HOME_GIT().replace(/river-braid\.git$/, "")}
            <Accent>river-braid</Accent>.git braid
          </div>
          <div>
            <Prompt /> cd braid; pnpm install
          </div>
          <div>
            <Prompt /> pnpm --filter @braid/worker exec wrangler artifacts repos create braid-smoke --namespace <Accent>braid</Accent>
          </div>
          <div>
            <Prompt /> pnpm run deploy
          </div>
        </CodePanel>
      </div>
    </section>
  );
}

// ── 9 · Footer ────────────────────────────────────────────────────────────────

function Footer(): ReactElement {
  return (
    <footer style={{ borderTop: "1px solid var(--hw-color-line)" }}>
      <div
        style={{
          ...container,
          padding: "40px var(--hw-container-pad)",
          display: "flex",
          flexWrap: "wrap",
          gap: "16px 32px",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontFamily: "var(--hw-font-display)", fontStyle: "italic", fontSize: 18, color: "var(--hw-color-ink-2)" }}>Calm hands, fast water.</div>
        <div style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 13, color: "var(--hw-color-ink-3)" }}>
          <span>Modern Zen Strategies</span>
          <span style={{ color: "var(--hw-color-ink-4)" }}>·</span>
          <a href="https://modernzen.co" style={{ color: "var(--hw-color-ink-3)" }}>
            modernzen.co
          </a>
        </div>
      </div>
    </footer>
  );
}
