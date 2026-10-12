// ConfluenceWorkflow: the merge queue, one run per (Intent, attempt), serialized per River by
// RiverAgent. Durable and retryable: a merge survives failures mid-flight.
//
//   fork the winner → river-<slug>--cf-<intent>-<attempt>
//   → rebase onto main (or merge + resolve: recorded resolution, else a person picks a side)
//   → re-test → Eddy `confirm` if a resolution was made
//   → policy: risk < autoMergeRisk and green → land, else Eddy `approve`
//   → land on main as a --no-ff merge with Cost/Risk trailers → confluence.picked
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { getAgentByName } from "agents";
import { confluenceRepoName, formatCost, formatRisk, shortSha, withTrailers, type EddyCard } from "@braid/protocol";
import { artifactsErrorCode, forkRepo, repoInfo, waitReady } from "../artifacts.ts";
import { cfSandbox, integrate, land, resolveBySide, type IntegrateInput } from "../confluence.ts";
import { getChannel, getIntent, getReview, getRiver, listChannels, listIntents, logbookFor, setIntentStatus, updateChannel } from "../db.ts";
import { createCard, syncDecisions } from "../eddy.ts";
import { refreshHead } from "../intents.ts";
import { runReview } from "../review.ts";

export interface ConfluenceParams {
  riverId: string;
  intentId: string;
  channelId: string;
  attempt: number;
  /** "you" when a person picked the Channel in the Eddy. */
  by: "auto" | "you";
}

type Decision = { cardId: string; action: string; by: string };

export class ConfluenceWorkflow extends WorkflowEntrypoint<Env, ConfluenceParams> {
  override async run(event: Readonly<WorkflowEvent<ConfluenceParams>>, step: WorkflowStep): Promise<unknown> {
    const p = event.payload;
    if (!p?.riverId || !p.intentId || !p.channelId) throw new NonRetryableError("riverId, intentId and channelId are required");
    const ids = { riverId: p.riverId, intentId: p.intentId, workflowId: event.instanceId };
    let humanDecided = p.by === "you";

    const ctx = await step.do("load", async () => {
      const river = await getRiver(this.env.DB, p.riverId);
      const intent = await getIntent(this.env.DB, p.riverId, p.intentId);
      const channel = await getChannel(this.env.DB, p.riverId, p.channelId);
      if (!river || !intent || !channel?.headSha) throw new NonRetryableError("river, intent or channel head missing");
      const review = await getReview(this.env.DB, channel.repo, channel.headSha);
      const verdict = await this.env.DB.prepare("SELECT kind, rationale FROM verdicts WHERE river_id = ? AND intent_id = ?")
        .bind(p.riverId, p.intentId)
        .first<{ kind: string; rationale: string }>();
      const lb = await logbookFor(this.env.DB, p.riverId, p.channelId);
      return {
        mainRepo: river.mainRepo,
        mainRemote: river.remote,
        autoMergeRisk: river.policy.autoMergeRisk,
        title: intent.title,
        mode: intent.mode,
        repo: channel.repo,
        agent: channel.agent,
        model: channel.model ?? "",
        strategy: channel.strategy,
        costUsd: channel.costUsd ?? null,
        risk: review?.risk ?? 0.5,
        reasons: JSON.parse(review?.risk_reasons ?? "[]") as string[],
        rationale: verdict?.rationale ?? "",
        judgeConfident: verdict?.kind === "winner",
        logbook: lb?.number ?? "",
      };
    });

    const river = async () => getAgentByName(this.env.RiverAgent, p.riverId);

    const cfName = confluenceRepoName(p.riverId, p.intentId, p.attempt);
    const cf = await step.do("fork for confluence", async () => {
      try {
        const f = await forkRepo(this.env.ARTIFACTS, ctx.repo, cfName, `Confluence · ${ctx.title} · ${p.channelId}`);
        await waitReady(this.env.ARTIFACTS, cfName);
        return { name: f.name, remote: f.remote };
      } catch (err) {
        if (artifactsErrorCode(err) !== "ALREADY_EXISTS") throw err;
        const info = await repoInfo(this.env.ARTIFACTS, cfName);
        if (!info) throw err;
        return { name: info.name, remote: info.remote };
      }
    });

    const input: IntegrateInput = {
      riverId: p.riverId,
      intentId: p.intentId,
      attempt: p.attempt,
      strategy: ctx.strategy,
      mode: ctx.mode,
      cf,
      main: { name: ctx.mainRepo, remote: ctx.mainRemote },
    };

    let merged = await step.do("rebase onto main", { retries: { limit: 2, delay: "10 seconds" }, timeout: "6 minutes" }, async () =>
      integrate(this.env, input),
    );

    // An unresolved conflict: a person picks which side wins.
    if (merged.state === "conflict") {
      const d = await this.ask(step, "conflict", {
        kind: "confirm",
        question: "Resolve a merge conflict",
        meta: `${p.channelId}${merged.against ? ` ↔ ${merged.against}` : ""} · ${merged.conflicted.join(", ")}`,
        context: `${p.channelId} and main both changed ${merged.conflicted.join(", ")}, and there is no recorded resolution. Keep this Channel's version of the conflicting lines, keep main's, or drop this merge.`,
        actions: [
          { id: "keep-channel", label: `Keep ${p.channelId}`, style: "primary" },
          { id: "keep-main", label: "Keep main", style: "secondary" },
          { id: "drop", label: "Drop", style: "tertiary" },
        ],
      }, ids);
      humanDecided = true;
      if (d.action === "drop") return this.finish(step, p, "dropped", ctx.title);
      const head = await step.do("resolve by side", async () =>
        resolveBySide(this.env, input, d.action === "keep-channel" ? "channel" : "main"),
      );
      merged = { ...merged, state: "resolved", head, resolvedBy: "you" };
    }

    const test = await step.do("re-test", { retries: { limit: 2, delay: "15 seconds" }, timeout: "12 minutes" }, async () => {
      const r = await runReview(this.env, { repo: cf.name, remote: cf.remote, sha: merged.head, mainRepo: ctx.mainRepo, mainRemote: ctx.mainRemote, intentTitle: ctx.title });
      await this.env.BLOBS.put(`diffs/${cf.name}/${merged.head}.json`, JSON.stringify({ files: r.files, message: r.message }), {
        httpMetadata: { contentType: "application/json" },
      });
      return { passed: r.tests.passed, total: r.tests.total, ran: r.testsRan };
    });
    const green = !test.ran || (test.total > 0 && test.passed === test.total);
    if (!green) {
      await step.do("record failure", async () => {
        await (await river()).recordEvent({
          id: `review:${cf.name}:${merged.head}`,
          type: "review.failed",
          at: Date.now(),
          riverId: p.riverId,
          intentId: p.intentId,
          channelId: p.channelId,
          detail: `${p.channelId} · confluence · tests ${test.passed}/${test.total}`,
        });
        return true;
      });
      return this.finish(step, p, "failed", ctx.title);
    }

    // A resolution was made: a person confirms it.
    if (merged.state === "resolved" && merged.resolvedBy !== "you") {
      const d = await this.ask(step, "resolution", {
        kind: "confirm",
        question: "Confirm merge resolution",
        meta: `${p.channelId}${merged.against ? ` ↔ ${merged.against}` : ""} · ${merged.conflicted.join(", ")}`,
        context: `Both channels touched ${merged.conflicted.join(", ")}. ${merged.notes ?? ""} The combined build passes ${test.passed}/${test.total}. Confirm, or open the diff.`.replace(/\s+/g, " ").trim(),
        actions: [
          { id: "confirm", label: "Confirm", style: "primary" },
          { id: "view-diff", label: "View diff", style: "secondary" },
          { id: "drop", label: "Drop", style: "tertiary" },
        ],
      }, ids);
      humanDecided = true;
      if (d.action !== "confirm") return this.finish(step, p, "dropped", ctx.title);
    }

    // Policy: auto-merge only when risk is low, tests are green, and the judge was confident.
    const autoOk = ctx.risk < ctx.autoMergeRisk && (ctx.judgeConfident || p.by === "you");
    if (!autoOk) {
      const area = /api/i.test(ctx.title) ? " to /api" : "";
      const d = await this.ask(step, "approve", {
        kind: "approve",
        question: `Approve a high-risk change${area}`,
        meta: `${ctx.title} · ${p.channelId} · risk ${formatRisk(ctx.risk)}`,
        context: `${ctx.reasons.join(" ")} Tests ${test.passed}/${test.total}.${ctx.logbook ? ` Logbook ${ctx.logbook} explains the decisions.` : ""}`.trim(),
        actions: [
          { id: "approve", label: "Approve", style: "primary" },
          { id: "ask-changes", label: "Ask for changes", style: "secondary" },
        ],
      }, ids);
      humanDecided = true;
      if (d.action !== "approve") return this.finish(step, p, "dropped", ctx.title);
    }

    const by = humanDecided ? "you" : "auto";
    const landed = await step.do("land on main", { retries: { limit: 3, delay: "5 seconds" }, timeout: "5 minutes" }, async () => {
      const message = withTrailers(
        `Confluence: ${ctx.title} (${p.channelId})\n\n${by === "you" ? "Picked by you." : ctx.rationale || "Merged automatically: low risk, tests green."}`,
        {
          intent: p.intentId,
          channel: p.channelId,
          agent: ctx.agent,
          model: ctx.model,
          cost: ctx.costUsd != null ? formatCost(ctx.costUsd) : undefined,
          risk: formatRisk(ctx.risk),
          logbook: ctx.logbook || undefined,
        },
      );
      return land(this.env, input, message);
    });

    await step.do("record merge", async () => {
      const r = await river();
      await updateChannel(this.env.DB, p.riverId, p.channelId, { status: "merged", statusText: "merged" });
      await r.updateChannel(p.intentId, p.channelId, { status: "merged", statusText: "merged", progress: 1 });
      for (const ch of await listChannels(this.env.DB, p.riverId, p.intentId)) await r.releaseLines(ch.id);
      await r.recordEvent({
        id: `confluence.picked:${p.riverId}:${p.intentId}`,
        type: "confluence.picked",
        at: Date.now(),
        riverId: p.riverId,
        intentId: p.intentId,
        channelId: p.channelId,
        by,
        detail: `${p.channelId} · ${ctx.title} · ${by === "you" ? "by you" : "auto"}`,
        data: { sha: landed, commits: 1 },
      });
      return true;
    });

    return this.finish(step, p, "merged", ctx.title, landed);
  }

  /** Open an Eddy card, release the merge lock, and wait for the person. */
  private async ask(
    step: WorkflowStep,
    name: string,
    card: Pick<EddyCard, "kind" | "question" | "meta" | "context" | "actions">,
    ids: { riverId: string; intentId: string; workflowId: string },
  ): Promise<Decision> {
    await step.do(`open ${name} card`, async () => {
      await createCard(this.env, { ...card, id: `${card.kind}:${ids.workflowId}:${name}`, riverId: ids.riverId, intentId: ids.intentId, workflowId: ids.workflowId });
      await (await getAgentByName(this.env.RiverAgent, ids.riverId)).mergeParked(ids.intentId);
      return true;
    });
    const ev = await step.waitForEvent<Decision>(`wait for ${name}`, { type: "eddy-decision", timeout: "7 days" });
    await step.do(`resume after ${name}`, async () => {
      await (await getAgentByName(this.env.RiverAgent, ids.riverId)).mergeResumed(ids.intentId);
      return true;
    });
    return ev.payload;
  }

  private async finish(
    step: WorkflowStep,
    p: ConfluenceParams,
    outcome: "merged" | "failed" | "dropped",
    title: string,
    landed?: string,
  ): Promise<unknown> {
    await step.do("finish", async () => {
      const r = await getAgentByName(this.env.RiverAgent, p.riverId);
      const status = outcome === "merged" ? "merged" : "eddy";
      await setIntentStatus(this.env.DB, p.riverId, p.intentId, status);
      await r.setIntentStatus(p.intentId, status);
      if (outcome !== "merged") {
        await updateChannel(this.env.DB, p.riverId, p.channelId, { statusText: outcome === "failed" ? "confluence tests failed" : "dropped" });
      }
      const head = await refreshHead(this.env, p.riverId);
      await r.mergeFinished(p.intentId, outcome);
      await syncDecisions(this.env, p.riverId);
      const intents = await listIntents(this.env.DB, p.riverId);
      if (outcome === "merged" && intents.length > 0 && intents.every((i) => i.status === "merged")) {
        const mine = await this.env.DB.prepare("SELECT COUNT(*) AS n FROM eddy_cards WHERE river_id = ? AND decided_by IS NOT NULL")
          .bind(p.riverId)
          .first<{ n: number }>();
        await r.recordEvent({
          id: `river.merged:${p.riverId}:${head}`,
          type: "river.merged",
          at: Date.now(),
          riverId: p.riverId,
          detail: `main @ ${head ?? (landed ? shortSha(landed) : "?")} · ${intents.length} intents`,
          data: { decisions: mine?.n ?? 0 },
        });
      }
      return true;
    });
    await step.do("clean up sandbox", async () => {
      await cfSandbox(this.env, p).destroy();
      return true;
    });
    return { outcome, intent: title, landed: landed ?? null };
  }
}
