## Plan

Make the refactor provably behavior-preserving before touching the component. First pin today's behavior with characterization tests, aimed at the edges the suite didn't reach. Then write the extracted API as failing tests: a pure `gaugeReading()` plus a `useGauge()` hook. Then move the logic into `src/hooks/useGauge.ts` until everything is green. Finally, clean up inside the new module under the tests' protection.

## Decisions

Split the hook in two. `gaugeReading(input, units)` is a pure function (conversion, formatting, fill, alert), and `useGauge()` only adds the unit state and the toggle. Pure logic can be tested without React and reused anywhere a reading needs formatting, such as a tooltip, an export or the API. The hook stays three lines.

The characterization tests pin the odd cases as they are, not as they should be. Metric flow above 1,000 m³/s prints without a thousands separator ("1132.7 m³/s"), and that's now written down. Changing it would be a separate, visible decision rather than a refactor side effect.

`Gauge.tsx` keeps its props, markup and colors. The hook returns `units` rather than a `metric` boolean, so the title text reads off the same state the toggle flips.

The conversion factors got names (`METERS_PER_FOOT` and so on) in a final, separate commit, so the move itself stays a pure move in review.

## Rejected approaches

Testing the hook with a DOM library (`@testing-library/react` plus `jsdom`): it adds dependencies to click a button whose effect is one `setState`. The probe component plus `renderToString` covers the hook's output in both unit systems.

Fixing the ungrouped metric flow while extracting: it's a behavior change hidden in a refactor.

Converting the if/else chains to a lookup table: it's possible later, and the pinned tests would make it safe, but it's not needed for the extraction.

## Notes for reviewers

Commit 2 is red on purpose: `test/useGauge.test.tsx` imports a module that commit 3 creates. Every other commit is green.

No existing test changed. Final: 23/23 (14 original, 5 characterization in `test/gauge-behavior.test.tsx`, 4 spec in `test/useGauge.test.tsx`). `pnpm build` passes.

`Gauge.tsx`'s changed region covers the imports, the whole logic block above `barColor`, and the button's `title` and `onClick`. A Channel that changes the gauge's colors will conflict on those lines; keep the hook call and carry the color changes over.
