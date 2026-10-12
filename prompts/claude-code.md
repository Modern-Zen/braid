# Claude Code prompt: build Headwaters

*Run from `C:\Work\tools\braid`. Paste everything below the line as the first message of the session. For parallel cloud agents, paste the same prompt and add one line: "You own workstream X from §9."*

---

You are building **Headwaters** (codename `braid`), a Git platform for the agentic era on Cloudflare Workers and Artifacts. It's Modern Zen Strategies' entry to Cloudflare's "build the next Git platform" competition. **Submissions close Wed Oct 14, 2026, so we have about 48 hours.** Optimize for a working, demoable end-to-end loop over completeness. Read `docs/PLAN.md` first; it is the source of truth for concept, vocabulary, and scope. This prompt is the engineering brief.

## 1. Why this exists (keep it in mind for every design choice)

GitHub coordinates scarce human hands. Agents make hands abundant; the scarce resource is human attention. Headwaters lets many agents work one codebase concurrently, each in its **own forked Artifacts repo**. Agents **declare the files they'll touch** before writing. Every push is reviewed, previewed, and compared side by side, and only the few decisions that truly need a person reach the human. The brand line is *calm hands, fast water*. Product nouns use the river vocabulary; UI copy is plain and declarative.

| Term | Meaning |
|---|---|
| River | A project: mainline Artifacts repo + its coordinator |
| Intent | A unit of work: title, goal, acceptance checks |
| Channel | One agent's attempt at an Intent, in its own forked repo |
| Line | A live claim on file globs a Channel intends to touch |
| Scout | Side-by-side comparison of an Intent's Channels + judge verdict |
| Confluence | Merge queue; rebases/resolves in a fresh fork, re-tests, merges to main |
| Logbook | Per-commit *why*, stored in the repo at `.braid/logbook/<channelId>.md` |
| Eddy | Human inbox of decision cards (choose / approve / resolve) |

## 2. Fixed decisions

- **Cloudflare account:** Modern Zen (`sedale@drp.icu`). Don't hardcode account IDs; read from `wrangler whoami` / env.
- **Domain:** `braid.drp.icu` (custom domain on the Worker). Use `*.workers.dev` until the route is set.
- **Source:** GitHub `Modern-Zen/braid`, **MIT** license (already in repo).
- **Live agent runtime:** Claude Code headless (`claude -p … --output-format stream-json`) inside Cloudflare **Sandbox** containers, with Anthropic traffic routed through **AI Gateway** (`braid` gateway).
- **Artifacts namespace:** `braid`.
- **Shell:** the developer is on Windows. **Every command you write in docs, README, scripts' usage text, or instructions to me must be PowerShell**, never bash. Inside Sandbox containers (Linux), shell scripts are fine.

## 3. Stack

- TypeScript everywhere, pnpm workspaces, Wrangler ≥ 4.145.0 (required for the Artifacts binding)
- **Workers** (API + static assets for the UI), **Agents SDK** (`agents` package: `Agent`, `McpAgent`, WebSocket state sync)
- **Durable Objects with SQLite**: `RiverAgent` (one per River: Lines, presence, Eddy, live feed) and `ChannelAgent` (one per Channel: agent run state)
- **Artifacts** binding, **Queues** (Artifacts event subscription delivery), **Workflows** (`ReviewWorkflow`, `ConfluenceWorkflow`)
- **Sandbox SDK** (`@cloudflare/sandbox`) for agents, `git` working-tree ops, and tests
- **D1** (cross-River index), **R2** (transcripts, screenshots, raw events), **Browser Rendering** (preview screenshots), **AI Gateway** + **Workers AI** (judge/risk model), **Vectorize** (stretch: Logbook search)
- UI: React + Vite, built into the Worker's static assets. Port the Claude Design tokens and screens from `design/` when they land (CSS variables prefixed `--hw-`). Until then, keep the UI minimal and token-driven so the design swap is cheap.

## 4. Artifacts API: use only what exists

The Artifacts binding is new and small. **Do not invent methods.** Verified surface (from the docs, Oct 2026). Confirm field names with `npx wrangler types` and adapt if they differ:

```jsonc
// wrangler.jsonc
"artifacts": [{ "binding": "ARTIFACTS", "namespace": "braid" }]
```

**Namespace (`env.ARTIFACTS`):** `create(name, {readOnly?, description?, setDefaultBranch?})` → `{name, remote, defaultBranch, token}` · `get(name)` → disposable `ArtifactsRepo` (throws if missing/not ready) · `list({limit?, cursor?})` → `{repos:[{name,status}], cursor}` where status is `ready|importing|forking` · `import({source:{url, branch?, depth?}, target:{name, opts?}})` · `delete(name)`

**Repo handle (`using repo = await env.ARTIFACTS.get(name)`):** `info()` · `createToken(scope?: "read"|"write", ttlSeconds?)` → `{plaintext, expiresAt}` · `listTokens()` · `revokeToken(tokenOrId)` · `fork(name, {description?, readOnly?, defaultBranchOnly?})` → `{name, remote, defaultBranch, token}` · `log({ref?, limit?, offset?})` (first-parent, newest first) · `readCommit(sha)` · `readTree(sha)` (immediate children) · `readBlob(sha)` · `readFile({ref, path})` → `Blob | null`

**There is no diff, merge, branch, or write-file API in the binding.** All working-tree operations (`clone`, `commit`, `rebase`, `merge`, `diff --stat`, running tests) happen in a Sandbox with plain `git` against the repo's authenticated remote:

```ts
const secret = token.split("?expires=")[0];
const authRemote = `https://x:${secret}@${remote.slice("https://".length)}`;
```

Tokens must be short-lived (≤ 1h) and scoped. Never log them, and never put them in the Logbook or UI.

**Events** (subscribe via Queues event subscriptions; check the current mechanics at developers.cloudflare.com/queues/event-subscriptions/):
- Account-level source `artifacts`: `cf.artifacts.repo.created|deleted|forked|imported`
- Repo-level source `artifacts.repo`: `cf.artifacts.repo.pushed` (`ref, before, after, commits[{id,message,author,committer,parents,timestamp}], totalCommitsCount, commitsTruncated`), `…cloned`, `…fetched`, `…token.created`, `…token.revoked`
- Every event has `metadata {accountId, eventSubscriptionId, eventSchemaVersion, eventTimestamp}`. The blog example reads `event.type`, `event.source.namespace`, `event.source.repoName`, `event.payload.ref`, and `event.payload.after`.

**Day-1 rule:** the queue consumer writes every raw event to R2 (`events/YYYY-MM-DD/<ts>.json`) before doing anything else, and the code is adapted to the shapes that actually arrive.

**Limits:** 2,000 control-plane req / 10s per namespace; 2,000 git req / 10s per repo; 1 GB per repo; 32 MB per blob; names `[A-Za-z0-9][A-Za-z0-9._-]*`.

**Docs index for anything unclear:** https://developers.cloudflare.com/artifacts/llms.txt. Fetch and read it rather than guessing. Do the same for the Sandbox SDK and Agents SDK: check the current docs and installed type definitions before writing against an API.

## 5. Repo layout

```
apps/worker/            Worker entry, RiverAgent, ChannelAgent, MCP server, workflows, queue consumer
  src/index.ts
  src/agents/river.ts
  src/agents/channel.ts
  src/mcp.ts
  src/workflows/review.ts
  src/workflows/confluence.ts
  src/events.ts
  src/artifacts.ts      thin typed wrapper + naming helpers + authRemote()
  src/sandbox.ts        sandbox helpers: clone, run agent, run tests, rebase, diffstat
  migrations/           D1 schema
  wrangler.jsonc
apps/ui/                React + Vite → built into apps/worker static assets
apps/demo-riverlevels/  the demo app (a small Worker); seeded as the demo River's main
packages/protocol/      trailers, Line glob overlap, MCP tool schemas (zod), shared types
scripts/                seed-demo.ts, reset-demo.ts, scripted-patches/
sandbox/                Dockerfile for the agent container (git, node, pnpm, claude CLI)
docs/                   PLAN.md, ARCHITECTURE.md
```

**Artifacts naming:** mainline `river-<slug>`; Channel `river-<slug>--ch-<intentId>-<n>`; Confluence fork `river-<slug>--cf-<intentId>-<attempt>`.

**Commit trailers** (agents must add them; Confluence preserves them):
```
Braid-Intent: <intentId>
Braid-Channel: <channelId>
Braid-Agent: <runtime>/<model> · strategy=<strategy>
Braid-Logbook: .braid/logbook/<channelId>.md
```

**Logbook file format** (Markdown with front matter): `intent`, `channel`, `agent`, `model`, `costUsd`, `transcript` (R2 key), then sections `## Plan`, `## Decisions`, `## Rejected approaches`, `## Notes for reviewers`.

## 6. Data model

D1: `rivers`, `intents`, `channels`, `verdicts`, `eddy_cards`, `events_index`. RiverAgent SQLite: live `lines` (channelId, glob, note, declaredAt), `presence`, `feed` (last 500 events). Fields per `docs/PLAN.md` §5. Intent status: `open → running → scouting → confluence → merged | eddy`.

## 7. Agent modes

`BRAID_AGENT_MODE=scripted|live` (env var, switchable per Intent from the UI).

- **scripted:** each Channel clones its fork in a Sandbox, then applies a pre-recorded patch series from `scripts/scripted-patches/<intent>/<strategy>/` one commit at a time, with realistic jittered delays (10–40s). It declares Lines and writes Logbooks exactly like a live agent. This is the demo safety net and must be rock solid.
- **live:** the Sandbox runs Claude Code headless in the cloned fork with a system prompt built from: the Intent, the repo's `AGENTS.md`, the strategy, the current Lines snapshot, and the protocol rules. Before editing, the agent must call `line.declare` (expose the MCP server to it, or a tiny CLI `braid-line` in the container that calls the Worker). Its stream-json output goes to R2; summarized Plan/Decisions go into the Logbook; it commits with trailers and pushes. Route through AI Gateway and cap each Channel's spend with a hard stop.

Strategies to vary across Channels: `minimal-diff`, `idiomatic-refactor`, `test-first`. Model can vary too.

## 8. Milestones and acceptance (build in this order)

**M0: Scaffold and smoke (≤ 1h).** pnpm workspace, wrangler config with all bindings, D1 migrations, `GET /health`. A script `scripts/smoke.ts` creates `braid-smoke`, forks it, issues a token, clones in a Sandbox, pushes a commit, and reads it back with `readFile`.
✅ The smoke script passes against the real account. Event subscription is configured, and a raw `repo.pushed` lands in R2.

**M1: Rivers, Intents, fan-out.** `POST /rivers` (create or `import` from a URL), `POST /rivers/:id/intents` → creates N Channel forks + write tokens and starts N `ChannelAgent`s concurrently in scripted mode.
✅ Seeding the demo River and opening 3 Intents yields 9 forks and 9 concurrent Sandboxes pushing commits. The feed shows `forked` and `pushed` events.

**M2: Lines.** `line.declare/release` in RiverAgent; glob-overlap detection in `packages/protocol`; overlap broadcasts to the UI via WebSocket and is returned to the declaring agent (`{ok:false, overlaps:[…]}`), so it can yield or narrow. Scripted mode includes one deliberate overlap (refactor vs dark mode on `Gauge.tsx`).
✅ The overlap appears live in the UI within 1s of declaration.

**M3: Review on push.** Queue consumer → `ReviewWorkflow` per `repo.pushed` on a Channel repo: clone at `after` in a Sandbox → install → tests → `git diff --stat` vs main → Workers AI risk score (0–1 with reasons) → store → update Channel and feed. Idempotent on `(repo, after)`.
✅ Every push gets a review row with tests, diffstat, and risk.

**M4: Scout and judge.** When all Channels of an Intent finish (or timeout), a judge (Claude via AI Gateway, falling back to Workers AI) ranks them using acceptance checks, test results, diffstat, risk, cost, and Logbooks. It produces a verdict with a short rationale. If confidence is low or the top two are close, it creates an Eddy `choose` card.
✅ The Scout API returns ranked Channels with all comparison fields. The UI shows 3 columns + verdict.

**M5: Confluence.** `ConfluenceWorkflow`: fork the winner into a `--cf-` repo → in a Sandbox, fetch main, rebase onto it → if conflicts, run the merge agent (live) or the scripted resolution → re-test → if green and risk ≤ the River policy threshold, push to main (fast-forward via the mainline write token); else create an Eddy `approve` or `resolve` card. Serialize per River through RiverAgent (one Confluence at a time).
✅ All 3 demo Intents land on main, one through a real conflict resolution. The calm counter reads e.g. `9 agents · N commits · 1 decision`.

**M6: Eddy and Logbook UI.** Eddy decision cards with actions that resume the waiting Workflow (use Workflow events/`waitForEvent` if available, otherwise poll a D1 flag). Commit view: diff (computed in a Sandbox and cached to R2) + rendered Logbook + trailers.
✅ A human click in Eddy completes a stuck Intent end to end.

**M7 (SHOULD): Previews and screenshots.** Preferred: Workers Builds + Previews connected to Channel repos. If you can't attach Builds per fork programmatically, deploy each Channel from the ReviewWorkflow Sandbox with `wrangler deploy --dispatch-namespace braid-previews` (Workers for Platforms) and route `ch-*.braid.drp.icu` through a dispatch Worker. Then screenshot with Browser Rendering → R2 → Scout.
✅ Each Channel in Scout shows a live link and a screenshot.

**M8 (SHOULD): MCP server.** `McpAgent` at `/mcp` with tools `river.join`, `intent.list`, `intent.open`, `channel.start` (returns remote + scoped token + `AGENTS.md` + rules), `line.declare`, `line.release`, `logbook.write`, `channel.submit`, `river.ask`. Auth with a per-River bearer token.
✅ A local Claude Code session can join the demo River via MCP, take an Intent, push, and show up in Scout.

**M9 (SHOULD): Replay.** "Replay from commit": create a new Channel by forking the Channel repo and resetting to that SHA in the Sandbox, with a different model/strategy.

**Stretch:** Vectorize "ask the river" over Logbooks · Dynamic Workers instant smoke test before full review · ArtifactFS mount in Sandbox for faster cold start · import this repo into Artifacts so Headwaters hosts itself · serve the landing page at `/`.

## 9. Parallel workstreams (for cloud agents)

After M0 is merged, split the work:
- **A: Core backend:** M1, M2, M5 (RiverAgent, ChannelAgent, Confluence)
- **B: Review pipeline:** M3, M4, M7 (Queue consumer, ReviewWorkflow, judge, previews)
- **C: UI:** shell, River map, Scout, Eddy, Logbook view, against a mocked API from `packages/protocol` types. Port the Claude Design output.
- **D: Demo content:** `apps/demo-riverlevels`, scripted patch series for the 3 Intents × 3 strategies (including the deliberate overlap and the conflict), seed/reset scripts

The shared contract is `packages/protocol`. Change it only with a note in the PR.

## 10. Engineering rules

- Small typed modules; no framework beyond React in the UI. Use `using` for Artifacts repo handles.
- Handle Artifacts errors specifically (`NOT_FOUND`, `INVALID_INPUT`, etc.); no blanket catches that hide auth or missing-repo failures.
- Authorize every route. The human UI goes behind Cloudflare Access; agents use scoped bearer tokens. Never return a write token to the browser.
- Secrets via `wrangler secret put` (PowerShell examples in README); `.dev.vars` is gitignored.
- Idempotency keys on everything event-driven.
- Commit early and often with clear messages; open PRs per milestone on `Modern-Zen/braid`.
- Keep Artifacts usage modest (billing starts Oct 15): `reset-demo` deletes demo forks.

## 11. Deliverables

1. Deployed at `braid.drp.icu` (or workers.dev) with the demo River seeded
2. `README.md`: what it is (3 sentences), the five ideas, architecture diagram, **PowerShell** setup from zero (account prerequisites: Workers Paid, Artifacts, Containers/Sandbox, Workers for Platforms namespace, AI Gateway, Access), `pnpm seed:demo`, `pnpm demo` (fires the 3 Intents), and the scripted vs live mode explanation
3. `docs/ARCHITECTURE.md` with the event flow and the Artifacts naming scheme
4. MIT license, no secrets, public repo
5. A `DEMO.md` runbook matching the video outline in `docs/PLAN.md` §10, with exact clicks and commands

Start with M0. Before writing code, list the docs you checked and any API differences from this brief. Then go.
