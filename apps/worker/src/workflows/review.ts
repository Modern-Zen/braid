// ReviewWorkflow: started by every cf.artifacts.repo.pushed in the `braid` namespace
// (wrangler triggers.events). One instance per push.
//
// M0: store the raw event, classify the repo, put repo.pushed on the River feed.
// M3 adds: clone at `after` in a sandbox → install → tests → diffstat vs main →
// risk score → store → review.passed | review.failed. Idempotent on (repo, after).
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { getAgentByName } from "agents";
import { parseRepoName } from "@braid/protocol";
import { asArtifactsEvent, storeRawEvent, toFeedEvent } from "../events.ts";

export class ReviewWorkflow extends WorkflowEntrypoint<Env, unknown> {
  override async run(event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep): Promise<unknown> {
    // Day-1 rule: the raw delivery goes to R2 before anything else.
    const rawKey = await step.do("store raw event", async () =>
      storeRawEvent(this.env, { workflowEvent: event }, "workflow"),
    );

    const e = asArtifactsEvent(event.payload) ?? asArtifactsEvent(event);
    if (!e || e.type !== "cf.artifacts.repo.pushed") return { rawKey, skipped: "not a push" };

    const repo = parseRepoName(e.source.repoName);
    if (repo.kind !== "channel") return { rawKey, repo: e.source.repoName, skipped: repo.kind };

    const feed = toFeedEvent(e);
    if (feed) {
      await step.do("record repo.pushed", async () => {
        const river = await getAgentByName(this.env.RiverAgent, feed.riverId);
        await river.recordEvent(feed);
        return feed.id;
      });
    }
    return { rawKey, repo: e.source.repoName, after: String(e.payload.after ?? "") };
  }
}
