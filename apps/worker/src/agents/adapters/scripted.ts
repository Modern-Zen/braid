// Scripted adapter: the demo safety net. Replays a recorded patch series (real agent output,
// see scripts/scripted-patches) one commit at a time with realistic, jittered delays. It
// declares Lines and writes a Logbook exactly like a live agent, and pushes for real, so
// every push still flows through Artifacts events, review, Scout and Confluence.
import { getAgentByName } from "agents";
import { formatLogbook, logbookPath, parseLogbook, shortSha, withTrailers } from "@braid/protocol";
import { q } from "../../sandbox.ts";
import { jitter, type AdapterContext, type AdapterState, type AgentAdapter, type AgentUpdate, type TickResult } from "./index.ts";
import { patchFiles, patchMessage, recordedSeries, type RecordedSeries } from "./recorded.ts";
import { channelSandbox, ensureClone, ensureGrant, REPO_DIR } from "./workspace.ts";

const DEFAULT_DELAY: [number, number] = [10, 40];

export class ScriptedAdapter implements AgentAdapter {
  readonly kind = "scripted" as const;
  readonly replay = true;
  readonly agent: string;
  readonly model: string;

  constructor(private readonly series: RecordedSeries) {
    this.agent = series.agent;
    this.model = series.model;
  }

  static for(intent: string, strategy: string): ScriptedAdapter | null {
    const s = recordedSeries(intent, strategy);
    return s ? new ScriptedAdapter(s) : null;
  }

  async tick(ctx: AdapterContext, state: AdapterState): Promise<TickResult> {
    const n = this.series.commits.length;
    const updates: AgentUpdate[] = [];
    const progress = (k: number) => 0.2 + (0.6 * k) / Math.max(1, n);

    switch (state.phase) {
      case "start":
      case "clone": {
        updates.push({ kind: "status", status: "cloning", text: "cloning", progress: 0.08 });
        const sandbox = await ensureGrant(ctx, state);
        await ensureClone(ctx, sandbox);
        updates.push({ kind: "status", status: "planning", text: "planning", progress: 0.14 });
        return { updates, state: { ...state, phase: "lines" }, next: jitter(ctx.env, [3, 7]) };
      }

      case "lines": {
        // Read the line before writing: declare what this attempt will touch.
        const river = await getAgentByName(ctx.env.RiverAgent, ctx.riverId);
        const globs = this.series.lines.length > 0 ? this.series.lines : unique(this.series.commits.flatMap((c) => patchFiles(c.patch)));
        const res = await river.declareLines({ channelId: ctx.channelId, intentId: ctx.intentId, globs, note: ctx.strategy });
        if (!res.ok) {
          // A recorded attempt can't re-plan, so it claims its Lines anyway; the overlap stays
          // visible and Confluence resolves it later.
          await river.declareLines({ channelId: ctx.channelId, intentId: ctx.intentId, globs, note: ctx.strategy, force: true });
          const paths = unique(res.overlaps.map((o) => o.path));
          updates.push({ kind: "status", status: "planning", text: `overlap on ${paths[0]}${paths.length > 1 ? ` +${paths.length - 1}` : ""}`, progress: 0.18 });
        }
        return { updates, state: { ...state, phase: "edit", i: 0 }, next: jitter(ctx.env, [2, 5]) };
      }

      case "edit": {
        const commit = this.series.commits[state.i]!;
        const files = patchFiles(commit.patch).length;
        updates.push({ kind: "status", status: "editing", text: `editing ${files} file${files === 1 ? "" : "s"}`, progress: progress(state.i) + 0.05 });
        return { updates, state: { ...state, phase: "commit" }, next: jitter(ctx.env, commit.delaySec ?? DEFAULT_DELAY) };
      }

      case "commit": {
        const i = state.i;
        const commit = this.series.commits[i]!;
        const last = i === n - 1;
        const sandbox = await ensureGrant(ctx, state);
        await ensureClone(ctx, sandbox);

        const { subject, body } = patchMessage(commit.patch);
        const message = withTrailers(body ? `${subject}\n\n${body}` : subject, {
          intent: ctx.intentId,
          channel: ctx.channelId,
          agent: this.agent,
          model: this.model,
          logbook: ctx.logbookNumber,
        });
        await sandbox.writeFile(`/workspace/task/${commit.file}`, commit.patch);
        await sandbox.writeFile("/workspace/task/MESSAGE", message);
        const logbookFile = logbookPath(ctx.logbookNumber, ctx.channelId);
        if (last) await sandbox.writeFile(`${REPO_DIR}/${logbookFile}`, this.logbook(ctx));

        // Idempotent: if a retry finds this commit already made, it only pushes.
        const r = await sandbox.sh(
          [
            `cd ${REPO_DIR}`,
            `if [ "$(git log -1 --format=%s)" != ${q(subject)} ]; then`,
            `  git apply --index --whitespace=nowarn ${q(`/workspace/task/${commit.file}`)}`,
            last ? `  git add ${q(logbookFile)}` : "  true",
            "  git commit -q -F /workspace/task/MESSAGE",
            "fi",
            "git push -q origin HEAD:main",
            "git rev-parse HEAD",
          ].join("\n"),
          { timeoutSec: 120 },
        );
        if (r.exitCode !== 0) throw new Error(`commit ${i + 1}/${n} failed (${r.exitCode}): ${r.stderr.slice(-600)}`);
        const sha = r.stdout.trim().split("\n").pop()!;
        updates.push({ kind: "commit", sha, subject, files: patchFiles(commit.patch).length });
        updates.push({ kind: "status", status: "pushed", text: `pushed ${shortSha(sha).slice(0, 4)}…`, progress: progress(i + 1) });
        if (!last) return { updates, state: { ...state, phase: "edit", i: i + 1 }, next: jitter(ctx.env, [3, 8]) };
        return { updates, state: { ...state, phase: "finish", i: i + 1 }, next: 2 };
      }

      case "finish": {
        if (this.series.costUsd != null || this.series.durationMs != null) {
          updates.push({
            kind: "cost",
            usd: this.series.costUsd ?? 0,
            durationMs: this.series.durationMs ?? undefined,
            turns: this.series.turns ?? undefined,
          });
        }
        updates.push({ kind: "status", status: "done", text: "submitted", progress: 0.8 });
        updates.push({ kind: "done", ok: true });
        await channelSandbox(ctx).destroy();
        return { updates, state: { ...state, phase: "done" }, next: null };
      }

      default:
        return { updates: [{ kind: "done", ok: true }], state, next: null };
    }
  }

  private logbook(ctx: AdapterContext): string {
    const body = parseLogbook(this.series.logbook, ctx.logbookNumber);
    return formatLogbook({
      ...body,
      number: ctx.logbookNumber,
      meta: {
        intent: ctx.intentId,
        channel: ctx.channelId,
        agent: this.agent,
        model: this.model,
        strategy: ctx.strategy,
        costUsd: this.series.costUsd ?? undefined,
        durationMs: this.series.durationMs ?? undefined,
        turns: this.series.turns ?? undefined,
      },
    });
  }
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
