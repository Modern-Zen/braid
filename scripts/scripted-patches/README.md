# Recorded patch series

Scripted mode (`BRAID_AGENT_MODE=scripted`) replays real agent work against the demo River,
`riverlevels`, one commit at a time. This folder holds that work: three Intents, each attempted
with three strategies, plus the merge resolutions for the Intents that collide.

## Layout

```
scripts/scripted-patches/
  <intent>/<strategy>/
    0001-<subject>.patch ...   git format-patch output against main, one commit each
    meta.json                  who recorded it, the commit list, replay delays, the Lines
    logbook.md                 the Logbook body (Plan / Decisions / Rejected approaches / Notes for reviewers)
    result.json                pnpm test after the whole series: { passed, total, failures }
  refactor-gauge/RESOLUTION.md the Gauge.tsx overlap with dark-mode, explained
  _resolutions/<intentA>.<strategyA>+<intentB>.<strategyB>/
    meta.json                  { pair, conflicted, touched, agent, model, notes, tests }
    files/<path>               resolved content of every file the merge needs
  verify.ts                    applies and checks everything against apps/demo-riverlevels
```

### meta.json

| Field | Meaning |
|---|---|
| `intent`, `strategy` | The Intent slug and the strategy, matching the folder names |
| `agent`, `model` | Who actually produced the patches: `claude-code` running `claude-opus-5-5`. Show these, with the `replay` tag. |
| `recordedAt` | When the last commit of the series was made (UTC) |
| `base` | The `main` commit the patches were made against (see "The base commit" below) |
| `commits[]` | `{ file, subject, delaySec: [min, max] }` in order. `delaySec` is the jitter window to wait before applying that commit (10 to 40 s, longer for bigger commits). |
| `turns` | Tool calls the recording agent made for this series: edits, test runs, commits |
| `durationMs` | Wall clock from creating the branch to the last commit |
| `costUsd` | `null`: per-series cost wasn't measured, and costs aren't invented |
| `lines` | The globs to `line.declare` before the first commit |
| `notes` | One-paragraph summary, including anything unusual (red intermediate commits, test edits) |

Commit messages are a plain subject and body. **They carry no Headwaters trailers**: the replay
engine adds `Headwaters-Intent`, `Headwaters-Channel`, `Headwaters-Agent`, `Headwaters-Model` and
`Logbook` with the runtime Channel id and Logbook number. It also writes
`.headwaters/logbook/<NNNN>-ch-<n>.md` from `logbook.md` plus front matter. The patches never
touch `.headwaters/`. The author is `Headwaters <agents@braid.drp.icu>`.

## The series

Base: `a1e0aaba4cae0b27a958621c7f527aea2336f8d1` (tree `9edf87d`), 14 tests.

| Intent | Strategy | Commits | Tests | Diff | What it does |
|---|---|---|---|---|---|
| dark-mode | minimal-diff | 3 | 18/18 | 5 files +94 −14 | Dark palette and CSS variables under `prefers-color-scheme`; Gauge reads `var(--rl-*)` tokens |
| dark-mode | tests-first | 4 | 23/23 | 7 files +260 −27 | Failing tests first, then ThemeContext, `usePalette()` in Gauge, and a "Dark mode" toggle |
| dark-mode | rewrite | 4 | 18/18 | 8 files +237 −116 | Dark-first rewrite; each component hard-codes light and dark colors; `tokens.ts` removed |
| rate-limit-api | conservative | 4 | 25/25 | 9 files +329 −4 | Pure bucket, fetch-handler Durable Object, fails open, `max-age=60` on `/levels` |
| rate-limit-api | bold | 4 | 24/24 | 14 files +426 −10 | RPC Durable Object with persisted state, RateLimit headers, fails closed, edge cache |
| rate-limit-api | minimal-diff | 2 | 16/16 | 5 files +98 −4 | One module: Durable Object, middleware and `cache(60)` |
| refactor-gauge | minimal-diff | 2 | 17/17 | 3 files +89 −26 | Verbatim move into `src/hooks/useGauge.ts` |
| refactor-gauge | tests-first | 4 | 23/23 | 4 files +167 −28 | Characterization tests, failing spec, then pure `gaugeReading()` plus hook |
| refactor-gauge | rewrite | 3 | 19/19 | 5 files +169 −63 | Table-driven hook with prop getters; Gauge takes `reading={Reading}` |

All 429 responses are `{ "error": "rate_limited", "retryAfter": 1 }` at 10 req/s per token.

## Notes for the replay engine

- **Run `pnpm install` once per Channel.** No series changes dependencies, so the seeded
  lockfile covers every commit.
- **Some intermediate commits are red on purpose**, and per-push reviews will report them as
  failures. These are dark-mode/tests-first commits 1 to 3, rate-limit-api/bold commits 1 and 2,
  and refactor-gauge/tests-first commit 2. Every series is green at its last commit.
- **Expected overlaps.** Every dark-mode series overlaps every refactor-gauge series on
  `src/components/Gauge.tsx`, both in their Lines and in a real git conflict. See
  `refactor-gauge/RESOLUTION.md`. rate-limit-api merges cleanly with all of them.
- **Resolutions are files, not patches.** Merge Channel B into A, then copy
  `_resolutions/<pair>/files/*` over the tree, `git add -A` and commit. This works in either
  order and gives the same tree.
- **rate-limit-api/bold changes how the API runs.** `/api` returns 503 without a
  `RATE_LIMITER` binding, and `wrangler.jsonc` declares the Durable Object through `exports`.
  The other two strategies use `migrations` with `new_sqlite_classes`.
  `npx wrangler deploy --dry-run` bundles all three.
- After a full scripted run (one series per Intent plus a resolution), `main` holds about 20
  to 35 tests, depending on which Channels win.

## How they were recorded

Claude Code (`claude-opus-5-5`) produced the series as the agent itself, in October 2026, while
building this demo (workstream D). They are not the output of the Headwaters live adapter, which
didn't exist yet. Each series is a real attempt that follows its strategy: the agent edited code
in a scratch clone of `apps/demo-riverlevels`, ran the tests, and committed in small steps. The
Logbooks describe what it actually did, including the dead ends. `result.json` comes from running
`pnpm test` on the final commit, and `verify.ts --test` reproduces it. The merge resolutions were
written the same way and checked in both merge orders.

## The base commit

The patches apply to the tree of `apps/demo-riverlevels` on this branch. The seed commit is
deterministic: the tracked files, committed by `Headwaters <agents@braid.drp.icu>` as both author
and committer, with both dates `2026-10-12T12:00:00Z` and message `Seed riverlevels`, with
`core.autocrlf=false`. That gives `a1e0aab`. `createBase()` in `verify.ts` does exactly this and
can be imported by the seed script. `git am` only needs the same tree, so a seed with a different
sha still works.

## Verify

```powershell
npx tsx scripts/scripted-patches/verify.ts                       # every series applies with git am
npx tsx scripts/scripted-patches/verify.ts --conflicts           # cross-Intent merge matrix
npx tsx scripts/scripted-patches/verify.ts --resolutions --test  # resolutions in both orders, pnpm test and tsc
npx tsx scripts/scripted-patches/verify.ts --all --keep          # everything; keep the scratch repo
```

If you change `apps/demo-riverlevels`, re-record the series: the tree changes, and `verify.ts`
will report a base mismatch.
