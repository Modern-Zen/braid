// ChannelAgent: one per Channel (one agent's attempt at an Intent, in its own fork).
// Holds the run state of the agent working the Channel. Driven by an AgentAdapter
// (scripted replay or live Claude Code); see ./adapters.
import { Agent } from "agents";
import type { ChannelStatus } from "@braid/protocol";

export interface ChannelState {
  channelId: string;
  riverId: string;
  intentId: string;
  status: ChannelStatus;
  statusText: string;
  headSha: string | null;
  commits: number;
  costUsd: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export class ChannelAgent extends Agent<Env, ChannelState> {
  override initialState: ChannelState = {
    channelId: "",
    riverId: "",
    intentId: "",
    status: "forking",
    statusText: "forking",
    headSha: null,
    commits: 0,
    costUsd: 0,
    startedAt: null,
    finishedAt: null,
  };

  override shouldConnectionBeReadonly(): boolean {
    return true;
  }

  async snapshot(): Promise<ChannelState> {
    return this.state;
  }
}
