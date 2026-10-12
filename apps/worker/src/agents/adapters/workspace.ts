// Shared sandbox plumbing for adapters: one container per Channel, the fork cloned at
// /workspace/repo, and a write grant for the fork that the Outbound gateway enforces.
import { mintToken, remoteParts } from "../../artifacts.ts";
import { q, sandboxFor, type AgentSandbox, type OutboundProps } from "../../sandbox.ts";
import type { AdapterContext, AdapterState } from "./index.ts";

export const REPO_DIR = "/workspace/repo";
const REFRESH_AFTER_MS = 40 * 60 * 1000;

export function channelSandbox(ctx: AdapterContext): DurableObjectStub<AgentSandbox> {
  return sandboxFor(ctx.env, `ch:${ctx.riverId}:${ctx.channelId}`);
}

/** Grant (or refresh) the sandbox's access to the Channel fork. Tokens live ≤ 1h. */
export async function ensureGrant(
  ctx: AdapterContext,
  state: AdapterState,
  extra: Partial<OutboundProps> = {},
): Promise<DurableObjectStub<AgentSandbox>> {
  const sandbox = channelSandbox(ctx);
  const grantedAt = Number(state.grantedAt ?? 0);
  if (Date.now() - grantedAt < REFRESH_AFTER_MS) return sandbox;
  const token = await mintToken(ctx.env.ARTIFACTS, ctx.repo, "write");
  const { host, path } = remoteParts(ctx.remote);
  await sandbox.grant({
    artifactsHost: host,
    repos: { [path]: { token: token.plaintext, write: true } },
    allowNpm: false,
    channel: { riverId: ctx.riverId, intentId: ctx.intentId, channelId: ctx.channelId, apiHost: ctx.env.BRAID_BASE_DOMAIN },
    ...extra,
  });
  state.grantedAt = Date.now();
  return sandbox;
}

/** Clone the fork into /workspace/repo unless it is already there (containers can be recycled). */
export async function ensureClone(ctx: AdapterContext, sandbox: DurableObjectStub<AgentSandbox>): Promise<string> {
  const r = await sandbox.sh(
    [
      `if [ ! -d ${REPO_DIR}/.git ]; then rm -rf ${REPO_DIR}; git clone -q ${q(ctx.remote)} ${REPO_DIR}; fi`,
      `cd ${REPO_DIR}`,
      "git fetch -q origin && git reset -q --hard origin/main",
      "git rev-parse HEAD",
    ].join("\n"),
    { timeoutSec: 180 },
  );
  if (r.exitCode !== 0) throw new Error(`clone failed (${r.exitCode}): ${r.stderr.slice(-600)}`);
  return r.stdout.trim().split("\n").pop()!;
}

export const apiBase = (env: Env) => `https://${env.BRAID_BASE_DOMAIN}`;
