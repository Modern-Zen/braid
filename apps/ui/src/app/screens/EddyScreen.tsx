// Screen C · Eddy: the only place a person is needed. States: 3 / 1 / zero decisions.
// Actions POST /api/rivers/:id/eddy/:card {action}; "open-scout" and "view-diff" are
// navigation, handled here and never sent.
import { useState, type ReactElement } from "react";
import type { EddyCard, EddyView, RiverState } from "@braid/protocol";
import { DecisionCard } from "../../components/DecisionCard.tsx";
import { EmptyState } from "../../components/EmptyState.tsx";
import { StatCounter } from "../../components/StatCounter.tsx";
import { plural } from "../../lib/format.ts";
import { decideEddy, getEddy, useResource } from "../data/api.ts";
import { eddyFixture, type EddyFixture } from "../data/fixtures.ts";
import { Link, navigate } from "../router.tsx";

const NAV_ACTIONS = new Set(["open-scout", "view-diff"]);

export interface EddyScreenProps {
  river: RiverState;
  fixtures: boolean;
  fixtureState: EddyFixture;
  /** The counter's numbers (the top bar's, so both agree). */
  counts: { agents: number; commits: number; decisions: number };
}

export function EddyScreen({ river, fixtures, fixtureState, counts }: EddyScreenProps): ReactElement {
  const refresh = fixtures ? fixtureState : `${river.decisions}:${river.feed[0]?.id ?? ""}`;
  const eddy = useResource<EddyView>(`eddy:${river.riverId}:${refresh}`, {
    fixtures,
    load: () => getEddy(river.riverId),
    fixture: () => eddyFixture(fixtureState),
  });
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cards = eddy.data?.cards ?? [];
  // On fixtures the counter follows the state bar; live, the inbox is the source of truth.
  const decisions = fixtures ? Math.min(counts.decisions, cards.length) : cards.length;

  const act = async (card: EddyCard, action: string) => {
    if (NAV_ACTIONS.has(action)) {
      navigate({ screen: "scout", intent: card.intentId });
      return;
    }
    setError(null);
    const view = eddy.data;
    if (!view) return;
    const without: EddyView = { ...view, cards: view.cards.filter((c) => c.id !== card.id) };
    if (fixtures || eddy.source === "fallback") {
      eddy.set(without);
      return;
    }
    setPending(card.id);
    try {
      await decideEddy(river.riverId, card.id, action);
      eddy.set(without);
    } catch (err) {
      setError(`Couldn’t send that decision: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPending(null);
    }
  };

  return (
    <section
      data-screen-label="C · Eddy"
      style={{ minHeight: "100%", padding: "64px 32px 48px", display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}
    >
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--hw-color-ink-3)" }}>Eddy</div>
        <StatCounter variant="eddy" agents={counts.agents} commits={counts.commits} previews={0} decisions={decisions} />
      </div>

      {eddy.data && cards.length === 0 ? (
        <EmptyState variant="eddy" />
      ) : eddy.data ? (
        <div style={{ width: "100%", maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 }}>
          {cards.map((card) => (
            <DecisionCard key={card.id} card={card} pending={pending === card.id ? card.id : null} onAction={(a) => act(card, a)} />
          ))}
          {error ? <p style={{ margin: 0, fontSize: 13, color: "var(--hw-color-conflict)", textAlign: "center" }}>{error}</p> : null}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "20px 0 0", fontSize: 13, color: "var(--hw-color-ink-3)" }}>
            <span>{plural(eddy.data.autoMerged, "change")} merged automatically.</span>
            <Link to={{ screen: "logbook" }} style={{ color: "var(--hw-color-ink-2)" }}>
              Review log →
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
