// Replay: time travel for agent work. Fork any Channel at any commit into a new Channel
// and run it again with a different strategy or model. It falls out of Artifacts: the new
// Channel is a fork of the old one, reset to the chosen commit.
import { getAgentByName } from "agents";
import { channelId as channelIdOf, channelRepoName, logbookNumber, logbookPath, type ChannelView, type Strategy } from "@braid/protocol";
import { forkRepo, mintToken, remoteParts, waitReady } from "./artifacts.ts";
import { getChannel, getIntent, getRiver, insertChannel, insertLogbookIndex, reserveChannelNumbers, reserveLogbookNumber, setIntentStatus } from "./db.ts";
import { HttpError } from "./intents.ts";
import { q, sandboxFor } from "./sandbox.ts";

export interface ReplayRequest {
  sha: string;
  strategy: Strategy;
  /** Model for the live agent; defaults to LIVE_MODEL. */
  model?: string;
}

export async function replayChannel(env: Env, riverId: string, fromChannelId: string, req: ReplayRequest): Promise<{ channel: string; repo: string }> {
  if (!/^[0-9a-f]{7,40}$/.test(req.sha)) throw new HttpError(400, "sha must be a commit hash");
  const river = await getRiver(env.DB, riverId);
  const from = await getChannel(env.DB, riverId, fromChannelId);
  if (!river || !from) throw new HttpError(404, "No such River or Channel");
  const intent = await getIntent(env.DB, riverId, from.intentId);
  if (!intent) throw new HttpError(404, "No such Intent");

  const n = await reserveChannelNumbers(env.DB, riverId, 1);
  const id = channelIdOf(n);
  const repo = channelRepoName(riverId, n);
  const fork = await forkRepo(env.ARTIFACTS, from.repo, repo, `Replay of ${from.id} from ${req.sha.slice(0, 7)} · ${req.strategy}`);
  await waitReady(env.ARTIFACTS, repo);

  // Reset the fork to the chosen commit, in a sandbox, with plain git.
  const token = await mintToken(env.ARTIFACTS, repo, "write", 600);
  const { host, path } = remoteParts(fork.remote);
  const sandbox = sandboxFor(env, `replay:${repo}`);
  await sandbox.grant({ artifactsHost: host, repos: { [path]: { token: token.plaintext, write: true } }, allowNpm: false }, "lite");
  const r = await sandbox.sh(
    [
      `rm -rf /workspace/replay && git clone -q ${q(fork.remote)} /workspace/replay && cd /workspace/replay`,
      `git reset -q --hard ${q(req.sha)}`,
      "git push -q --force origin HEAD:main",
      "git rev-parse HEAD",
    ].join("\n"),
    { timeoutSec: 120 },
  );
  await sandbox.destroy();
  if (r.exitCode !== 0) throw new HttpError(400, `Could not reset to ${req.sha.slice(0, 7)}: ${r.stderr.slice(-300)}`);

  const model = req.model ?? env.LIVE_MODEL;
  await insertChannel(env.DB, {
    id,
    riverId,
    intentId: intent.id,
    repo,
    remote: fork.remote,
    agent: "claude-code",
    model,
    strategy: req.strategy,
    replay: false,
    status: "cloning",
    statusText: `replay from ${req.sha.slice(0, 7)}`,
    commits: 0,
    createdAt: Date.now(),
  });
  await env.DB.prepare("UPDATE channels SET parent_channel = ?, parent_sha = ? WHERE river_id = ? AND id = ?")
    .bind(from.id, req.sha, riverId, id)
    .run();
  const number = logbookNumber(await reserveLogbookNumber(env.DB, riverId));
  await insertLogbookIndex(env.DB, { riverId, number, channelId: id, intentId: intent.id, repo, path: logbookPath(number, id), agent: "claude-code", model });

  const river$ = await getAgentByName(env.RiverAgent, riverId);
  const view: ChannelView = {
    id,
    intentId: intent.id,
    repo,
    agent: "claude-code",
    model,
    strategy: req.strategy,
    replay: false,
    status: "cloning",
    statusText: `replay from ${req.sha.slice(0, 7)}`,
    progress: 0.06,
    marks: [],
    commits: 0,
  };
  const snapshot = await river$.snapshot();
  const existing = snapshot.intents.find((i) => i.id === intent.id);
  if (existing) await river$.upsertIntent({ ...existing, status: "running", channels: [...existing.channels, view] });
  if (intent.status !== "running") {
    await setIntentStatus(env.DB, riverId, intent.id, "running");
    await river$.setIntentStatus(intent.id, "running");
  }
  await river$.recordEvent({
    id: `forked:${from.repo}:${repo}`,
    type: "repo.forked",
    at: Date.now(),
    riverId,
    intentId: intent.id,
    channelId: id,
    detail: `${id} · replay of ${from.id} @ ${req.sha.slice(0, 7)}`,
  });

  await (await getAgentByName(env.ChannelAgent, `${riverId}:${id}`)).start({
    riverId,
    intentId: intent.id,
    intentTitle: intent.title,
    intentGoal: intent.goal,
    checks: intent.checks,
    channelId: id,
    repo,
    remote: fork.remote,
    mainRepo: river.mainRepo,
    strategy: req.strategy,
    mode: "live",
    logbookNumber: number,
  });
  return { channel: id, repo };
}
