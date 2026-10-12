// Screen B · Scout: an Intent's Channels side by side, and the judge's verdict.
// States: running (Scout is watching) / verdict / tie (your call).
// The prototype has no Intent picker; it lives in the subtitle line.
import { useState, type ReactElement } from "react";
import type { IntentView, RiverState, ScoutView } from "@braid/protocol";
import { buttonClass, buttonStyle } from "../../components/buttons.ts";
import { EmptyState } from "../../components/EmptyState.tsx";
import { PreviewCard } from "../../components/PreviewCard.tsx";
import { QuietSelect } from "../../components/QuietSelect.tsx";
import { VerdictBanner, type VerdictState } from "../../components/VerdictBanner.tsx";
import { intentActivity, numberWord, plural } from "../../lib/format.ts";
import { getScout, pickChannel, useResource } from "../data/api.ts";
import { fixturePreviewDark, riverFixture, scoutFixture, type ScoutFixture } from "../data/fixtures.ts";
import { navigate } from "../router.tsx";
import { ScreenHeader } from "../ScreenHeader.tsx";

/** The Intent Scout should open on: one that's being judged, else the newest running one. */
export function preferredIntent(intents: IntentView[]): IntentView | undefined {
  const order = ["eddy", "scouting", "confluence", "running", "open", "merged"];
  return [...intents].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.openedAt - a.openedAt)[0];
}

export interface ScoutScreenProps {
  river: RiverState;
  intentId?: string;
  fixtures: boolean;
  fixtureState: ScoutFixture;
}

export function ScoutScreen({ river, intentId, fixtures, fixtureState }: ScoutScreenProps): ReactElement {
  // In fixture mode the picker lists the design's three Intents whatever the River state.
  const intents = fixtures ? riverFixture("running", river.riverId).intents : river.intents;
  const intent = (intentId && intents.find((i) => i.id === intentId)) || (intentId ? undefined : preferredIntent(intents));
  const id = intent?.id ?? intentId ?? "";
  const latest = river.feed[0]?.id ?? "";
  const scout = useResource<ScoutView>(`scout:${river.riverId}:${id}:${fixtures ? fixtureState : latest}`, {
    fixtures,
    load: () => getScout(river.riverId, id),
    fixture: () => scoutFixture(id, fixtureState),
  });

  if (!id) {
    return (
      <Shell subtitle={<span style={{ fontSize: 13, color: "var(--hw-color-ink-3)" }}>No intents yet</span>}>
        <EmptyState variant="scout" />
      </Shell>
    );
  }

  const view = scout.data;
  const n = view?.channels.length ?? intent?.channels.length ?? 0;
  const title = view?.intent.title ?? intent?.title ?? id;
  const options = intents.map((i) => ({ value: i.id, label: i.title }));
  if (!options.some((o) => o.value === id)) options.unshift({ value: id, label: title });

  const subtitle = (
    <span style={{ fontSize: 13, color: "var(--hw-color-ink-3)", display: "inline-flex", alignItems: "baseline", gap: 4 }}>
      <QuietSelect label="Intent" value={id} options={options} onChange={(v) => navigate({ screen: "scout", intent: v })} chevronColor="var(--hw-color-ink-4)">
        {title}
      </QuietSelect>
      <span>· {plural(n, "channel")}</span>
    </span>
  );

  if (!view) {
    return (
      <Shell subtitle={subtitle}>
        <EmptyState variant="scout" channels={Math.max(1, n)} text={`${numberWord(n)} channels are ${intentActivity(title)}. Previews and tests will appear here as they land.`} />
      </Shell>
    );
  }

  return (
    <Shell subtitle={subtitle}>
      <Verdict key={`${view.intent.id}:${view.state}`} view={view} riverId={river.riverId} fixtures={fixtures} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
        {view.channels.map((c) => {
          const repo = `${river.repo}--${c.id}`;
          const open = c.headSha ? () => navigate({ screen: "logbook", sha: c.headSha!, repo }) : undefined;
          return (
            <PreviewCard
              key={c.id}
              channel={c}
              tie={view.state === "tie"}
              dark={fixtures || scout.source === "fallback" ? fixturePreviewDark(c.id) : false}
              {...(open ? { onViewDiff: open, onReplay: open } : {})}
            />
          );
        })}
      </div>
    </Shell>
  );
}

function Shell({ subtitle, children }: { subtitle: ReactElement; children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <section data-screen-label="B · Scout" style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
      <ScreenHeader title="Scout">{subtitle}</ScreenHeader>
      {children}
    </section>
  );
}

function Verdict({ view, riverId, fixtures }: { view: ScoutView; riverId: string; fixtures: boolean }): ReactElement {
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state: VerdictState = view.state === "running" ? "watching" : view.state === "tie" ? "tie" : "ready";
  const ranked = [...(view.verdict?.ranked ?? [])].sort((a, b) => a.rank - b.rank);
  const ranks = ranked.map((r) => ({ rank: r.rank, id: r.channelId }));
  const text =
    view.state === "running" || !view.verdict
      ? `${numberWord(view.channels.length)} channels are ${intentActivity(view.intent.title)}. Previews and tests will appear here as they land.`
      : view.verdict.rationale;

  const pick = async (channelId: string) => {
    setError(null);
    if (fixtures) {
      setPicked(channelId);
      return;
    }
    try {
      await pickChannel(riverId, view.intent.id, channelId);
      setPicked(channelId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  let actions: ReactElement | null = null;
  if (view.state === "running") {
    actions = <span style={{ fontSize: 13, color: "var(--hw-color-ink-3)" }}>Verdict in ~1m</span>;
  } else if (picked) {
    actions = <span style={{ fontSize: 13, color: "var(--hw-color-ink-3)" }}>Picked {picked}. Confluence is merging it.</span>;
  } else if (view.state === "tie") {
    const tied = ranked.filter((r) => r.rank === 1).slice(0, 2);
    actions = (
      <>
        {tied.map((r, i) => (
          <button
            key={r.channelId}
            type="button"
            className={buttonClass(i === 0 ? "human" : "human-outline")}
            style={buttonStyle(i === 0 ? "human" : "human-outline")}
            onClick={() => pick(r.channelId)}
          >
            Pick {r.channelId}
          </button>
        ))}
      </>
    );
  } else if (ranked[0]) {
    const best = ranked[0].channelId;
    actions = (
      <button type="button" className={buttonClass("primary")} style={buttonStyle("primary")} onClick={() => pick(best)}>
        Pick {best}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <VerdictBanner state={state} text={text} ranks={ranks} actions={actions} />
      {error ? <p style={{ margin: 0, fontSize: 13, color: "var(--hw-color-conflict)" }}>Couldn’t pick: {error}</p> : null}
    </div>
  );
}
