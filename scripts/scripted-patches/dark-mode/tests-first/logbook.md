## Plan

Write the dark mode's behavior down as tests first, then build until they pass. The tests pin four things. A saved choice beats the system setting. The dark palette covers every token and keeps WCAG contrast. The gauge takes its colors from the active theme. The page carries a toggle that reports its state. The implementation is a dark palette next to the light one, a small React context for the active theme, the gauge reading its palette from that context, and a "Dark mode" toggle in the header.

## Decisions

Theme lives in React context, not only in CSS. The gauge colors its bar inline (the bar turns orange at the alert threshold, and the track is a tint of the bar), so it needs real color values in JavaScript. `usePalette()` hands it the palette for the active theme. Outside a provider it is still light, so every existing render and test keeps working.

Resolution order: an explicit saved choice (`localStorage`), else `prefers-color-scheme`. The app keeps following the system setting live until the reader presses the toggle. `resolveTheme()` is a pure function so the rule is unit-tested without a browser.

The CSS follows the same state through `<html data-theme="dark">`, set from the app, so page chrome and gauges can't disagree.

The toggle is a native `<button aria-pressed>` labelled "Dark mode", which screen readers announce as a toggle button. That is less code than a custom switch role, and it's testable with `renderToString`.

## Rejected approaches

CSS-only dark mode (a `prefers-color-scheme` media query plus `var(--rl-*)` in the gauge). It's smaller, but the Intent's tests ask for an explicit toggle, and a CSS-only version can't be overridden by the reader without the same state machinery anyway.

Passing a `theme` prop down from App to RiverCard to Gauge. That's three components touched for a value only the gauge needs; context keeps `RiverCard.tsx` out of this change.

An inline script in `index.html` to set `data-theme` before first paint. It's out of this Channel's Lines, and the bundle is small enough that the first frame is the only one at risk (see the notes below).

## Notes for reviewers

Commits 1 to 3 are deliberately red: `test/dark-mode.test.tsx` imports `ThemeToggle`, which doesn't exist until commit 4, so a review of those pushes shows the suite failing. The final commit is green: 23/23 (14 existing, 9 new). `pnpm build` passes.

Known gap: a reader whose system is dark sees the light theme for the first frame, until the app's effect sets `data-theme`. Fixing that needs a few lines in `index.html`, which is outside the declared Lines.

`src/App.tsx` changed more than the other files: the provider wrapper re-indents the JSX, and it gains the theme state and two effects. `src/components/Gauge.tsx` changed by two lines (the import and `const palette = usePalette()`), which still overlaps any refactor of the gauge's body.
