# The Gauge.tsx conflict: dark-mode x refactor-gauge

`dark-mode` and `refactor-gauge` both edit `src/components/Gauge.tsx`, on purpose. Whichever
lands on `main` second can't merge or rebase cleanly. This is the overlap the River shows as
`line.conflict` when both Channels declare their Lines, and the Confluence `confirm` card when
the second one lands.

## What conflicts

All nine strategy pairs conflict (checked with `git merge` in both orders by
`verify.ts --conflicts`). `rate-limit-api` merges cleanly with every series of both.

| dark-mode \ refactor-gauge | minimal-diff | tests-first | rewrite |
|---|---|---|---|
| **minimal-diff** | Gauge.tsx | Gauge.tsx | Gauge.tsx, test/gauge.test.tsx |
| **tests-first** | Gauge.tsx | Gauge.tsx | Gauge.tsx |
| **rewrite** | Gauge.tsx | Gauge.tsx | Gauge.tsx, RiverCard.tsx, test/gauge.test.tsx |

## The required pair: minimal-diff x minimal-diff

Rebasing `refactor-gauge/minimal-diff` onto `dark-mode/minimal-diff` stops at
*Extract useGauge from Gauge* with three conflict hunks in `Gauge.tsx`:

1. **Imports.** Dark mode keeps `useState` and swaps `palette` for `tokens`; the refactor drops
   `useState` and adds `useGauge`.
2. **The component body.** Dark mode keeps the inline logic and changes the last line to
   `tokens.alert : tokens.bar`; the refactor replaces the whole block with one `useGauge()` call
   followed by `palette.alert : palette.bar`.
3. **The value button.** Dark mode changes its color to `tokens.ink`; the refactor changes its
   `onClick` to `toggleUnits`.

**Resolution.** Keep the refactor's extracted hook and dark mode's theme props: import
`useGauge` and `tokens`, call the hook, and color with `tokens.*`, including the `color-mix()`
track tint. `src/hooks/useGauge.ts` is unchanged. The combined tree passes **21/21** tests and
`tsc`, and both merge orders produce the same tree.

## Files for the Confluence engine

Each pair is stored in `scripts/scripted-patches/_resolutions/<intentA>.<strategyA>+<intentB>.<strategyB>/`
(intents in alphabetical order):

- `meta.json`: `pair`, `conflicted` (the paths git reports as unmerged), `touched` (every file
  under `files/`), `agent`, `model`, `notes` (what was kept from each side) and `tests`.
- `files/<path>`: the fully resolved content of every conflicted file, plus any file the merge
  left textually clean but broken. With the refactor's `rewrite` strategy the Gauge's props change,
  so dark mode's test file is fixed too.

To apply one, merge the second Channel into the first, overwrite every path in `files/`,
`git add -A`, then commit. It works in either order. Tests after the merge:

| dark-mode \ refactor-gauge | minimal-diff | tests-first | rewrite |
|---|---|---|---|
| **minimal-diff** | 21/21 | 27/27 | 23/23 |
| **tests-first** | 26/26 | 32/32 | 28/28 |
| **rewrite** | 21/21 | 27/27 | 23/23 |

Every pair's `notes` follow the same rule: presentation and theme from dark mode, logic from the
refactor's hook. Where dark mode's rewrite had its own formatting table, the hook's formatting
wins.

```sh
npx tsx scripts/scripted-patches/verify.ts --conflicts --resolutions --test
```
