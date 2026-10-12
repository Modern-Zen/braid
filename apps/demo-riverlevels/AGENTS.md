# AGENTS.md: riverlevels

You are working in **River levels**, a one-page river gauge dashboard, and the demo River of
[Headwaters](https://braid.drp.icu). Several agents work this repo at once, each in its own fork
(a Channel). Read this file before you plan.

## What the app is

- A Cloudflare Worker. `src/worker.ts` mounts a Hono API on `/api/*`; everything else is the built
  React UI in `dist/`, served as static assets (`wrangler.jsonc`).
- `GET /api/levels` returns mock readings for four rivers (Stage in ft, Flow in cfs, Temp in °F).
  `GET /api/levels/:id` returns one river, or a JSON 404.
- The UI is one page: a card per river, each with three gauges. Light theme only.

| Path | What lives there |
|---|---|
| `src/api/` | Hono app (`index.ts` exports `api`), handlers (`levels.ts`), mock data (`data.ts`) |
| `src/components/Gauge.tsx` | The gauge: unit conversion, formatting, bar math and colors, inline |
| `src/components/RiverCard.tsx` | One river: name, site, three gauges, update time |
| `src/theme/` | `tokens.ts` (palette used by the gauge) and `theme.css` (page styles, CSS variables) |
| `src/App.tsx`, `src/main.tsx` | The page and its browser entry |
| `src/types.ts` | Shapes shared by API and UI |
| `test/` | Vitest, headless: API via `app.request()`, UI via `react-dom/server` |

## Commands

```powershell
pnpm install          # dependencies (own lockfile; this folder is a standalone project)
pnpm test             # 14 tests, Node only, no browser; must stay green
pnpm build            # tsc --noEmit, then vite build into dist/
pnpm dev              # http://localhost:5173, with /api answered in-process
npx wrangler deploy   # deploy as the `riverlevels` Worker, after pnpm build
```

## Conventions

- TypeScript strict. React function components. Plain CSS, no CSS framework.
- Tests go in `test/` as `*.test.ts` or `*.test.tsx` and must run without a browser or network.
  Prefer adding a new test file for new behavior over growing a shared one.
- Don't add dependencies unless the Intent needs them; if you do, say why in your Logbook.
- Mock data is fixed so tests, previews and screenshots are stable. Don't randomize it.

## Headwaters protocol (required)

1. **Declare Lines before you edit.** A Line is a claim on the files you intend to touch. In the
   Channel's sandbox:

   ```
   braid-line declare "src/theme/**" "src/components/Gauge.tsx" --note "dark mode tokens"
   ```

   Exit code 3 means another Channel holds an overlapping Line; the overlaps are printed as JSON.
   Narrow your globs, or carry on knowing Confluence will have to reconcile the overlap.
2. **Stay inside your Lines.** Never touch a file outside your declared globs without declaring
   again with the wider set first. Release Lines you no longer need with `braid-line release <glob>`.
3. **Commit with trailers.** Every commit ends with:

   ```
   Headwaters-Intent: <intent slug>
   Headwaters-Channel: <ch-n>
   Headwaters-Agent: <your agent name, e.g. claude-code>
   Headwaters-Model: <the model id you are actually running>
   Logbook: <NNNN>
   ```

   Report your real agent and model. Headwaters shows them in the UI as you report them.
4. **Write a Logbook.** One file per Channel at `.headwaters/logbook/<NNNN>-ch-<n>.md` (the number
   is assigned by the River). Front matter `intent`, `channel`, `agent`, `model`, then these sections:

   ```markdown
   ## Plan
   ## Decisions
   ## Rejected approaches
   ## Notes for reviewers
   ```

   Decisions explain *why* (one paragraph each); reviewers and the judge read them.
5. **Keep tests green** before you push your last commit, and never weaken a test to pass it
   without saying so in the Logbook.
6. Never put tokens, secrets or remote URLs with credentials in commits, Logbooks or output.
