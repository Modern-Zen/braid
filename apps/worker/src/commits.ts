// Commit / Logbook view: the commit, its trailers, the diff (computed in a sandbox and cached
// in R2), and the Logbook that explains it.
import { parseLogbook, parseRepoName, parseTrailers, trailerPairs, type CommitView, type DiffFile } from "@braid/protocol";
import { mintToken, readText, remoteParts, repoInfo } from "./artifacts.ts";
import { getChannel, getIntent } from "./db.ts";
import { parseUnifiedDiff } from "./review.ts";
import { q, sandboxFor } from "./sandbox.ts";

export async function commitView(env: Env, riverId: string, repo: string, sha: string): Promise<CommitView | null> {
  const parsed = parseRepoName(repo);
  if (parsed.kind === "other" || parsed.river !== riverId) return null;

  let commit: ArtifactsCommitMetadata | null;
  try {
    using r = await env.ARTIFACTS.get(repo);
    commit = await r.readCommit(sha);
  } catch {
    return null;
  }
  if (!commit) return null;

  const trailers = parseTrailers(commit.message);
  const channelId = trailers.channel ?? (parsed.kind === "channel" ? parsed.channel : null);
  const intentId = trailers.intent ?? null;
  const channel = channelId ? await getChannel(env.DB, riverId, channelId) : null;
  const intent = intentId ? await getIntent(env.DB, riverId, intentId) : null;

  const files = await diffFor(env, repo, commit.hash);
  let logbook: CommitView["logbook"] = null;
  if (trailers.logbook && channelId) {
    const path = `.headwaters/logbook/${trailers.logbook}-${channelId}.md`;
    const text = await readText(env.ARTIFACTS, repo, commit.hash, path).catch(() => null);
    if (text) {
      const e = parseLogbook(text, trailers.logbook);
      logbook = {
        number: e.number,
        path,
        plan: e.plan,
        decisions: e.decisions,
        rejected: e.rejected,
        notes: e.notes,
        model: e.meta.model || trailers.model || "",
        strategy: e.meta.strategy,
        turns: e.meta.turns,
        costUsd: e.meta.costUsd,
        durationMs: e.meta.durationMs,
        transcriptUrl: e.meta.transcript ? `/api/rivers/${riverId}/transcripts/${channelId}` : undefined,
      };
    }
  }

  return {
    sha: commit.hash,
    repo,
    subject: commit.message.split("\n")[0] ?? "",
    channelId,
    intentId,
    intentTitle: intent?.title ?? null,
    agent: trailers.agent ?? channel?.agent ?? null,
    strategy: channel?.strategy ?? null,
    committedAt: commit.committedAt * (commit.committedAt < 1e12 ? 1000 : 1),
    trailers: trailerPairs(trailers),
    files,
    logbook,
  };
}

/** The commit's diff against its first parent. Cached in R2 under diffs/<repo>/<sha>.json. */
async function diffFor(env: Env, repo: string, sha: string): Promise<DiffFile[]> {
  const key = `diffs/${repo}/${sha}.single.json`;
  const cached = await env.BLOBS.get(key);
  if (cached) return ((await cached.json()) as { files: DiffFile[] }).files;

  const info = await repoInfo(env.ARTIFACTS, repo);
  if (!info) return [];
  const token = await mintToken(env.ARTIFACTS, repo, "read", 600);
  const { host, path } = remoteParts(info.remote);
  const sandbox = sandboxFor(env, `diff:${repo}`);
  await sandbox.grant({ artifactsHost: host, repos: { [path]: { token: token.plaintext, write: false } }, allowNpm: false }, "lite");
  const dir = `/workspace/${sha.slice(0, 12)}`;
  const r = await sandbox.sh(
    [`rm -rf ${dir} && git clone -q --filter=blob:none ${q(info.remote)} ${dir} && cd ${dir}`, `git show --no-color --format= -m --first-parent ${q(sha)}`].join("\n"),
    { timeoutSec: 120 },
  );
  await sandbox.sh(`rm -rf ${dir}`).catch(() => undefined);
  if (r.exitCode !== 0) return [];
  const files = parseUnifiedDiff(r.stdout);
  await env.BLOBS.put(key, JSON.stringify({ files }), { httpMetadata: { contentType: "application/json" } });
  return files;
}
