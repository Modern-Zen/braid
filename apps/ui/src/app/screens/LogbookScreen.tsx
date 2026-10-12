// Screen D · Logbook: one commit's why. Header, trailer tags, the diff, and the Logbook
// entry (Plan, Decisions, Rejected approaches, Notes for reviewers, Model and cost),
// plus "Replay from here" and "Ask the river".
import { Fragment, useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import { STRATEGIES, formatCost, parseRepoName, type AskResult, type CommitView, type DiffFile, type LogbookView, type RiverState, type Strategy } from "@braid/protocol";
import { buttonClass, buttonStyle } from "../../components/buttons.ts";
import { SearchIcon } from "../../components/icons.tsx";
import { QuietSelect } from "../../components/QuietSelect.tsx";
import { TrailerTags } from "../../components/TrailerTag.tsx";
import { formatDuration, relTimeLong } from "../../lib/format.ts";
import { askRiver, getCommit, replayFrom, useResource } from "../data/api.ts";
import { ASK_FIXTURE, ASK_QUERY, commitFixture } from "../data/fixtures.ts";
import { Link, navigate } from "../router.tsx";
import { ScreenHeader } from "../ScreenHeader.tsx";

/** Agents the platform can run for a replay. Only real adapters; never a vendor it can't run. */
const REPLAY_AGENTS = ["claude-code"] as const;

export interface LogbookScreenProps {
  river: RiverState;
  sha?: string;
  repo?: string;
  fixtures: boolean;
  now: number;
}

export function LogbookScreen({ river, sha, repo, fixtures, now }: LogbookScreenProps): ReactElement {
  const target = sha ?? river.head ?? undefined;
  const targetRepo = repo ?? (sha ? undefined : river.repo);
  const commit = useResource<CommitView | null>(`commit:${river.riverId}:${target ?? ""}:${targetRepo ?? ""}`, {
    fixtures,
    load: () => (target ? getCommit(river.riverId, target, targetRepo) : Promise.resolve(null)),
    fixture: () => commitFixture(),
  });

  const c = commit.data;
  const nextChannel = nextChannelId(river, fixtures);

  return (
    <section data-screen-label="D · Logbook" style={{ padding: "28px 32px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
      <Ask riverId={river.riverId} fixtures={fixtures} />

      {c ? (
        <>
          <CommitHeader commit={c} now={now} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
            <DiffPanel files={c.files} />
            <LogbookPanel commit={c} riverId={river.riverId} fixtures={fixtures} nextChannel={nextChannel} />
          </div>
        </>
      ) : commit.loading ? null : (
        <p style={{ margin: "48px 0 0", textAlign: "center", fontFamily: "var(--hw-font-display)", fontSize: 22, color: "var(--hw-color-ink-2)" }}>
          The Logbook fills as Channels push.
        </p>
      )}
    </section>
  );
}

// ── Ask the river ─────────────────────────────────────────────────────────────

function Ask({ riverId, fixtures }: { riverId: string; fixtures: boolean }): ReactElement {
  const [q, setQ] = useState(fixtures ? ASK_QUERY : "");
  const [results, setResults] = useState<AskResult[] | null>(fixtures ? ASK_FIXTURE : null);
  const [note, setNote] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setNote(null);
    if (fixtures) {
      setResults(ASK_FIXTURE);
      return;
    }
    try {
      const found = await askRiver(riverId, query);
      setResults(found);
      if (found.length === 0) setNote("Nothing in the Logbook answers that yet.");
    } catch {
      setResults(null);
      setNote("Ask the river isn’t available on this River yet.");
    }
  };

  const top = results?.[0];
  return (
    <>
      <ScreenHeader title="Logbook" align="center">
        <form
          onSubmit={submit}
          role="search"
          style={{
            marginLeft: "auto",
            width: 520,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 14px",
            border: "1px solid var(--hw-color-line-strong)",
            borderRadius: "var(--hw-radius-md)",
            background: "var(--hw-color-surface)",
            color: "var(--hw-color-ink)",
          }}
        >
          <SearchIcon />
          <label
            htmlFor="hw-ask"
            style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--hw-color-ink-4)", whiteSpace: "nowrap" }}
          >
            Ask the river
          </label>
          <input id="hw-ask" className="hw-ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder={ASK_QUERY} autoComplete="off" />
        </form>
      </ScreenHeader>
      {top ? (
        <div
          style={{
            marginLeft: "auto",
            width: 520,
            border: "1px solid var(--hw-color-line)",
            background: "var(--hw-color-surface)",
            borderRadius: "var(--hw-radius-lg)",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            boxShadow: "var(--hw-shadow-md)",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", fontFamily: "var(--hw-font-mono)", fontSize: 12 }}>
            <Link to={{ screen: "logbook", sha: top.sha }} style={{ fontWeight: 600 }}>
              {top.sha.slice(0, 7)}
            </Link>
            <span style={{ color: "var(--hw-color-ink-3)" }}>
              {top.channelId} · {top.agent} · {top.intentTitle}
            </span>
          </div>
          <blockquote
            style={{
              margin: 0,
              paddingLeft: 12,
              borderLeft: "2px solid var(--hw-color-channel)",
              fontFamily: "var(--hw-font-display)",
              fontSize: 14.5,
              lineHeight: 1.5,
              color: "var(--hw-color-ink-2)",
            }}
          >
            {top.quote}
          </blockquote>
          <div style={{ fontSize: 12, color: "var(--hw-color-ink-4)" }}>From Decisions · Logbook entry {top.logbook}</div>
        </div>
      ) : note ? (
        <div style={{ marginLeft: "auto", width: 520, fontSize: 12.5, color: "var(--hw-color-ink-3)" }}>{note}</div>
      ) : null}
    </>
  );
}

// ── Commit ────────────────────────────────────────────────────────────────────

function CommitHeader({ commit: c, now }: { commit: CommitView; now: number }): ReactElement {
  const meta = [c.channelId, c.agent, c.strategy, c.intentTitle, relTimeLong(c.committedAt, now)].filter(Boolean).join(" · ");
  return (
    <div
      style={{
        border: "1px solid var(--hw-color-line)",
        background: "var(--hw-color-surface)",
        borderRadius: "var(--hw-radius-lg)",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--hw-font-mono)", fontSize: 16, fontWeight: 600 }} title={c.sha}>
          {c.sha.slice(0, 7)}
        </span>
        <span style={{ fontFamily: "var(--hw-font-display)", fontSize: 18 }}>{c.subject}</span>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--hw-color-ink-3)" }}>{meta}</span>
      </div>
      {c.trailers.length > 0 ? <TrailerTags trailers={c.trailers} /> : null}
    </div>
  );
}

function DiffPanel({ files }: { files: DiffFile[] }): ReactElement {
  return (
    <div style={{ border: "1px solid var(--hw-color-line)", background: "var(--hw-color-surface)", borderRadius: "var(--hw-radius-lg)", overflow: "hidden" }}>
      {files.length === 0 ? (
        <div style={{ padding: "10px 16px", fontFamily: "var(--hw-font-mono)", fontSize: 12, color: "var(--hw-color-ink-3)" }}>No file changes.</div>
      ) : null}
      {files.map((f, fi) => (
        <Fragment key={`${f.path}-${fi}`}>
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--hw-color-line)",
              ...(fi > 0 ? { borderTop: "1px solid var(--hw-color-line)" } : {}),
              display: "flex",
              gap: 12,
              fontFamily: "var(--hw-font-mono)",
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--hw-color-ink)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</span>
            <span style={{ color: "var(--hw-color-merged)" }}>+{f.added}</span>
            <span style={{ color: "var(--hw-color-conflict)" }}>
              {"−"}
              {f.removed}
            </span>
          </div>
          <div style={{ fontFamily: "var(--hw-font-mono)", fontSize: 12, lineHeight: 1.75, padding: "8px 0", overflowX: "auto" }}>
            {f.lines.map((l, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 16px minmax(0,1fr)",
                  background: l.sign === "+" ? "var(--hw-color-merged-soft)" : l.sign === "-" ? "var(--hw-color-conflict-soft)" : "transparent",
                  color: l.sign === "-" ? "var(--hw-color-ink-3)" : "var(--hw-color-ink)",
                }}
              >
                <span style={{ textAlign: "right", paddingRight: 10, color: "var(--hw-color-ink-4)" }}>{l.n}</span>
                <span>{l.sign}</span>
                <span style={{ whiteSpace: "pre" }}>{l.text}</span>
              </div>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// ── Logbook entry ─────────────────────────────────────────────────────────────

/** `code` and *emphasis*, the only inline markup a Logbook paragraph needs. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      m[1] !== undefined ? (
        <span key={m.index} style={{ fontFamily: "var(--hw-font-mono)", fontSize: 12 }}>
          {m[1]}
        </span>
      ) : (
        <em key={m.index}>{m[2]}</em>
      ),
    );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

function Section({ title, items, mono = false }: { title: string; items: string[]; mono?: boolean }): ReactElement | null {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ margin: 0, fontFamily: "var(--hw-font-display)", fontWeight: 500, fontSize: 17 }}>{title}</h3>
      {items.map((p, i) => (
        <p
          key={i}
          style={
            mono
              ? { margin: 0, fontFamily: "var(--hw-font-mono)", fontSize: 12.5, color: "var(--hw-color-ink-2)" }
              : { margin: 0, color: "var(--hw-color-ink-2)", lineHeight: 1.6, textWrap: "pretty" }
          }
        >
          {mono ? p : inline(p)}
        </p>
      ))}
    </div>
  );
}

function modelLine(l: LogbookView, strategy: string | null): string {
  const parts: string[] = [l.model];
  const s = l.strategy ?? strategy;
  if (s) parts.push(s);
  if (l.turns !== undefined) parts.push(l.turns === 1 ? "1 turn" : `${l.turns} turns`);
  if (l.costUsd !== undefined) parts.push(formatCost(l.costUsd));
  if (l.durationMs !== undefined) parts.push(formatDuration(l.durationMs));
  return parts.join(" · ");
}

function LogbookPanel({ commit: c, riverId, fixtures, nextChannel }: { commit: CommitView; riverId: string; fixtures: boolean; nextChannel: string }): ReactElement {
  const l = c.logbook;
  return (
    <div
      style={{
        border: "1px solid var(--hw-color-line)",
        background: "var(--hw-color-surface)",
        borderRadius: "var(--hw-radius-lg)",
        padding: "24px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--hw-color-channel)" }}>
          {l ? `Logbook · ${l.number}` : "Logbook"}
        </div>
        {l?.transcriptUrl ? (
          <a href={l.transcriptUrl} style={{ fontSize: 12.5 }} target={l.transcriptUrl.startsWith("#") ? undefined : "_blank"} rel="noreferrer">
            Full transcript →
          </a>
        ) : null}
      </div>
      {l ? (
        <>
          <Section title="Plan" items={paragraphs(l.plan)} />
          <Section title="Decisions" items={l.decisions} />
          <Section title="Rejected approaches" items={l.rejected} />
          <Section title="Notes for reviewers" items={paragraphs(l.notes)} />
          <Section title="Model and cost" items={[modelLine(l, c.strategy)]} mono />
        </>
      ) : (
        <p style={{ margin: 0, color: "var(--hw-color-ink-3)" }}>This commit has no Logbook entry.</p>
      )}
      <Replay commit={c} riverId={riverId} fixtures={fixtures} nextChannel={nextChannel} />
    </div>
  );
}

// ── Replay from here ──────────────────────────────────────────────────────────

function Replay({ commit: c, riverId, fixtures, nextChannel }: { commit: CommitView; riverId: string; fixtures: boolean; nextChannel: string }): ReactElement {
  const [agent, setAgent] = useState<string>(REPLAY_AGENTS[0]);
  const [strategy, setStrategy] = useState<Strategy>("minimal-diff");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chip = {
    fontSize: 12.5,
    padding: "8px 12px",
    border: "1px solid var(--hw-color-line-strong)",
    borderRadius: "var(--hw-radius-sm)",
    background: "var(--hw-color-paper)",
    gap: 8,
  } as const;

  const fork = async () => {
    setNote(null);
    if (fixtures) {
      setNote(`Sample data: ${nextChannel} would fork ${c.repo} at ${c.sha.slice(0, 7)} with ${agent} · ${strategy}.`);
      return;
    }
    setBusy(true);
    try {
      const res = await replayFrom(riverId, { repo: c.repo, sha: c.sha, agent, strategy });
      setNote(`${res?.channelId ?? nextChannel} is forking from ${c.sha.slice(0, 7)}.`);
      if (c.intentId) navigate({ screen: "river" });
    } catch (err) {
      setNote(`Couldn’t replay: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ borderTop: "1px solid var(--hw-color-line)", paddingTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--hw-color-ink-3)" }}>Replay from here</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <QuietSelect label="Agent" value={agent} options={REPLAY_AGENTS.map((a) => ({ value: a, label: a }))} onChange={setAgent} style={chip} />
        <QuietSelect label="Strategy" value={strategy} options={STRATEGIES.map((s) => ({ value: s, label: s }))} onChange={setStrategy} style={chip} />
        <button type="button" className={buttonClass("primary")} style={buttonStyle("primary", "11px 16px", "0.14em")} onClick={fork} disabled={busy} aria-busy={busy}>
          Fork {nextChannel}
        </button>
      </div>
      {note ? <p style={{ margin: 0, fontSize: 12.5, color: "var(--hw-color-ink-3)" }}>{note}</p> : null}
    </div>
  );
}

/** The next River-wide Channel id ("ch-10" after nine). */
function nextChannelId(river: RiverState, fixtures: boolean): string {
  let max = fixtures ? 9 : 0;
  for (const it of river.intents) {
    for (const ch of it.channels) {
      const m = /^ch-(\d+)$/.exec(ch.id);
      if (m) max = Math.max(max, Number(m[1]));
      const parsed = parseRepoName(ch.repo);
      if (parsed.kind === "channel") max = Math.max(max, parsed.n);
    }
  }
  return `ch-${max + 1}`;
}
