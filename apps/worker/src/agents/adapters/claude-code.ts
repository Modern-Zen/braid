// Live adapter: Claude Code headless in the Channel's sandbox.
//
//   claude --print --output-format stream-json … < PROMPT.md   (background, output to files)
//
// Model traffic goes to AI Gateway (the Worker's Outbound adds the gateway token; the
// container only has a placeholder key). The agent declares Lines with `braid-line`,
// commits with Headwaters trailers, writes its Logbook, and pushes to its own fork.
// Each tick polls the process, picks up new pushes and cost, and enforces the spend and
// time caps with a hard stop.
import { getAgentByName } from "agents";
import { DEFAULT_POLICY, logbookPath } from "@braid/protocol";
import { q } from "../../sandbox.ts";
import type { AdapterContext, AdapterState, AgentAdapter, AgentUpdate, TickResult } from "./index.ts";
import { apiBase, channelSandbox, ensureClone, ensureGrant, REPO_DIR } from "./workspace.ts";

const TASK = "/workspace/task";
const POLL_SEC = 12;
const MAX_RUN_MS = 20 * 60 * 1000;

// Runs the command in its own process group; records pid and exit code (runner pattern).
const RUN_SCRIPT = `dir=$1; shift
setsid sh -c 'echo "$$ $(cat /proc/sys/kernel/random/boot_id)" >"$0/pid"; exec "$@" <"$0/PROMPT.md"' \\
  "$dir" "$@" >"$dir/stdout.log" 2>"$dir/stderr.log"
echo "$?" >"$dir/exit-code.tmp" && mv "$dir/exit-code.tmp" "$dir/exit-code"`;
const ALIVE_SCRIPT = `read -r pid boot <"$1" && [ "$boot" = "$(cat /proc/sys/kernel/random/boot_id)" ] && kill -0 "$pid"`;

interface StreamTotals {
  costUsd: number;
  turns: number;
  files: Set<string>;
  result: { is_error: boolean; result?: string; total_cost_usd?: number; num_turns?: number; duration_ms?: number } | null;
  lastTool: string | null;
}

export class LiveAdapter implements AgentAdapter {
  readonly kind = "live" as const;
  readonly agent = "claude-code";
  readonly replay = false;
  readonly model: string;

  constructor(private readonly env: Env) {
    this.model = env.LIVE_MODEL;
  }

  private gateway(): { accountId: string; gatewayId: string } {
    const accountId = (this.env as Env & { CF_ACCOUNT_ID?: string }).CF_ACCOUNT_ID;
    if (!accountId) throw new Error("CF_ACCOUNT_ID is not set (needed for the AI Gateway URL)");
    return { accountId, gatewayId: this.env.AI_GATEWAY_ID };
  }

  async tick(ctx: AdapterContext, state: AdapterState): Promise<TickResult> {
    const updates: AgentUpdate[] = [];
    const sandbox = await ensureGrant(ctx, state, { aiGateway: this.gateway() });

    if (state.phase === "start" || state.phase === "clone") {
      updates.push({ kind: "status", status: "cloning", text: "cloning", progress: 0.08 });
      const base = await ensureClone(ctx, sandbox);
      const prompt = await this.prompt(ctx, sandbox);
      await sandbox.sh(`rm -rf ${TASK} && mkdir -p ${TASK}`);
      await sandbox.writeFile(`${TASK}/PROMPT.md`, prompt);
      await this.launch(ctx, sandbox);
      await sandbox.keepAliveFor(MAX_RUN_MS + 5 * 60 * 1000);
      updates.push({ kind: "status", status: "planning", text: "planning", progress: 0.14 });
      return { updates, state: { ...state, phase: "run", base, seen: base, launchedAt: Date.now() }, next: POLL_SEC };
    }

    if (state.phase === "run") {
      // New pushes on the fork since the last tick.
      const seen = String(state.seen);
      const log = await sandbox.sh(
        `cd ${REPO_DIR} && git fetch -q origin && git log --reverse --format='%H %s' ${q(seen)}..origin/main`,
        { timeoutSec: 60 },
      );
      let latest = seen;
      for (const line of log.stdout.split("\n").filter(Boolean)) {
        const [sha, ...rest] = line.split(" ");
        const files = await sandbox.sh(`cd ${REPO_DIR} && git show --name-only --format= ${q(sha!)} | wc -l`);
        updates.push({ kind: "commit", sha: sha!, subject: rest.join(" "), files: Number(files.stdout.trim()) || 0 });
        latest = sha!;
      }

      const totals = await this.readStream(sandbox);
      const exit = await sandbox.readFile(`${TASK}/exit-code`);
      const alive = exit === null && (await sandbox.exec(["sh", "-c", ALIVE_SCRIPT, "probe", `${TASK}/pid`])).exitCode === 0;
      const budget = DEFAULT_POLICY.channelBudgetUsd;
      const overBudget = totals.costUsd >= budget;
      const overTime = Date.now() - Number(state.launchedAt) > MAX_RUN_MS;

      if (alive && (overBudget || overTime)) {
        // Hard stop: kill the whole process group.
        await sandbox.sh(`read -r pid boot <${TASK}/pid && kill -TERM -"$pid" || true`);
        updates.push({ kind: "status", status: "failed", text: overBudget ? `stopped at $${budget.toFixed(2)} cap` : "stopped: time cap" });
      }

      const commits = Number(state.commits ?? 0) + updates.filter((u) => u.kind === "commit").length;
      const progress = Math.min(0.78, 0.2 + 0.12 * commits + (Date.now() - Number(state.launchedAt)) / MAX_RUN_MS / 3);
      if (alive && !overBudget && !overTime) {
        const text = latest !== seen ? `pushed ${latest.slice(0, 4)}…` : totals.files.size > 0 ? `editing ${totals.files.size} files` : totals.lastTool ?? "planning";
        updates.push({ kind: "status", status: latest !== seen ? "pushed" : totals.files.size > 0 ? "editing" : "planning", text, progress });
        if (totals.costUsd > 0) updates.push({ kind: "cost", usd: totals.costUsd, turns: totals.turns });
        return { updates, state: { ...state, seen: latest, commits }, next: POLL_SEC };
      }

      // Finished (or stopped): record the outcome and the transcript.
      const cost = totals.result?.total_cost_usd ?? totals.costUsd;
      updates.push({ kind: "cost", usd: cost, durationMs: totals.result?.duration_ms, turns: totals.result?.num_turns ?? totals.turns });
      await this.saveTranscript(ctx, sandbox);
      const ok = commits > 0 && !totals.result?.is_error && !overBudget;
      updates.push({ kind: "status", status: ok ? "done" : "failed", text: ok ? "submitted" : totals.result?.is_error ? "agent error" : commits === 0 ? "no commits" : "stopped", progress: 0.8 });
      updates.push({ kind: "done", ok, error: ok ? undefined : (totals.result?.result ?? (await sandbox.readFile(`${TASK}/stderr.log`)) ?? "").slice(-500) });
      await channelSandbox(ctx).destroy();
      return { updates, state: { ...state, phase: "done", seen: latest, commits }, next: null };
    }

    return { updates: [{ kind: "done", ok: true }], state, next: null };
  }

  private async launch(ctx: AdapterContext, sandbox: ReturnType<typeof channelSandbox>): Promise<void> {
    const { accountId, gatewayId } = this.gateway();
    const cmd = [
      "claude",
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
      "--no-session-persistence",
      "--model",
      this.model,
    ];
    // Fire and forget: output goes to files, so the process outlives this request.
    await sandbox.exec(["/bin/sh", "-c", RUN_SCRIPT, "agent", TASK, ...cmd], {
      cwd: REPO_DIR,
      timeoutSec: Math.ceil(MAX_RUN_MS / 1000) + 300,
      env: {
        ANTHROPIC_BASE_URL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/anthropic`,
        ANTHROPIC_API_KEY: "provided-by-worker",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        IS_SANDBOX: "1",
        BRAID_API: apiBase(ctx.env),
      },
    }).catch(() => undefined);
  }

  private async prompt(ctx: AdapterContext, sandbox: ReturnType<typeof channelSandbox>): Promise<string> {
    const agentsMd = (await sandbox.readFile(`${REPO_DIR}/AGENTS.md`)) ?? "(no AGENTS.md)";
    const river = await getAgentByName(ctx.env.RiverAgent, ctx.riverId);
    const lines = (await river.snapshot()).lines.filter((l) => l.channelId !== ctx.channelId);
    const logbook = logbookPath(ctx.logbookNumber, ctx.channelId);
    return `You are ${ctx.channelId}, one of several agents working the Intent "${ctx.intentTitle}" in parallel on the River "${ctx.riverId}" (Headwaters). You work alone in your own fork, already cloned in the current directory; push to it with \`git push origin HEAD:main\`.

## Intent
${ctx.intentGoal}

Acceptance checks:
${ctx.checks.length ? ctx.checks.map((c) => `- ${c}`).join("\n") : "- The test suite passes."}

## Strategy: ${ctx.strategy}
${STRATEGY_NOTES[ctx.strategy]}

## Lines other Channels hold right now
${lines.length ? lines.map((l) => `- ${l.channelId}: ${l.glob}`).join("\n") : "- none"}

## Protocol (required)
1. Before editing, declare the files you will touch: \`braid-line declare <glob>... --note "why"\`. Exit code 3 means another Channel holds an overlapping Line (the JSON lists it): narrow your globs or work around it. Re-declare before touching anything new.
2. Commit in small steps. Every commit message ends with these trailers:
   Headwaters-Intent: ${ctx.intentId}
   Headwaters-Channel: ${ctx.channelId}
   Headwaters-Agent: claude-code
   Headwaters-Model: ${this.model}
   Logbook: ${ctx.logbookNumber}
3. Write your Logbook to \`${logbook}\` and include it in your last commit. Sections: \`## Plan\`, \`## Decisions\`, \`## Rejected approaches\`, \`## Notes for reviewers\`. Explain *why*, specifically.
4. Run the tests before your last push. Push after each commit.
5. You cannot reach the Internet except your fork and the model. Dependencies are already declared in the repo; don't add new ones.

## AGENTS.md
${agentsMd}
`;
  }

  private async readStream(sandbox: ReturnType<typeof channelSandbox>): Promise<StreamTotals> {
    const totals: StreamTotals = { costUsd: 0, turns: 0, files: new Set(), result: null, lastTool: null };
    const text = (await sandbox.readFile(`${TASK}/stdout.log`)) ?? "";
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (ev.type === "assistant") {
        totals.turns += 1;
        const content = ((ev.message as { content?: unknown[] } | undefined)?.content ?? []) as Array<Record<string, unknown>>;
        for (const c of content) {
          if (c.type !== "tool_use") continue;
          const input = (c.input ?? {}) as Record<string, unknown>;
          if (["Edit", "Write", "MultiEdit"].includes(String(c.name)) && typeof input.file_path === "string") totals.files.add(input.file_path);
          totals.lastTool = String(c.name) === "Bash" ? "running commands" : String(c.name) === "Read" ? "reading" : totals.lastTool;
        }
      } else if (ev.type === "result") {
        totals.result = ev as unknown as StreamTotals["result"];
        if (typeof ev.total_cost_usd === "number") totals.costUsd = ev.total_cost_usd;
      }
    }
    return totals;
  }

  private async saveTranscript(ctx: AdapterContext, sandbox: ReturnType<typeof channelSandbox>): Promise<void> {
    const text = await sandbox.readFile(`${TASK}/stdout.log`);
    if (!text) return;
    await ctx.env.BLOBS.put(`transcripts/${ctx.riverId}/${ctx.channelId}.jsonl`, text, {
      httpMetadata: { contentType: "application/x-ndjson" },
    });
  }
}

const STRATEGY_NOTES: Record<string, string> = {
  "minimal-diff": "Change as little as possible. Prefer extending existing structure over new files.",
  "tests-first": "Write or extend the tests that capture the acceptance checks first, then make them pass.",
  rewrite: "Restructure freely if it makes the result cleaner. Keep behavior and tests green.",
  conservative: "Favor safety and reversibility. No surprises in the public surface.",
  bold: "Take the most direct route to the goal, even if it is a larger change.",
};
