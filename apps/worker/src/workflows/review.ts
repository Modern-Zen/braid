// ReviewWorkflow: started by every cf.artifacts.repo.pushed in the `braid` namespace
// (wrangler triggers.events). One instance per push. Idempotent on (repo, after).
//
//   raw event → R2 · classify repo · claim (repo, sha) · repo.pushed on the feed
//   → sandbox: checkout, diffstat vs main, install, tests · diff cached to R2
//   → risk (Workers AI, deterministic floor) · store · review.passed | review.failed
//   → Scout, once every Channel of the Intent is finished and reviewed.
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { getAgentByName } from "agents";
import { parseRepoName, shortSha, type FeedEvent } from "@braid/protocol";
import { claimReview, finishReview, getChannelByRepo, getIntent, getRiver, recordEventIndex, updateChannel } from "../db.ts";
import { asArtifactsEvent, eventKey, storeRawEvent, toFeedEvent, type PushedPayload } from "../events.ts";
import { refreshHead } from "../intents.ts";
import { runReview, scoreRisk } from "../review.ts";
import { maybeJudge } from "../scout.ts";

export class ReviewWorkflow extends WorkflowEntrypoint<Env, unknown> {
  override async run(event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep): Promise<unknown> {
    // Day-1 rule: the raw delivery goes to R2 before anything else.
    const rawKey = await step.do("store raw event", async () => storeRawEvent(this.env, { workflowEvent: event }, "workflow"));

    const e = asArtifactsEvent(event.payload) ?? asArtifactsEvent(event);
    if (!e || e.type !== "cf.artifacts.repo.pushed") return { rawKey, skipped: "not a push" };
    const p = e.payload as unknown as PushedPayload;
    const repo = e.source.repoName;
    const parsed = parseRepoName(repo);
    await step.do("index event", async () => recordEventIndex(this.env.DB, { key: eventKey(e), type: e.type, repo, rawKey }));

    if (parsed.kind === "main") {
      // Seed or Confluence merge: keep the River's HEAD current.
      await step.do("refresh head", async () => refreshHead(this.env, parsed.river));
      return { rawKey, repo, head: p.after };
    }
    if (parsed.kind !== "channel" || /^0+$/.test(p.after)) return { rawKey, repo, skipped: parsed.kind };

    const channel = await step.do("find channel", async () => {
      const ch = await getChannelByRepo(this.env.DB, repo);
      if (!ch) return null;
      const src = await this.env.DB.prepare("SELECT source FROM channels WHERE repo = ?").bind(repo).first<{ source: string }>();
      return { riverId: ch.riverId, channelId: ch.id, intentId: ch.intentId, remote: ch.remote, external: src?.source === "mcp", commits: ch.commits };
    });
    if (!channel) return { rawKey, repo, skipped: "unknown channel" };

    const claimed = await step.do("claim review", async () =>
      claimReview(this.env.DB, { repo, sha: p.after, riverId: channel.riverId, channelId: channel.channelId, intentId: channel.intentId }),
    );
    if (!claimed) return { rawKey, repo, sha: p.after, skipped: "already reviewed" };

    const feed = toFeedEvent(e);
    if (feed) {
      await step.do("record repo.pushed", async () => {
        const river = await getAgentByName(this.env.RiverAgent, channel.riverId);
        await river.recordEvent(feed);
        if (channel.external) {
          // No ChannelAgent drives an MCP Channel: the push itself advances it on the map.
          const commits = channel.commits + p.totalCommitsCount;
          await updateChannel(this.env.DB, channel.riverId, channel.channelId, { headSha: p.after, commits, status: "pushed", statusText: `pushed ${p.after.slice(0, 4)}…` });
          await river.updateChannel(channel.intentId, channel.channelId, {
            headSha: p.after,
            commits,
            status: "pushed",
            statusText: `pushed ${p.after.slice(0, 4)}…`,
            progress: Math.min(0.75, 0.2 + 0.12 * commits),
          });
        }
        return feed.id;
      });
    }

    const ctx = await step.do("load context", async () => {
      const river = await getRiver(this.env.DB, channel.riverId);
      const intent = await getIntent(this.env.DB, channel.riverId, channel.intentId);
      if (!river) throw new Error(`river ${channel.riverId} missing`);
      return { mainRepo: river.mainRepo, mainRemote: river.remote, intentTitle: intent?.title ?? channel.intentId };
    });

    const run = await step.do("test in sandbox", { retries: { limit: 2, delay: "15 seconds", backoff: "linear" }, timeout: "12 minutes" }, async () => {
      const r = await runReview(this.env, { repo, remote: channel.remote, sha: p.after, ...ctx });
      // Cache the diff for the Logbook view; keep the step result small.
      await this.env.BLOBS.put(`diffs/${repo}/${p.after}.json`, JSON.stringify({ files: r.files, message: r.message }), {
        httpMetadata: { contentType: "application/json" },
      });
      return { tests: r.tests, testsRan: r.testsRan, diff: r.diff, paths: r.paths, rawDiff: r.rawDiff, logKey: r.logKey };
    });

    const risk = await step.do("score risk", async () =>
      scoreRisk(this.env, { intentTitle: ctx.intentTitle, paths: run.paths, diff: run.diff, tests: run.tests, rawDiff: run.rawDiff }),
    );

    const ok = !run.testsRan || (run.tests.total > 0 && run.tests.passed === run.tests.total);
    await step.do("store review", async () => {
      await finishReview(this.env.DB, repo, p.after, {
        ok,
        passed: run.tests.passed,
        total: run.tests.total,
        failures: run.tests.failures ?? [],
        added: run.diff.added,
        removed: run.diff.removed,
        files: run.diff.files,
        risk: risk.risk,
        reasons: risk.reasons,
        logKey: run.logKey,
      });
      const river = await getAgentByName(this.env.RiverAgent, channel.riverId);
      const ev: FeedEvent = {
        id: `review:${repo}:${p.after}`,
        type: ok ? "review.passed" : "review.failed",
        at: Date.now(),
        riverId: channel.riverId,
        intentId: channel.intentId,
        channelId: channel.channelId,
        detail: `${channel.channelId} · tests ${run.tests.passed}/${run.tests.total} · risk ${risk.risk.toFixed(2)}`,
        data: { sha: p.after, risk: risk.risk, passed: run.tests.passed, total: run.tests.total },
      };
      await river.recordEvent(ev);
      // Show the latest result on the map once the agent is done editing.
      const snapshot = await river.snapshot();
      const view = snapshot.intents.find((i) => i.id === channel.intentId)?.channels.find((c) => c.id === channel.channelId);
      if (view && view.headSha === p.after && (view.status === "done" || view.status === "pushed")) {
        await river.updateChannel(channel.intentId, channel.channelId, {
          statusText: ok ? "tests ✓" : `tests ${run.tests.passed}/${run.tests.total}`,
        });
      }
      return ok;
    });

    await step.do("maybe scout", async () => {
      await maybeJudge(this.env, channel.riverId, channel.intentId);
      return true;
    });

    return { rawKey, repo, sha: shortSha(p.after), ok, risk: risk.risk, tests: run.tests };
  }
}
