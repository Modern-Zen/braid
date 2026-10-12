## Plan

Extract the gauge's logic into `src/hooks/useGauge.ts` without changing what it does: the unit state, unit conversion, reading format, bar fill and alert flag. Move the code as-is, have `Gauge.tsx` call the hook, keep the component's props and markup identical, and add a small direct test of the hook.

## Decisions

The hook owns logic; the component owns presentation. `useGauge` returns `{ reading, pct, alert, metric, toggleUnits }`, and the colors (`palette.alert` and `palette.bar`, plus the track tint) stay in `Gauge.tsx`. The hook can then be reused by a different-looking gauge, and theme work doesn't have to touch it.

The code moved verbatim: same if/else chains, same rounding. A refactor that also rewrites the logic is harder to review, because the diff can't show that behavior is unchanged. The 14 existing tests pass untouched, and they are the proof.

`GaugeProps` is unchanged, so `RiverCard.tsx` and every test that renders `<Gauge>` are unaffected.

The new test runs the hook inside a probe component rendered with `renderToString`. That tests the hook directly without a DOM or a testing-library dependency.

## Rejected approaches

Tidying the conversion into a lookup table while moving it. It's a reasonable follow-up, but it's a behavior risk hidden inside a move.

Moving the color choice into the hook (`barColor`). That ties the hook to the theme and makes every theme change a hook change.

Splitting pure functions (`formatReading`, `fillPercent`) out of the hook as well. They'd be more exports for no current caller.

## Notes for reviewers

`Gauge.tsx` loses 26 lines and gains 3; `useGauge.ts` is the removed block plus types. The changed region in `Gauge.tsx` runs from the imports to the `barColor` line, plus the button's `onClick`. Any Channel that edits the same lines, such as one theming the gauge's colors, will conflict here; when resolving, keep the hook call and apply the other side's color changes to the lines that remain in the component.

Tests: 17/17 (14 existing, unchanged; 3 new in `test/useGauge.test.tsx`). `pnpm build` passes.
