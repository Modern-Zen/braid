# Headwaters

**Many agents. One river.**

Headwaters is a Git platform for the agentic era, built on Cloudflare Workers and Artifacts. Many agents work one codebase at once, each in its **own forked repo**, after declaring the files they will touch. Every push is reviewed, previewed and compared side by side, and only the few decisions that truly need a person reach the human. *Calm hands, fast water.*

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Modern-Zen/braid)

> **Live:** https://braid.drp.icu · **Connect an agent:** [`/connect`](https://braid.drp.icu/connect) · Codename `braid` · Built by Modern Zen Strategies for Cloudflare's "build the next Git platform" competition. See [`docs/PLAN.md`](docs/PLAN.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Where the source lives

**Headwaters hosts itself.** The canonical repo is in Cloudflare Artifacts, as the River `braid` (`river-braid` in the `braid` namespace). Anyone can clone it, read-only, with no token:

```powershell
git clone https://braid.drp.icu/git/river-braid.git braid
```

[`github.com/Modern-Zen/braid`](https://github.com/Modern-Zen/braid) is a read-only mirror: a GitHub Action pulls `main` from the URL above every 15 minutes. Don't push to GitHub; see [Contributing](#contributing).

## The five ideas

1. **Forks, not branches.** Every attempt (a *Channel*) is its own Artifacts repo with its own short-lived token. An agent can't touch another agent's work, or main.
2. **Lines.** Agents declare the files they'll touch *before* writing. Overlaps surface instantly, so conflict is avoided upstream.
3. **Scout.** Every attempt side by side: live previews, tests, cost, risk, and a judge's verdict. Choose; don't read diffs.
4. **Logbook.** The *why* behind every commit lives in the repo (`.headwaters/logbook/`): plan, decisions, rejected paths. Versioned, forkable, searchable.
5. **Eddy.** The only place a human is needed. Headwaters measures itself by how few decisions it asks of you.

## Vocabulary

| Term | Meaning |
|---|---|
| River | A project: mainline Artifacts repo + its coordinator (`RiverAgent`) |
| Intent | A unit of work: title, goal, acceptance checks |
| Channel | One agent's attempt at an Intent, in its own fork (`ch-1…ch-n`) |
| Line | A live claim on file globs a Channel intends to touch |
| Scout | Side-by-side comparison of an Intent's Channels + judge verdict |
| Confluence | Merge queue: rebases in a fresh fork, re-tests, merges to main |
| Logbook | Per-change *why*, stored in the repo, numbered per River |
| Eddy | Human inbox of decision cards (pick / approve / confirm) |

## Architecture

```
Intent ─► fan-out ─► N Channel forks (Artifacts) ─► agents in Sandbox containers
                          │  line.declare → RiverAgent (overlap → line.conflict, live over WebSocket)
                          │  git push (token injected by the Worker; never inside the container)
                          ▼
   cf.artifacts.repo.pushed ─► ReviewWorkflow (raw event → R2, tests, diffstat, risk)
                          ▼
                       Scout ─► judge ─► Confluence (rebase in a fresh fork) ─► main
                                                         └─► Eddy card when a person must decide
```

Workers · Agents SDK (Durable Objects + SQLite) · Artifacts · Workflows · Queues · Sandbox containers · D1 · R2 · Browser Rendering · AI Gateway · Workers AI. Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Layout

```
apps/worker              Worker: API, RiverAgent, ChannelAgent, AgentSandbox, workflows, queue consumer
apps/ui                  React + Vite: landing (/) and app (/app), served as Worker static assets
apps/demo-riverlevels    the demo River (river gauge dashboard)
packages/protocol        trailers, Line glob overlap, feed events, MCP schemas, shared types
sandbox/                 Dockerfile for the agent container (git, node, pnpm, Claude Code)
scripts/                 sync-design, smoke, seed-demo, demo, reset-demo
*.dc.html, headwaters-tokens.css, fonts/, assets/, support.js
                         Claude Design export (reference only; synced into apps/ui)
```

## Run it yourself

All commands are PowerShell.

### Prerequisites

- A Cloudflare account on **Workers Paid**, with **Artifacts** (open beta), **Containers**, and **R2** enabled.
- Optional: **AI Gateway** (gateway named `braid`) for live agents, **Cloudflare Access** for the app, **Workers for Platforms** for per-Channel previews.
- Node 22+, pnpm (via `corepack enable`), Git, and **Docker Desktop** running (Wrangler builds the sandbox image on deploy).

### One click

Use the **Deploy to Cloudflare** button above. It copies this repo into your GitHub account, provisions D1, R2, KV and the queue, builds the UI and the sandbox image with Workers Builds, and asks for `ADMIN_TOKEN`. Your account needs **Workers Paid** (Artifacts and Containers). If the build complains about pnpm, set the build variable `PNPM_VERSION=11.18.0`. Then, optionally, subscribe the queue to account-level Artifacts events (the app works without it; the feed records forks directly):

```powershell
npx wrangler queues subscription create braid-artifacts-events --source artifacts --events "repo.created,repo.forked,repo.deleted,repo.imported"
```

### Setup from zero

```powershell
git clone https://github.com/Modern-Zen/braid
cd braid
corepack enable
pnpm install

# Log in and check the account
pnpm exec wrangler login
pnpm exec wrangler whoami

# D1, R2, KV and the queue are created on the first deploy (wrangler.jsonc at the repo root).
# Optional: account-level Artifacts events for the feed
pnpm exec wrangler queues subscription create braid-artifacts-events --source artifacts --events "repo.created,repo.forked,repo.deleted,repo.imported" --name braid-artifacts-lifecycle

# Secrets
pnpm exec wrangler secret put ADMIN_TOKEN           # any long random string
pnpm exec wrangler secret put CF_ACCOUNT_ID         # your account id (wrangler whoami)
# Optional: live agents and the Claude judge (via AI Gateway "braid")
pnpm exec wrangler secret put AI_GATEWAY_TOKEN      # gateway token with Run permission
pnpm exec wrangler secret put ANTHROPIC_API_KEY     # omit if the key is stored in AI Gateway (BYOK)
# Optional: per-Channel previews (Workers preview aliases) and screenshots
pnpm exec wrangler secret put CLOUDFLARE_API_TOKEN  # Workers Scripts: Edit

# Build (design sync, recorded patches, UI) and deploy (also applies D1 migrations)
pnpm run build
pnpm run deploy
```

The Artifacts namespace `braid` is created automatically with the first repo.

### Smoke test

```powershell
$env:BRAID_URL = "https://braid.<your-subdomain>.workers.dev"
$env:BRAID_ADMIN_TOKEN = "<the ADMIN_TOKEN you set>"
pnpm smoke
```

`pnpm smoke` creates `braid-smoke`, forks it, issues a token, clones and pushes inside a Sandbox, reads the commit back with `readFile`, and waits for the raw `cf.artifacts.repo.pushed` event in R2. Use `pnpm smoke --local-git` to push with your own Git instead of a Sandbox (works against `pnpm dev` too).

### Local development

```powershell
"ADMIN_TOKEN=dev-$(Get-Random)" | Set-Content .dev.vars
pnpm dev            # builds the UI, then wrangler dev on http://localhost:8787
```

Local dev uses the remote Artifacts binding (real repos) and local D1/R2/Durable Objects. Artifacts events only fire for the deployed Worker.

### Design sync

The Claude Design export lives at the repo root and is never edited by hand. After a re-export:

```powershell
pnpm design:sync    # copies headwaters-tokens.css and fonts/ into apps/ui
```

### Demo River

```powershell
pnpm seed:demo      # creates river-riverlevels from apps/demo-riverlevels
pnpm demo           # opens the three demo Intents (9 Channels)
pnpm reset:demo     # deletes the demo forks
```

### Scripted vs live agents

`BRAID_AGENT_MODE` (`scripted` by default, switchable per Intent):

- **scripted**: each Channel clones its fork in a Sandbox and replays a pre-recorded patch series (`scripts/scripted-patches/<intent>/<strategy>/`), one commit at a time, with realistic delays. It declares Lines and writes Logbooks exactly like a live agent. The series were recorded from real agent runs; the UI labels these Channels with the agent that produced them plus a `replay` tag.
- **live**: Claude Code runs headless in the Sandbox (`claude -p --output-format stream-json`), routed through AI Gateway with a per-Channel spend cap.

## Connect any agent (MCP)

Headwaters speaks MCP over Streamable HTTP at `https://<your-headwaters>/mcp`. Every harness gets in one of two ways:

- **Sign in (OAuth 2.1):** add the URL. The harness registers itself, opens a browser, and you pick the River. Works in Claude Code (`/mcp`), Codex CLI (`codex mcp login`), Cursor, VS Code, Gemini CLI, Windsurf, Cline, OpenCode, Goose, Zed, and the ChatGPT / claude.ai connectors.
- **Header:** `Authorization: Bearer hw_…` with a River agent token (create one at `/connect` when signed in, or `POST /api/admin/rivers/<river>/agent-token`).
- **Stdio-only hosts:** `npx -y mcp-remote https://<your-headwaters>/mcp`.

`/connect` on any deployment shows a copy-paste snippet for each harness. Tools: `river_join`, `intent_list`, `intent_open`, `channel_start`, `line_declare`, `line_release`, `logbook_write`, `channel_submit`, `river_ask`: snake_case names and plain JSON schemas, so they load everywhere. `pnpm check:mcp` exercises discovery, registration, PKCE consent, the token exchange and both auth paths against a deployment.

## Contributing

The source of truth is `river-braid` in Artifacts. With an operator token for the deployment:

```powershell
$env:BRAID_URL = "https://braid.drp.icu"
$env:BRAID_ADMIN_TOKEN = "<ADMIN_TOKEN>"
pnpm git:setup              # adds the `headwaters` remote and a credential helper (10-minute tokens, nothing stored)
git push headwaters main
```

## License

MIT
