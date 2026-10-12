// Confluence plumbing: what ConfluenceWorkflow does inside a sandbox.
// Merges never happen in place: the winner is forked into river-<slug>--cf-<intent>-<n>,
// integrated with main there, re-tested, and only then landed on main.
import { mintToken, remoteParts } from "./artifacts.ts";
import { recordedResolution } from "./agents/adapters/recorded.ts";
import { listChannels, listIntents } from "./db.ts";
import { q, sandboxFor } from "./sandbox.ts";

export interface IntegrateInput {
  riverId: string;
  intentId: string;
  attempt: number;
  strategy: string;
  mode: "scripted" | "live";
  cf: { name: string; remote: string };
  main: { name: string; remote: string };
}

export interface IntegrateResult {
  state: "clean" | "resolved" | "conflict";
  conflicted: string[];
  head: string;
  /** Who resolved it and how, for the Eddy `confirm` card. */
  resolvedBy?: string;
  notes?: string;
  /** The other Channel involved, e.g. "ch-2". */
  against?: string;
}

export function cfSandbox(env: Env, i: { riverId: string; intentId: string; attempt: number }) {
  return sandboxFor(env, `cf:${i.riverId}:${i.intentId}:${i.attempt}`);
}

const DIR = "/workspace/cf";

async function grant(env: Env, input: Pick<IntegrateInput, "cf" | "main"> & { riverId: string; intentId: string; attempt: number }, mainWrite: boolean) {
  const sandbox = cfSandbox(env, input);
  const [cfTok, mainTok] = await Promise.all([
    mintToken(env.ARTIFACTS, input.cf.name, "write", 1800),
    mintToken(env.ARTIFACTS, input.main.name, mainWrite ? "write" : "read", 1800),
  ]);
  const a = remoteParts(input.cf.remote);
  const m = remoteParts(input.main.remote);
  await sandbox.grant(
    {
      artifactsHost: a.host,
      repos: { [a.path]: { token: cfTok.plaintext, write: true }, [m.path]: { token: mainTok.plaintext, write: mainWrite } },
      allowNpm: true,
    },
    "standard-2",
  );
  return sandbox;
}

/**
 * Rebase the Confluence fork onto main. If that conflicts, merge main instead and resolve:
 * a recorded resolution (scripted), else leave it for a person.
 */
export async function integrate(env: Env, input: IntegrateInput): Promise<IntegrateResult> {
  const sandbox = await grant(env, input, false);
  const r = await sandbox.sh(
    [
      `rm -rf ${DIR} && git clone -q ${q(input.cf.remote)} ${DIR} && cd ${DIR}`,
      `git fetch -q ${q(input.main.remote)} main:refs/remotes/main/main`,
      "if git rebase -q refs/remotes/main/main >/dev/null 2>&1; then",
      "  git push -q --force origin HEAD:main && echo CLEAN",
      "else",
      "  git rebase --abort",
      "  if git merge -q --no-edit refs/remotes/main/main >/dev/null 2>&1; then",
      "    git push -q origin HEAD:main && echo CLEAN",
      "  else",
      "    echo CONFLICT; git diff --name-only --diff-filter=U",
      "  fi",
      "fi",
    ].join("\n"),
    { timeoutSec: 180 },
  );
  if (r.exitCode !== 0) throw new Error(`integrate failed (${r.exitCode}): ${r.stderr.slice(-600)}`);
  const out = r.stdout.trim().split("\n");
  if (out[0] === "CLEAN") {
    return { state: "clean", conflicted: [], head: await revParse(env, input) };
  }
  const conflicted = out.slice(1).filter(Boolean);

  // Which already-merged series is this colliding with? Try their recorded resolutions.
  if (input.mode === "scripted") {
    const merged = await mergedSeries(env, input.riverId, input.intentId);
    for (const other of merged) {
      const res = recordedResolution(`${input.intentId}.${input.strategy}`, `${other.intentId}.${other.strategy}`);
      if (!res) continue;
      for (const [path, content] of Object.entries(res.files)) await sandbox.writeFile(`${DIR}/${path}`, content);
      const commit = await sandbox.sh(
        [
          `cd ${DIR}`,
          `git add -A -- ${conflicted.map(q).join(" ")} ${Object.keys(res.files).map(q).join(" ")}`,
          "if git diff --name-only --diff-filter=U | grep -q .; then echo UNRESOLVED; exit 3; fi",
          `git commit -q -m ${q(`Merge main into the Confluence fork; resolve ${conflicted.join(", ")}`)}`,
          "git push -q origin HEAD:main",
          "git rev-parse HEAD",
        ].join("\n"),
      );
      if (commit.exitCode !== 0) continue;
      return {
        state: "resolved",
        conflicted,
        head: commit.stdout.trim().split("\n").pop()!,
        resolvedBy: `${res.agent}${res.model ? ` (${res.model})` : ""}, recorded`,
        notes: res.notes,
        against: other.channelId,
      };
    }
  }
  const against = (await mergedSeries(env, input.riverId, input.intentId))[0]?.channelId;
  await sandbox.sh(`cd ${DIR} && git merge --abort || true`);
  return { state: "conflict", conflicted, head: "", against };
}

/** A person chose which side wins the conflicting hunks. */
export async function resolveBySide(env: Env, input: IntegrateInput, keep: "channel" | "main"): Promise<string> {
  const sandbox = await grant(env, input, false);
  const r = await sandbox.sh(
    [
      `rm -rf ${DIR} && git clone -q ${q(input.cf.remote)} ${DIR} && cd ${DIR}`,
      `git fetch -q ${q(input.main.remote)} main:refs/remotes/main/main`,
      // Merging main into the fork: "ours" is the Channel, "theirs" is main.
      `git merge -q --no-edit -X ${keep === "channel" ? "ours" : "theirs"} refs/remotes/main/main`,
      "git push -q origin HEAD:main",
      "git rev-parse HEAD",
    ].join("\n"),
    { timeoutSec: 180 },
  );
  if (r.exitCode !== 0) throw new Error(`resolve failed (${r.exitCode}): ${r.stderr.slice(-600)}`);
  return r.stdout.trim().split("\n").pop()!;
}

/** Land the Confluence fork on main as a --no-ff merge commit carrying the trailers. */
export async function land(env: Env, input: IntegrateInput, message: string): Promise<string> {
  const sandbox = await grant(env, input, true);
  await sandbox.writeFile("/workspace/LAND_MESSAGE", message);
  const r = await sandbox.sh(
    [
      `rm -rf ${DIR}-land && git clone -q ${q(input.main.remote)} ${DIR}-land && cd ${DIR}-land`,
      `git fetch -q ${q(input.cf.remote)} main:refs/remotes/cf/main`,
      "git merge -q --no-ff -F /workspace/LAND_MESSAGE refs/remotes/cf/main",
      "git push -q origin HEAD:main",
      "git rev-parse HEAD",
    ].join("\n"),
    { timeoutSec: 180 },
  );
  if (r.exitCode !== 0) throw new Error(`land failed (${r.exitCode}): ${r.stderr.slice(-600)}`);
  return r.stdout.trim().split("\n").pop()!;
}

async function revParse(env: Env, input: IntegrateInput): Promise<string> {
  const r = await cfSandbox(env, input).sh(`cd ${DIR} && git rev-parse HEAD`);
  return r.stdout.trim();
}

async function mergedSeries(env: Env, riverId: string, exceptIntent: string): Promise<Array<{ intentId: string; strategy: string; channelId: string }>> {
  const intents = (await listIntents(env.DB, riverId)).filter((i) => i.status === "merged" && i.id !== exceptIntent);
  const out: Array<{ intentId: string; strategy: string; channelId: string }> = [];
  for (const i of intents) {
    const ch = (await listChannels(env.DB, riverId, i.id)).find((c) => c.status === "merged");
    if (ch) out.push({ intentId: i.id, strategy: ch.strategy, channelId: ch.id });
  }
  return out;
}
