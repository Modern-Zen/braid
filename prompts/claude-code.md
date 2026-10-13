# Claude Code prompt: build Headwaters

*v2 · Oct 12, 2026 · updated after the Claude Design export landed in the repo.*

*Run from `C:\Work\tools\braid`. Paste everything below the line as the first message of the session. For parallel cloud agents, paste the same prompt and add one line: "You own workstream X from §10."*

---

You are building **Headwaters** (codename `braid`), a Git platform for the agentic era on Cloudflare Workers and Artifacts. It's Modern Zen Strategies' entry to Cloudflare's "build the next Git platform" competition. **Submissions close Wed Oct 14, 2026, so we have about 48 hours.** Optimize for a working, demoable end-to-end loop over completeness.

Read these first, in order:
1. `docs/PLAN.md`: concept, vocabulary, scope, video outline (source of truth for *what* and *why*)
2. `Headwaters Specs.dc.html`: design spec (tokens, 14 components, braid geometry and timing)
3. `Headwaters App.dc.html` and `Headwaters Landing.dc.html`: the screens you are building
4. This prompt: the engineering brief (source of truth for *how*)

## 0. What's already in the repo

```
C:\Work\tools\braid\
  .git/                         two commits so far (plan, prompts)
  .gitignore  LICENSE (MIT)  README.md
  docs/PLAN.md                  the plan
  prompts/                      claude-design.md, claude-code.md (this file)
  design/README.md              index pointing at the export below
  # ── Claude Design export (repo root, currently untracked) ──
  Headwaters Landing.dc.html    landing page: hero braid, shift, five ideas, counter, flow, agents, Cloudflare strip, OSS
  Headwaters App.dc.html        app screens A–D (River, Scout, Eddy, Logbook) with every state, 1440×900
  Headwaters Specs.dc.html      tokens, component specs, braid geometry + timing, React/SVG channel snippet
  headwaters-tokens.css         ALL design tokens (--hw-*), light/dark via [data-hw-theme], keyframes
  fonts/                        Inter-VariableFont.ttf, Lora-VariableFont.ttf, Lora-Italic-VariableFont.ttf
  assets/                       mz-icon-light.svg, mz-icon-dark.svg (Modern Zen mark)
  support.js                    Claude Design "dc-runtime" (GENERATED; renders .dc.html; needs window.React)
  .thumbnail                    Claude Design project thumbnail (WebP)
```

**Rules for the design export:**
- **Leave it where it is.** The root-level design files are the Claude Design sync target and may be re-exported over. Don't move, rename, reformat, or edit them. Treat them as read-only reference.
- **Commit them** in your first commit (`chore: add Claude Design export`) so the design is versioned with the code. Keep `.thumbnail` and `support.js` too. Fonts are SIL OFL; keep any license files if present.
- **Port, don't embed.** The `.dc.html` files are prototypes rendered by `support.js` (an `<x-dc>` template with `{{ }}` bindings plus a `DCLogic` class). Don't ship `support.js` or the `.dc.html` files in the product. Rebuild the screens as real React components in `apps/ui`:
  - `headwaters-tokens.css` and `fonts/` are the exception. **Copy** them into `apps/ui/src/styles/` and `apps/ui/public/fonts/` with a script (`scripts/sync-design.ts`, run by `pnpm design:sync`) so a re-export flows through with one command. Fix the font `url()` paths in the copy, not the original.
  - The App prototype's script block has the exact data shapes, copy, SVG geometry (`riverMap()`), and state logic for every screen. Lift the geometry and copy faithfully; replace the hardcoded constants (`INTENTS`, `SCOUT`, `CARDS`, `FEED_*`, `DIFF`) with live data from the API.
  - The Specs file defines the component inventory: agent chip, channel line, commit dot, event row, stat counter, decision card, verdict banner, risk gauge, preview card, code panel, trailer tag, left rail, top bar, empty states. Build one React component per item with the exact sizes and states listed there.
- To view the prototypes locally: `npx serve .` from the repo root, then open the `.dc.html` files.

## 1. Why this exists (keep it in mind for every design choice)

GitHub coordinates scarce human hands. Agents make hands abundant; the scarce resource is human attention. Headwaters lets many agents work one codebase concurrently, each in its **own forked Artifacts repo**. Agents **declare the files they'll touch** before writing. Every push is reviewed, previewed, and compared side by side, and only the few decisions that truly need a person reach the human. The brand line is *calm hands, fast water*. Product nouns use the river vocabulary; UI copy is plain and declarative (use the copy in the design files verbatim).

| Term | Meaning |
|---|---|
| River | A project: mainline Artifacts repo + its coordinator |
| Intent | A unit of work: title, goal, acceptance checks. Slug id, e.g. `rate-limit-api` |
| Channel | One agent's attempt at an Intent, in its own forked repo. River-wide ids `ch-1…ch-n` |
| Line | A live claim on file globs a Channel intends to touch |
| Scout | Side-by-side comparison of an Intent's Channels + judge verdict |
| Confluence | Merge queue; rebases/resolves in a fresh fork, re-tests, merges to main |
| Logbook | Per-change *why*, stored in the repo, numbered per River (`0012`) |
| Eddy | Human inbox of decision cards (pick / approve / confirm-resolution) |

**Amber is sacred.** `--hw-color-human` appears only when a person must decide: Eddy cards, a tie verdict, risk ≥ 0.60, the "decision for you" counter item. Never use it for warnings or emphasis.

## 2. Fixed decisions

- **Cloudflare account:** Modern Zen (`sedale@drp.icu`). Don't hardcode account IDs; read from `wrangler whoami` / env.
- **Domain:** `braid.drp.icu`. Routes: `/` landing page, `/app/*` the app, `/api/*` REST, `/mcp` MCP server, `/ws/river/:id` live socket. Channel previews at `ch-<n>.braid.drp.icu`. Use `*.workers.dev` until the custom domain is attached.
- **Source:** GitHub `Modern-Zen/braid`, **MIT** license (already in repo).
- **Live agent runtime:** Claude Code headless (`claude -p … --output-format stream-json`) inside Cloudflare **Sandbox** containers, with Anthropic traffic routed through **AI Gateway** (`braid` gateway).
- **Artifacts namespace:** `braid`.
- **Shell:** the developer is on Windows; testers are on macOS too. **Every command you write in docs, README, scripts' usage text, or in-app snippets must work on both.** A block that runs unchanged in zsh, bash and PowerShell is written once; where the shells differ (environment variables, writing files, HTTP calls) give a **macOS / Linux** block and a **Windows (PowerShell)** block. Instructions to the developer are PowerShell. Inside Sandbox containers (Linux), shell scripts are fine.

## 3. Stack

- TypeScript everywhere, pnpm workspaces, Wrangler ≥ 4.145.0 (required for the Artifacts binding)
- **Workers** (API + static assets for landing and app), **Agents SDK** (`agents` package: `Agent`, `McpAgent`, WebSocket state sync)
- **Durable Objects with SQLite**: `RiverAgent` (one per River: Lines, presence, Eddy, live feed, counters) and `ChannelAgent` (one per Channel: agent run state)
- **Artifacts** binding, **Queues** (Artifacts event subscription delivery), **Workflows** (`ReviewWorkflow`, `ConfluenceWorkflow`)
- **Sandbox SDK** (`@cloudflare/sandbox`) for agents, `git` working-tree ops, and tests
- **D1** (cross-River index), **R2** (transcripts, screenshots, raw events, cached diffs), **Browser Rendering** (preview screenshots), **AI Gateway** + **Workers AI** (judge/risk model), **Vectorize** (stretch: "Ask the river")
- **UI:** React + Vite, two entries (`landing`, `app`), built into the Worker's static assets. Styling is plain CSS on the `--hw-*` tokens: no Tailwind and no component library, so the design ports 1:1. Theme via `data-hw-theme` on `<html>`, honoring `prefers-color-scheme` with a toggle. Respect `prefers-reduced-motion` (the tokens already zero the river durations). Braid animation is SVG + CSS keyframes + SMIL `animateMotion`, exactly as specified in the Specs file.

## 4. Artifacts API: use only what exists

The Artifacts binding is new and small. **Do not invent methods.** Verified surface (from the docs, Oct 2026). Confirm field names with `npx wrangler types` and adapt if they differ:

```jsonc
// wrangler.jsonc
"artifacts": [{ "binding": "ARTIFACTS", "namespace": "braid" }]
```

**Namespace (`env.ARTIFACTS`):** `create(name, {readOnly?, description?, setDefaultBranch?})` → `{name, remote, defaultBranch, token}` · `get(name)` → disposable `ArtifactsRepo` (throws if missing/not ready) · `list({limit?, cursor?})` → `{repos:[{name,status}], cursor}` where status is `ready|importing|forking` · `import({source:{url, branch?, depth?}, target:{name, opts?}})` · `delete(name)`

**Repo handle (`using repo = await env.ARTIFACTS.get(name)`):** `info()` · `createToken(scope?: "read"|"write", ttlSeconds?)` → `{plaintext, expiresAt}` · `listTokens()` · `revokeToken(tokenOrId)` · `fork(name, {description?, readOnly?, defaultBranchOnly?})` → `{name, remote, defaultBranch, token}` · `log({ref?, limit?, offset?})` (first-parent, newest first) · `readCommit(sha)` · `readTree(sha)` (immediate children) · `readBlob(sha)` · `readFile({ref, path})` → `Blob | null`

**There is no diff, merge, branch, or write-file API in the binding.** All working-tree operations (`clone`, `commit`, `rebase`, `merge`, `diff`, running tests) happen in a Sandbox with plain `git` against the repo's authenticated remote:

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

## 5. Repo layout (add around the existing files; don't disturb the design export)

```
package.json  pnpm-workspace.yaml  tsconfig.base.json
apps/worker/            Worker entry, RiverAgent, ChannelAgent, MCP server, workflows, queue consumer
  src/index.ts          router: / · /app · /api · /mcp · /ws
  src/agents/river.ts
  src/agents/channel.ts
  src/agents/adapters/  claude-code.ts (live), scripted.ts, index.ts (AgentAdapter interface)
  src/mcp.ts
  src/workflows/review.ts
  src/workflows/confluence.ts
  src/events.ts         Artifacts events → internal feed events
  src/artifacts.ts      typed wrapper + naming helpers + authRemote()
  src/sandbox.ts        clone, run agent, run tests, rebase, diff, diffstat
  migrations/           D1 schema
  wrangler.jsonc
apps/ui/                React + Vite: src/landing/, src/app/, src/components/ (one per Specs component), src/styles/ (synced tokens)
apps/demo-riverlevels/  the demo app (Hono + a small React gauge UI), seeded as the demo River's main
packages/protocol/      trailers, Line glob overlap, feed event types, MCP tool schemas (zod), shared types
scripts/                sync-design.ts, smoke.ts, seed-demo.ts, reset-demo.ts, scripted-patches/
sandbox/                Dockerfile for the agent container (git, node, pnpm, claude CLI)
docs/                   PLAN.md, ARCHITECTURE.md, DEMO.md
```

### Naming and protocol (matches the design)

- **Artifacts repos:** mainline `river-<slug>`; Channel `river-<slug>--ch-<n>` (e.g. `river-riverlevels--ch-6`); Confluence fork `river-<slug>--cf-<intentSlug>-<attempt>`.
- **Commit trailers.** Agents add these to every commit:
  ```
  Headwaters-Intent: rate-limit-api
  Headwaters-Channel: ch-5
  Headwaters-Agent: claude-code
  Headwaters-Model: <model id actually used>
  Logbook: 0012
  ```
  Confluence adds `Headwaters-Cost: $0.27` and `Headwaters-Risk: 0.72` to the commit it lands on main, since risk is only known after review. The Logbook screen renders all seven as trailer tags, as in the design.
- **Logbook files** live at `.headwaters/logbook/<NNNN>-ch-<n>.md`, numbered per River. Front matter: `intent`, `channel`, `agent`, `model`, `costUsd`, `transcript` (R2 key). Sections: `## Plan`, `## Decisions`, `## Rejected approaches`, `## Notes for reviewers`. The design's "From Decisions · Logbook entry 0012" quote is pulled from `## Decisions`.
- **Agent strategies** (as in the design): `minimal-diff`, `tests-first`, `rewrite`, `conservative`, `bold`.
- **Feed event vocabulary** (exact names and color families from the design's event row): `river.created`, `token.issued`, `intent.opened`, `repo.forked`, `line.declared`, `line.conflict`, `repo.pushed`, `review.passed`, `review.failed`, `preview.ready`, `confluence.picked` (`· auto` or `· by you`), `river.merged`. Map raw Artifacts events onto these in `src/events.ts`.
- **Risk thresholds** (from the risk gauge spec): `< 0.40` teal, `0.40–0.59` grey, `≥ 0.60` amber. River policy default: auto-merge only when risk `< 0.60`, tests green, and the judge is confident. Everything else becomes an Eddy card.

### Honest agent labels (important for the video)

The design shows a multi-vendor mix (`codex`, `gemini`, `aider`, `devin`, `claude-code`). That mix is illustrative. **The UI must only ever show the agent and model that actually produced the work.**
- Build an `AgentAdapter` interface (`start(channel) → stream of {status, commit, cost}`), and ship the `claude-code` adapter for live mode.
- External agents of any vendor join through MCP (M8) and self-report their agent name. That is how a non-Claude agent can legitimately show up in the River.
- Scripted channels are labeled with the agent recorded in the patch series' `meta.json` (whoever really produced those patches when you recorded them) plus a small `replay` tag in the agent chip. Never fabricate an agent name.

## 6. Data model

D1: `rivers`, `intents`, `channels`, `reviews`, `verdicts`, `eddy_cards`, `logbook_index`, `events_index`. RiverAgent SQLite: live `lines` (channelId, glob, note, declaredAt), `presence`, `feed` (last 500 events), `counters` (agents, commits, previews, decisions: the calm counter). Fields per `docs/PLAN.md` §5. Intent status: `open → running → scouting → confluence → merged | eddy`. Eddy card kinds: `pick` (choose between Channels), `approve` (high-risk change), `confirm` (merge resolution), matching the three cards in the design.

## 7. Agent modes

`BRAID_AGENT_MODE=scripted|live` (env default, switchable per Intent from the UI).

- **scripted:** each Channel clones its fork in a Sandbox, then applies a pre-recorded patch series from `scripts/scripted-patches/<intent>/<strategy>/` one commit at a time, with realistic jittered delays (10–40s). It declares Lines and writes Logbooks exactly like a live agent. This is the demo safety net and must be rock solid. Record the patch series by running the live adapter against the demo River, so the patches and their `meta.json` are real agent output.
- **live:** the Sandbox runs Claude Code headless in the cloned fork with a system prompt built from: the Intent, the repo's `AGENTS.md`, the strategy, the current Lines snapshot, and the protocol rules. Before editing, the agent must call `line.declare` (expose the MCP server to it, or a tiny `braid-line` CLI in the container that calls the Worker). Its stream-json output goes to R2; summarized Plan/Decisions go into the Logbook; it commits with trailers and pushes. Route through AI Gateway and cap each Channel's spend with a hard stop.

## 8. The demo River: `riverlevels`

Match the design's previews: a one-page river gauge dashboard (e.g. "Snake River · Moose, WY", Stage / Flow / Temp tiles), with mock data. It's a Hono API (`/api/levels`) + a small React UI with a `Gauge` component, `src/theme/`, and `src/hooks/useGauge.ts`. Seed main at a known state and ship a test suite (~14 tests) so the Scout numbers are real.

The three demo Intents (3 Channels each, 9 agents):
1. `dark-mode`: *Add a dark mode* (touches `src/theme/*`, `src/components/Gauge.tsx`)
2. `rate-limit-api`: *Add rate limiting to /api* (Durable Object–backed token bucket, 10 req/s per token, 429 on overflow, `cache(60)` on `/levels`). The winning Channel scores risk ≥ 0.60 so it lands as an `approve` card
3. `refactor-gauge`: *Refactor the gauge component* (extracts `useGauge`; deliberately overlaps Intent 1 on `Gauge.tsx`, which produces the `line.conflict` and the `confirm` card in Confluence)

## 9. Milestones and acceptance (build in this order)

**M0: Scaffold, design sync, smoke (≤ 1.5h).** Commit the design export. pnpm workspace; wrangler config with all bindings; D1 migrations; `GET /health`; `pnpm design:sync` copies tokens and fonts into `apps/ui`. `/` serves a stub page already wearing the tokens and fonts. `scripts/smoke.ts` creates `braid-smoke`, forks it, issues a token, clones in a Sandbox, pushes a commit, and reads it back with `readFile`.
✅ Smoke passes against the real account. Event subscription is configured, and a raw `repo.pushed` lands in R2.

**M1: Rivers, Intents, fan-out.** `POST /api/rivers` (create, or `import` from a URL), `POST /api/rivers/:id/intents` → creates N Channel forks + write tokens and starts N `ChannelAgent`s concurrently in scripted mode.
✅ `pnpm seed:demo` + `pnpm demo` yields 9 forks and 9 concurrent Sandboxes pushing commits; the feed shows `intent.opened`, `repo.forked`, `repo.pushed`.

**M2: Lines.** `line.declare/release` in RiverAgent; glob-overlap detection in `packages/protocol`; overlap is broadcast as `line.conflict` and returned to the declaring agent (`{ok:false, overlaps:[…]}`) so it can yield or narrow.
✅ The `dark-mode` vs `refactor-gauge` overlap on `Gauge.tsx` appears live within 1s.

**M3: Review on push.** Queue consumer → `ReviewWorkflow` per `repo.pushed` on a Channel repo: clone at `after` in a Sandbox → install → tests → `git diff --stat` vs main → Workers AI risk score (0–1 with reasons) → store → `review.passed|failed`. Idempotent on `(repo, after)`.
✅ Every push gets a review with tests, diffstat, and risk.

**M4: Scout and judge.** When all Channels of an Intent finish (or time out), a judge (Claude via AI Gateway, falling back to Workers AI) ranks them using acceptance checks, test results, diffstat, risk, cost, and Logbooks, and writes a two-sentence rationale. If the top two are close, the verdict is `tie` and an Eddy `pick` card is created.
✅ The Scout API returns ranked Channels with every field the Scout screen shows (tests, diff, cost · time, risk, note, preview).

**M5: Confluence.** `ConfluenceWorkflow`: fork the winner into a `--cf-` repo → in a Sandbox, fetch main and rebase onto it → if conflicts, run the merge agent (live) or the scripted resolution, then create an Eddy `confirm` card → re-test → if green and policy allows, push to main with the Cost/Risk trailers (`confluence.picked · auto`); otherwise create an `approve` card. Serialize per River through RiverAgent (one Confluence at a time). On the last merge, emit `river.merged`.
✅ All 3 demo Intents land on main; the counter ends at e.g. `9 agents · 44 commits · 3 previews · nothing for you`.

**M6: UI port (runs in parallel from M1 onward).** Landing page and screens A–D in React, matching the design pixel for pixel in light and dark, wired to the API and the River WebSocket. Every state from the prototype's state bar must be reachable with real data: River (empty / running / overlap / merged), Scout (running / verdict / tie), Eddy (3 / 1 / zero), and Logbook. Eddy actions resume the waiting Workflow (Workflow events / `waitForEvent` if available, otherwise poll a D1 flag). Commit view: diff computed in a Sandbox and cached to R2, plus the rendered Logbook and trailer tags. Remove the prototype's state bar in production; keep it behind `?states=1` for recording.
✅ Side by side with the `.dc.html` prototypes at 1440×900, the screens match in layout, type, color, and motion.

**M7 (SHOULD): Previews and screenshots.** Preferred: Workers Builds + Previews connected to Channel repos. If you can't attach Builds per fork programmatically, deploy each Channel from the ReviewWorkflow Sandbox with `wrangler deploy --dispatch-namespace braid-previews` (Workers for Platforms), route `ch-<n>.braid.drp.icu` through a dispatch Worker, and emit `preview.ready`. Screenshot with Browser Rendering → R2 → the Scout preview card.
✅ Each Channel in Scout shows a live link and a real screenshot.

**M8 (SHOULD): MCP server.** `McpAgent` at `/mcp` with tools `river.join`, `intent.list`, `intent.open`, `channel.start` (returns remote + scoped token + `AGENTS.md` + rules), `line.declare`, `line.release`, `logbook.write`, `channel.submit`, `river.ask`. Auth with a per-River bearer token (`token.issued` in the feed). The agent self-reports its name and model.
✅ A local Claude Code session can join the demo River via MCP, take an Intent, push, and show up in Scout.

**M9 (SHOULD): Replay.** "Replay from commit…": create a new Channel by forking the Channel repo and resetting to that SHA in the Sandbox, with a different model/strategy.

**Stretch:** Vectorize "Ask the river" over Logbooks (the Logbook screen's search box) · Dynamic Workers instant smoke test before full review · ArtifactFS mount in Sandbox for faster cold start · import this repo into Artifacts so Headwaters hosts itself.

## 10. Parallel workstreams (for cloud agents)

After M0 is merged, split the work:
- **A: Core backend:** M1, M2, M5 (RiverAgent, ChannelAgent, adapters, Confluence)
- **B: Review pipeline:** M3, M4, M7 (Queue consumer, ReviewWorkflow, judge, previews)
- **C: UI:** M6. Start immediately against mocked API data typed from `packages/protocol`, using the prototype constants as fixtures, then swap to live data
- **D: Demo content:** `apps/demo-riverlevels`, its tests, recorded patch series for 3 Intents × 3 strategies (including the overlap and the conflict), seed/reset scripts, `docs/DEMO.md`

The shared contract is `packages/protocol`. Change it only with a note in the PR.

## 11. Engineering rules

- Small typed modules; React is the only UI framework. Use `using` for Artifacts repo handles.
- Handle Artifacts errors specifically (`NOT_FOUND`, `INVALID_INPUT`, etc.); no blanket catches that hide auth or missing-repo failures.
- Authorize every route. `/app` and `/api` (human) go behind Cloudflare Access; agents use scoped bearer tokens; `/` is public. Never return a write token to the browser.
- Secrets via `wrangler secret put` (examples in README for both shells); `.dev.vars` is gitignored.
- Idempotency keys on everything event-driven.
- Commit early and often; open PRs per milestone on `Modern-Zen/braid`.
- **Git on this Windows folder:** if git reports `File exists` on a `.lock` file under `.git`, a previous process left it behind. Rename it (`Move-Item .git\index.lock .git\stale-index-lock`) rather than deleting, and tell me.
- Keep Artifacts usage modest (billing starts Oct 15): `pnpm reset:demo` deletes demo forks.

## 12. Deliverables

1. Deployed at `braid.drp.icu` (or workers.dev): landing page at `/`, app at `/app`, demo River seeded
2. `README.md`: what it is (3 sentences), the five ideas, a screenshot of Scout, architecture diagram, setup from zero for macOS/Linux and Windows (PowerShell) (account prerequisites: Workers Paid, Artifacts, Containers/Sandbox, Workers for Platforms namespace, AI Gateway, Access), `pnpm design:sync`, `pnpm seed:demo`, `pnpm demo`, and the scripted vs live mode explanation
3. `docs/ARCHITECTURE.md`: event flow, Artifacts naming scheme, trailers, Logbook format
4. `docs/DEMO.md`: the runbook for the video in `docs/PLAN.md` §10, with exact clicks, commands, and which state each scene uses
5. MIT license, no secrets, public repo

Start with M0. Before writing code, list the docs you checked, anything in the design files that conflicts with this brief, and any API differences you found. Then go.
