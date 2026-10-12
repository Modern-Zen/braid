# Headwaters architecture

## Components

| Piece | Where | Role |
|---|---|---|
| Worker (`apps/worker/src/index.ts`) | Workers | Router: `/` landing, `/app/*` app, `/api/*` REST, `/mcp`, `/ws/river/:id`, `/health` |
| `RiverAgent` | Durable Object (Agents SDK, SQLite) | One per River: live Lines, presence, feed (last 500), calm counter, Eddy. Broadcasts state to the UI over WebSocket |
| `ChannelAgent` | Durable Object (Agents SDK, SQLite) | One per Channel: run state of the agent working it |
| `AgentSandbox` | Durable Object + container (Sandbox SDK 1.0) | One Linux container per Channel / review / Confluence run: `git`, tests, Claude Code |
| `Outbound` | `WorkerEntrypoint` | The only way out of a container. Allows granted Artifacts remotes (adds the token), npm, and AI Gateway (adds the gateway token) |
| `ReviewWorkflow` | Workflows | Started by every `cf.artifacts.repo.pushed` in the namespace. Raw event → R2, then tests, diffstat, risk |
| `ConfluenceWorkflow` | Workflows | Merge queue, serialized per River; waits for Eddy decisions with `step.waitForEvent` |
| Queue `braid-artifacts-events` | Queues | Account-level Artifacts events (created / forked / deleted / imported) |
| D1 `braid` | D1 | Cross-River index: rivers, intents, channels, reviews, verdicts, eddy_cards, logbook_index, events_index |
| R2 `braid-blobs` | R2 | Raw events (`events/YYYY-MM-DD/…`), transcripts, test logs, screenshots, cached diffs |

## Event flow

```
agent git push ──► Artifacts repo river-<slug>--ch-<n>
                     │
                     ├─ cf.artifacts.repo.pushed ── triggers.events (namespace braid) ──► ReviewWorkflow
                     │                                                                    1. raw event → R2
                     │                                                                    2. repo.pushed → RiverAgent feed
                     │                                                                    3. tests / diffstat / risk (M3)
                     │
                     └─ (fork/create/delete/import) ── Queues event subscription ──► queue consumer
                                                                                       1. raw event → R2
                                                                                       2. repo.forked / river.created → feed
```

Repo-level Artifacts events (`artifacts.repo` source) subscribe to one repo at a time, so a Queues
subscription per fork would be needed. Instead, a single `triggers.events` entry in `wrangler.jsonc`
starts `ReviewWorkflow` for a push to *any* repo in the `braid` namespace. Account-level events use a
Queues subscription on the `artifacts` source.

Everything event-driven is idempotent: pushes are keyed by `(repo, after)`, feed events by their `id`.

## Artifacts naming (namespace `braid`)

| Repo | Name |
|---|---|
| Mainline | `river-<slug>` |
| Channel | `river-<slug>--ch-<n>` (n is River-wide) |
| Confluence fork | `river-<slug>--cf-<intentSlug>-<attempt>` |
| Smoke test | `braid-smoke`, `braid-smoke-fork` |

Slugs never contain `--`, so names parse unambiguously (`parseRepoName` in `packages/protocol`).

## Tokens

- Minted per Channel with `repo.createToken(scope, ttl)`, never longer than one hour.
- Sandboxes never see them: the `Outbound` gateway adds `Authorization: Bearer <token>` to requests for
  the granted repo paths only, and refuses `git-receive-pack` on read grants.
- External agents (MCP) receive a scoped write token for their own Channel only.
- Tokens are never logged, never written to a Logbook, and never returned to a browser.

## Commit trailers

Agents add these to every commit:

```
Headwaters-Intent: rate-limit-api
Headwaters-Channel: ch-5
Headwaters-Agent: claude-code
Headwaters-Model: <model id actually used>
Logbook: 0012
```

Confluence adds `Headwaters-Cost: $0.27` and `Headwaters-Risk: 0.72` to the commit it lands on main,
since risk is only known after review.

## Logbook

`.headwaters/logbook/<NNNN>-ch-<n>.md`, numbered per River:

```markdown
---
intent: "rate-limit-api"
channel: "ch-5"
agent: "claude-code"
model: "claude-sonnet-5-5"
costUsd: 0.27
transcript: "transcripts/riverlevels/ch-5.jsonl"
---

# Logbook 0012

## Plan
## Decisions
## Rejected approaches
## Notes for reviewers
```

## Risk policy

Risk bands follow the gauge: `< 0.40` low (teal), `0.40–0.59` mid (grey), `≥ 0.60` high (amber).
Auto-merge only when risk `< 0.60`, tests are green, and the judge is confident. Everything else becomes
an Eddy card: `pick` (tie between Channels), `approve` (high-risk change), `confirm` (merge resolution).
