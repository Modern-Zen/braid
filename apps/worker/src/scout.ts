// Scout: side-by-side comparison of an Intent's Channels and the judge's verdict.
//
// maybeJudge() runs after every Channel finishes and after every review. When every finished
// Channel's head has a review, a judge ranks them on the acceptance checks, tests, diffstat,
// risk, cost and Logbooks, and writes a two-sentence rationale. Close calls become an Eddy
// `pick` card; otherwise the winner goes to Confluence.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAgentByName } from "agents";
import { z } from "zod";
import { DEFAULT_POLICY, parseLogbook, type Channel, type Intent, type ScoutChannel, type ScoutView, type Verdict } from "@braid/protocol";
import { readText } from "./artifacts.ts";
import { getIntent, getReview, getRiver, listChannels, logbookFor, setIntentStatus, type ReviewRow } from "./db.ts";
import { createCard } from "./eddy.ts";

const TIE_MARGIN = 0.05;

interface Candidate {
  channel: Channel;
  review: ReviewRow;
  logbook: { plan: string; decisions: string[] } | null;
  baseline: number;
}

const JudgeSchema = z.object({
  ranking: z.array(z.object({ channel: z.string(), score: z.number(), note: z.string() })),
  rationale: z.string(),
  tie: z.boolean(),
});
type JudgeOutput = z.infer<typeof JudgeSchema>;

export async function maybeJudge(env: Env, riverId: string, intentId: string): Promise<void> {
  const intent = await getIntent(env.DB, riverId, intentId);
  if (!intent || intent.status !== "scouting") return;
  const channels = await listChannels(env.DB, riverId, intentId);
  if (!channels.every((c) => ["done", "failed", "dropped"].includes(c.status))) return;

  const finished = channels.filter((c) => c.status === "done" && c.headSha);
  const candidates: Candidate[] = [];
  for (const ch of finished) {
    const review = await getReview(env.DB, ch.repo, ch.headSha!);
    if (!review || review.state === "running") return; // wait for the review of the final push
    candidates.push({ channel: ch, review, logbook: await readLogbook(env, riverId, ch), baseline: baselineScore(review, ch) });
  }

  // Claim the verdict so two reviews finishing together judge once.
  const claim = await env.DB.prepare(
    "INSERT INTO verdicts (river_id, intent_id, kind, ranked, rationale, judge_model, created_at) VALUES (?, ?, 'pending', '[]', '', '', ?) ON CONFLICT DO NOTHING",
  )
    .bind(riverId, intentId, Date.now())
    .run();
  if ((claim.meta.changes ?? 0) === 0) return;

  const river$ = await getAgentByName(env.RiverAgent, riverId);
  if (candidates.length === 0) {
    await setIntentStatus(env.DB, riverId, intentId, "eddy");
    await river$.setIntentStatus(intentId, "eddy");
    await env.DB.prepare("UPDATE verdicts SET kind = 'winner', rationale = ? WHERE river_id = ? AND intent_id = ?")
      .bind("No Channel finished with a reviewable head.", riverId, intentId)
      .run();
    return;
  }

  const judged = await judge(env, intent, candidates);
  const ranked = judged.ranking
    .filter((r) => candidates.some((c) => c.channel.id === r.channel))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ channelId: r.channel, rank: i + 1, note: r.note, score: r.score }));
  for (const c of candidates) {
    if (!ranked.some((r) => r.channelId === c.channel.id)) ranked.push({ channelId: c.channel.id, rank: ranked.length + 1, note: "", score: 0 });
  }
  const [first, second] = ranked;
  const bothGreen = (id?: string) => {
    const r = candidates.find((c) => c.channel.id === id)?.review;
    return !!r && r.state === "passed";
  };
  const tie = !!second && bothGreen(first?.channelId) && bothGreen(second.channelId) && (judged.tie || first!.score - second.score <= TIE_MARGIN);

  const verdict: Verdict = {
    intentId,
    riverId,
    kind: tie ? "tie" : "winner",
    ranked: ranked.map(({ channelId, rank, note }) => ({ channelId, rank, note })),
    rationale: judged.rationale,
    judgeModel: judged.model,
    createdAt: Date.now(),
  };
  await env.DB.prepare("UPDATE verdicts SET kind = ?, ranked = ?, rationale = ?, judge_model = ?, created_at = ? WHERE river_id = ? AND intent_id = ?")
    .bind(verdict.kind, JSON.stringify(verdict.ranked), verdict.rationale, verdict.judgeModel, verdict.createdAt, riverId, intentId)
    .run();
  await river$.recordEvent({
    id: `scout.verdict:${riverId}:${intentId}`,
    type: "scout.verdict",
    at: Date.now(),
    riverId,
    intentId,
    detail: tie ? `${intent.title} · tie ${first!.channelId} ↔ ${second!.channelId}` : `${intent.title} · ${first!.channelId} first`,
  });

  if (tie) {
    const a = candidates.find((c) => c.channel.id === first!.channelId)!;
    const b = candidates.find((c) => c.channel.id === second!.channelId)!;
    await setIntentStatus(env.DB, riverId, intentId, "eddy");
    await river$.setIntentStatus(intentId, "eddy");
    await createCard(env, {
      riverId,
      intentId,
      kind: "pick",
      question: `Pick ${pickNoun(intent.title)}`,
      meta: `${intent.title} · ${a.channel.id} vs ${b.channel.id}`,
      context: `Scout called a tie. ${summarize(a)} ${summarize(b)} ${judged.rationale}`.trim(),
      actions: [
        { id: `pick:${a.channel.id}`, label: `Pick ${a.channel.id}`, style: "primary" },
        { id: `pick:${b.channel.id}`, label: `Pick ${b.channel.id}`, style: "secondary" },
        { id: "open-scout", label: "Open Scout", style: "tertiary" },
      ],
    });
    return;
  }

  await setIntentStatus(env.DB, riverId, intentId, "confluence");
  await river$.setIntentStatus(intentId, "confluence");
  await river$.enqueueMerge({ intentId, channelId: first!.channelId, by: "auto" });
}

/** Deterministic score: tests dominate, then risk, then diff size and cost. Also the judge's fallback. */
export function baselineScore(r: ReviewRow, ch: Channel): number {
  const tests = r.tests_total ? (r.tests_passed ?? 0) / r.tests_total : 0;
  const risk = r.risk ?? 0.5;
  const size = (r.added ?? 0) + (r.removed ?? 0);
  const cost = ch.costUsd ?? 0;
  return round2(0.55 * tests + 0.25 * (1 - risk) + 0.12 * (1 - Math.min(1, size / 400)) + 0.08 * (1 - Math.min(1, cost / 2)));
}

async function readLogbook(env: Env, riverId: string, ch: Channel): Promise<Candidate["logbook"]> {
  const lb = await logbookFor(env.DB, riverId, ch.id);
  if (!lb || !ch.headSha) return null;
  const text = await readText(env.ARTIFACTS, ch.repo, ch.headSha, lb.path).catch(() => null);
  if (!text) return null;
  const e = parseLogbook(text, lb.number);
  return { plan: e.plan, decisions: e.decisions };
}

function describe(c: Candidate): string {
  const r = c.review;
  return [
    `### ${c.channel.id} · ${c.channel.agent} · ${c.channel.strategy}`,
    `tests ${r.tests_passed}/${r.tests_total}${r.failures && r.failures !== "[]" ? ` (failures: ${r.failures})` : ""}`,
    `diff +${r.added} -${r.removed} in ${r.files} files`,
    `risk ${r.risk?.toFixed(2)} (${(JSON.parse(r.risk_reasons ?? "[]") as string[]).join(" ")})`,
    `cost ${c.channel.costUsd != null ? `$${c.channel.costUsd.toFixed(2)}` : "unknown"}`,
    c.logbook ? `Logbook plan: ${c.logbook.plan}\nLogbook decisions: ${c.logbook.decisions.join(" ")}` : "No Logbook.",
  ].join("\n");
}

async function judge(env: Env, intent: Intent, candidates: Candidate[]): Promise<JudgeOutput & { model: string }> {
  const fallback = (): JudgeOutput & { model: string } => {
    const sorted = [...candidates].sort((a, b) => b.baseline - a.baseline);
    const [a, b] = sorted;
    return {
      ranking: sorted.map((c) => ({ channel: c.channel.id, score: c.baseline, note: summarize(c) })),
      rationale: b
        ? `${a!.channel.id} scores highest on tests, risk and diff size. ${b.channel.id} is next${a!.baseline - b.baseline <= TIE_MARGIN ? ", close enough to call a tie" : ""}.`
        : `${a!.channel.id} is the only Channel that finished.`,
      tie: false,
      model: "baseline",
    };
  };

  const e = env as Env & { CF_ACCOUNT_ID?: string; ANTHROPIC_API_KEY?: string; AI_GATEWAY_TOKEN?: string };
  if (!e.CF_ACCOUNT_ID || (!e.ANTHROPIC_API_KEY && !e.AI_GATEWAY_TOKEN)) return fallback();

  const model = (await getRiver(env.DB, intent.riverId))?.policy.judgeModel ?? DEFAULT_POLICY.judgeModel;
  const client = new Anthropic({
    // With a provider key stored in AI Gateway (BYOK) there is no key here, and the header is omitted.
    apiKey: e.ANTHROPIC_API_KEY ?? null,
    baseURL: `https://gateway.ai.cloudflare.com/v1/${e.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/anthropic`,
    defaultHeaders: {
      ...(e.AI_GATEWAY_TOKEN ? { "cf-aig-authorization": `Bearer ${e.AI_GATEWAY_TOKEN}` } : {}),
      ...(e.ANTHROPIC_API_KEY ? {} : { "x-api-key": null }),
    },
    maxRetries: 2,
  });

  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: zodOutputFormat(JudgeSchema) },
      messages: [
        {
          role: "user",
          content: `You are Scout, the judge on a Git platform where several AI agents attempt the same task in parallel. Rank the attempts for merging to main. Weigh the acceptance checks first, then test results, then risk, then how focused the diff is, then cost. Read the Logbooks for intent and judgment.

Return a score from 0 to 1 per Channel, a one-line note per Channel (what distinguishes it), a rationale of exactly two plain sentences comparing the top attempts, and tie: true only if the top two differ in approach rather than outcome and a person should choose.

## Intent: ${intent.title}
${intent.goal}

Acceptance checks:
${intent.checks.map((c) => `- ${c}`).join("\n") || "- Tests pass"}

## Attempts
${candidates.map(describe).join("\n\n")}`,
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return fallback();
    return { ...response.parsed_output, model: response.model };
  } catch (err) {
    console.error("judge failed, using the baseline", String(err));
    return fallback();
  }
}

function summarize(c: Candidate): string {
  const r = c.review;
  return `${c.channel.id} (${c.channel.strategy}) changes ${r.files} files (+${r.added} −${r.removed}) and passes ${r.tests_passed}/${r.tests_total} tests at risk ${r.risk?.toFixed(2)}.`;
}

/** "Add a dark mode" → "a dark mode"; "Refactor the gauge component" → "a refactor of the gauge component". */
export function pickNoun(title: string): string {
  const add = /^(?:add|build|create|make)\s+(.+)$/i.exec(title);
  if (add) return add[1]!;
  const verb = /^(refactor|rewrite|redesign|fix|improve|speed up|clean up)\s+(.+)$/i.exec(title);
  if (verb) return `a ${verb[1]!.toLowerCase()} of ${verb[2]}`;
  return `an approach for ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Scout view (GET /api/rivers/:id/intents/:intent/scout) ────────────────────

export async function scoutView(env: Env, riverId: string, intentId: string): Promise<ScoutView | null> {
  const intent = await getIntent(env.DB, riverId, intentId);
  if (!intent) return null;
  const channels = await listChannels(env.DB, riverId, intentId);
  const row = await env.DB.prepare("SELECT * FROM verdicts WHERE river_id = ? AND intent_id = ? AND kind != 'pending'")
    .bind(riverId, intentId)
    .first<{ kind: "winner" | "tie"; ranked: string; rationale: string; judge_model: string; created_at: number }>();
  const verdict: Verdict | null = row
    ? { intentId, riverId, kind: row.kind, ranked: JSON.parse(row.ranked), rationale: row.rationale, judgeModel: row.judge_model, createdAt: row.created_at }
    : null;

  const out: ScoutChannel[] = [];
  for (const ch of channels) {
    const review = ch.headSha ? await getReview(env.DB, ch.repo, ch.headSha) : null;
    const done = review && review.state !== "running";
    const ranked = verdict?.ranked.find((r) => r.channelId === ch.id);
    out.push({
      id: ch.id,
      agent: ch.agent,
      model: ch.model,
      strategy: ch.strategy,
      replay: ch.replay,
      status: ch.status,
      statusText: ch.statusText ?? ch.status,
      rank: ranked?.rank ?? null,
      tests: done ? { passed: review.tests_passed ?? 0, total: review.tests_total ?? 0 } : null,
      diff: done ? { added: review.added ?? 0, removed: review.removed ?? 0, files: review.files ?? 0 } : null,
      costUsd: ch.costUsd ?? null,
      durationMs: ch.durationMs ?? null,
      risk: done ? review.risk : null,
      note: ranked?.note ?? null,
      previewUrl: ch.previewUrl ?? null,
      screenshotUrl: ch.screenshotKey ? `/api/rivers/${riverId}/screenshots/${ch.id}` : null,
      headSha: ch.headSha ?? null,
    });
  }
  return {
    intent: { id: intent.id, title: intent.title, status: intent.status },
    state: verdict ? (verdict.kind === "tie" ? "tie" : "verdict") : "running",
    verdict,
    channels: out,
  };
}
