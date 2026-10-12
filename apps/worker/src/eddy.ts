// Eddy: the human inbox. Only decisions that need a person land here.
//   pick     choose between Channels (a Scout tie)
//   approve  merge a high-risk change (risk ≥ policy)
//   confirm  accept a merge resolution Confluence made
// Decisions that a Workflow is waiting on resume it with the `eddy-decision` event.
import { getAgentByName } from "agents";
import type { EddyCard, EddyView } from "@braid/protocol";
import { setIntentStatus } from "./db.ts";
import { HttpError } from "./intents.ts";

/** Actions the UI handles itself (navigation); they don't close the card. */
const UI_ONLY = new Set(["open-scout", "view-diff"]);

interface CardRow {
  id: string;
  river_id: string;
  intent_id: string;
  kind: EddyCard["kind"];
  question: string;
  meta: string;
  context: string;
  actions: string;
  workflow_id: string | null;
  decision: string | null;
  decided_at: number | null;
  created_at: number;
}

const toCard = (r: CardRow): EddyCard => ({
  id: r.id,
  riverId: r.river_id,
  intentId: r.intent_id,
  kind: r.kind,
  question: r.question,
  meta: r.meta,
  context: r.context,
  actions: JSON.parse(r.actions) as EddyCard["actions"],
  workflowId: r.workflow_id ?? undefined,
  decision: r.decision ?? undefined,
  decidedAt: r.decided_at ?? undefined,
  createdAt: r.created_at,
});

export async function createCard(env: Env, card: Omit<EddyCard, "id" | "createdAt"> & { id?: string }): Promise<EddyCard> {
  const full: EddyCard = { ...card, id: card.id ?? `${card.kind}:${card.intentId}:${crypto.randomUUID().slice(0, 8)}`, createdAt: Date.now() };
  await env.DB.prepare(
    `INSERT INTO eddy_cards (id, river_id, intent_id, kind, question, meta, context, actions, workflow_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
  )
    .bind(full.id, full.riverId, full.intentId, full.kind, full.question, full.meta, full.context, JSON.stringify(full.actions), full.workflowId ?? null, full.createdAt)
    .run();
  const river = await getAgentByName(env.RiverAgent, full.riverId);
  await river.recordEvent({
    id: `eddy.card:${full.id}`,
    type: "eddy.card",
    at: full.createdAt,
    riverId: full.riverId,
    intentId: full.intentId,
    detail: `${full.question} · ${full.meta}`,
  });
  await syncDecisions(env, full.riverId);
  return full;
}

export async function eddyView(env: Env, riverId: string): Promise<EddyView> {
  const { results } = await env.DB.prepare("SELECT * FROM eddy_cards WHERE river_id = ? AND decided_at IS NULL ORDER BY created_at")
    .bind(riverId)
    .all<CardRow>();
  const river = await (await getAgentByName(env.RiverAgent, riverId)).snapshot();
  return { cards: results.map(toCard), autoMerged: river.counters.autoMerged };
}

export async function decide(env: Env, riverId: string, cardId: string, action: string, by: string): Promise<{ ok: boolean; card: EddyCard }> {
  const row = await env.DB.prepare("SELECT * FROM eddy_cards WHERE id = ? AND river_id = ?").bind(cardId, riverId).first<CardRow>();
  if (!row) throw new HttpError(404, "No such card");
  const card = toCard(row);
  if (!card.actions.some((a) => a.id === action)) throw new HttpError(400, `Unknown action "${action}"`);
  if (UI_ONLY.has(action)) return { ok: true, card };
  if (card.decidedAt) throw new HttpError(409, "Already decided");

  const decided = await env.DB.prepare("UPDATE eddy_cards SET decision = ?, decided_by = ?, decided_at = ? WHERE id = ? AND decided_at IS NULL")
    .bind(action, by, Date.now(), cardId)
    .run();
  if ((decided.meta.changes ?? 0) === 0) throw new HttpError(409, "Already decided");

  const river = await getAgentByName(env.RiverAgent, riverId);
  if (card.kind === "pick" && action.startsWith("pick:")) {
    const channelId = action.slice("pick:".length);
    await setIntentStatus(env.DB, riverId, card.intentId, "confluence");
    await river.setIntentStatus(card.intentId, "confluence");
    await river.enqueueMerge({ intentId: card.intentId, channelId, by: "you" });
  } else if (card.workflowId) {
    // approve / ask-changes / confirm: resume the waiting Confluence run.
    const instance = await env.CONFLUENCE_WF.get(card.workflowId);
    await instance.sendEvent({ type: "eddy-decision", payload: { cardId, action, by } });
  }
  await syncDecisions(env, riverId);
  return { ok: true, card: { ...card, decision: action, decidedAt: Date.now() } };
}

export async function syncDecisions(env: Env, riverId: string): Promise<number> {
  const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM eddy_cards WHERE river_id = ? AND decided_at IS NULL")
    .bind(riverId)
    .first<{ n: number }>();
  const n = open?.n ?? 0;
  await (await getAgentByName(env.RiverAgent, riverId)).setDecisions(n);
  return n;
}
