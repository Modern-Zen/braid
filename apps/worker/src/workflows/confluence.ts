// ConfluenceWorkflow: the merge queue (M5). Serialized per River through RiverAgent.
//   fork the winner into river-<slug>--cf-<intent>-<attempt>
//   → in a sandbox, fetch main and rebase onto it
//   → on conflict: merge agent (live) or scripted resolution, then an Eddy `confirm` card
//   → re-test → policy allows ? push to main with Cost/Risk trailers : Eddy `approve` card
// Human decisions resume the instance with step.waitForEvent("eddy-decision").
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

export interface ConfluenceParams {
  riverId: string;
  intentId: string;
  channelId: string;
  attempt: number;
}

export class ConfluenceWorkflow extends WorkflowEntrypoint<Env, ConfluenceParams> {
  override async run(event: Readonly<WorkflowEvent<ConfluenceParams>>, step: WorkflowStep): Promise<unknown> {
    await step.do("validate", async () => {
      if (!event.payload?.riverId || !event.payload.intentId || !event.payload.channelId) {
        throw new NonRetryableError("riverId, intentId and channelId are required");
      }
      return true;
    });
    throw new NonRetryableError("Confluence lands in M5");
  }
}
