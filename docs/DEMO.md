# Demo runbook

The 8-minute video from [`PLAN.md` §10](PLAN.md#10-video-outline-8-minutes), scene by scene: what to run, what to click, and which state each shot uses. All commands are PowerShell, run from the repo root.

## Before recording

```powershell
$env:BRAID_URL = "https://braid.<subdomain>.workers.dev"   # or https://braid.drp.icu
$env:BRAID_ADMIN_TOKEN = "<ADMIN_TOKEN>"
pnpm reset:demo     # deletes demo forks, clears Intents, force-pushes the seed commit to main
pnpm seed:demo      # idempotent; deploys the preview base Worker if previews are configured
pnpm smoke          # optional sanity check: fork, push, readFile, raw event in R2
```

- Browser at **1440×900**, light theme first (toggle in the top bar for the dark-theme pass).
- Tabs: `/` (landing), `/app/` (River), the Cloudflare dashboard on **Storage & databases → Artifacts → braid**, and a terminal.
- Scripted pacing: `BRAID_SCRIPTED_SPEED` (Worker var, default `1` = 10–40 s between commits). For a tighter take set it to `0.5` and redeploy.
- Every screen also renders from fixtures with `?states=1&fixtures=1` (a state bar at the bottom). Use that only for pick-up shots; the main takes use live data.

## Scenes

| # | Time | Scene | Do this | State |
|---|------|-------|---------|-------|
| 1 | 0:00 | **The question** | Landing page `/`, scroll from the hero braid to *The shift*. Voice-over: scarce hands → scarce attention. | Landing, light |
| 2 | 0:45 | **One Intent, three Channels** | `/app/` shows *A quiet river*. Click **Open an Intent** → *Add a dark mode*, or run `pnpm demo --only dark-mode`. Three channels fork off the mainline. Switch to the Artifacts dashboard: `river-riverlevels--ch-1…3` exist. Back in the app the feed shows `intent.opened`, `repo.forked` ×3. | River: running |
| 3 | 2:15 | **Reading the line** | `pnpm demo --only rate-limit-api,refactor-gauge`. Within a second of `refactor-gauge` declaring its Lines, the shoal appears on `src/components/Gauge.tsx` and the feed shows `line.conflict · ch-2 ↔ ch-7`. | River: overlap |
| 4 | 3:15 | **Scout** | Rail → **Scout**, Intent *Add a dark mode*. While running: skeleton previews, *Scout is watching*. When the verdict lands: three previews, tests, diff, cost · time, risk gauges, and the judge's two sentences. If Scout calls a tie, the banner turns amber: **Pick ch-2**. | Scout: running → verdict / tie |
| 5 | 4:45 | **Confluence** | The refactor merges first (auto, low risk). The dark-mode pick then conflicts with it on `Gauge.tsx`: Confluence resolves it in `river-riverlevels--cf-dark-mode-1` (never in place), re-tests, and asks to **Confirm merge resolution** in the Eddy. Click **Confirm**. Feed: `confluence.picked · by you`. | Eddy: 1 → River: merged |
| 6 | 5:45 | **Logbook and replay** | Rail → **Logbook**. Open the rate-limit merge commit: trailer tags (`Headwaters-Channel`, `-Intent`, `-Agent`, `-Model`, `-Cost`, `-Risk`, `Logbook`), the diff, and *Decisions* explaining 10 req/s. Under **Replay from here** pick `minimal-diff` → **Fork ch-10**. A new channel forks from that commit on the River map. | Logbook |
| 7 | 6:45 | **External agent joins** | In a terminal, a Claude Code session with the MCP server configured (below) runs: *"Join the riverlevels River, list the Intents, take one with channel_start, declare your Lines, make the change, write your Logbook, push, and submit."* Its channel appears on the River map labeled with the agent and model it reported. | River: running |
| 8 | 7:30 | **Eddy** | Rail → **Eddy**: *9 agents · 44 commits · nothing for you.* (or `1 decision for you` while the approve card is open — click **Approve** on camera). Close on the footer: *Calm hands, fast water.* | Eddy: one → zero |

## The three decisions you might see

| Card | When | Action on camera |
|------|------|------------------|
| **Pick a dark mode** (`pick`) | Scout calls a tie between two green dark-mode Channels | **Pick ch-2** |
| **Approve a high-risk change to /api** (`approve`) | The rate-limit winner's risk is ≥ 0.60 (public API surface + Durable Object binding) | **Approve** |
| **Confirm merge resolution** (`confirm`) | dark-mode and refactor-gauge both changed `Gauge.tsx` | **Confirm** |

## MCP for scene 7

```powershell
$t = (Invoke-RestMethod -Method Post -Uri "$env:BRAID_URL/api/admin/rivers/riverlevels/agent-token" `
  -Headers @{ Authorization = "Bearer $env:BRAID_ADMIN_TOKEN" } -ContentType "application/json" -Body '{"label":"claude-code-live"}').token
claude mcp add --transport http headwaters "$env:BRAID_URL/mcp" --header "Authorization: Bearer $t"
claude
```

Tools: `river_join`, `intent_list`, `intent_open`, `channel_start`, `line_declare`, `line_release`, `logbook_write`, `channel_submit`, `river_ask`.

## Live mode for one Intent

The scripted Channels replay recorded series of real agent work and carry a `replay` tag in their chips. To show live agents on camera for one Intent:

```powershell
pnpm demo --only dark-mode --mode live
```

Requires `CF_ACCOUNT_ID`, `AI_GATEWAY_TOKEN` (and `ANTHROPIC_API_KEY` unless the key is stored in the `braid` AI Gateway). Each Channel has a spend cap and a time cap.

## After recording

```powershell
pnpm reset:demo     # keeps Artifacts usage low (billing starts Oct 14)
```
