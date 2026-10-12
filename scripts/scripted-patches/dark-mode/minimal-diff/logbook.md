## Plan

Add a dark mode by giving the existing theme a token layer instead of touching every component. Add a dark palette next to the light one in `src/theme/tokens.ts`, mirror both as CSS custom properties in `theme.css`, and switch to the dark set under `prefers-color-scheme: dark`. The page chrome already reads `var(--rl-*)`, so the only component that needs to change is `Gauge.tsx`, which set its colors inline from the light palette.

## Decisions

Follow the system setting (`prefers-color-scheme`) and add no toggle. The Intent asks for a dark mode, and honoring the OS preference is the smallest change that delivers one. Previews and screenshots can emulate the media feature. A toggle can come later by setting `data-theme` on `<html>`, without touching the tokens again.

Components read `tokens` (`var(--rl-bar)` and so on), never raw hex. That makes the gauge follow whichever theme is active without knowing which one it is. `palette` stays exported as an alias of `light`, so other imports keep working.

The gauge track used to be the bar color with a hex alpha suffix (`#0d948822`). That trick can't be applied to a CSS variable, so the track now uses `color-mix(in srgb, <bar> 13%, transparent)`, which gives the same tint (0x22 is about 13%) in both themes. `color-mix()` is supported by every current evergreen browser.

Dark values come from the stone/teal family the light theme already uses: `#1c1917` cards on a `#0c0a09` page, `#2dd4bf` bars and `#fb923c` alerts. A test checks WCAG contrast on cards in both themes: at least 4.5:1 for text, 3:1 for bars.

## Rejected approaches

Turning `palette`'s values into `var(--rl-*)` strings, so that `Gauge.tsx` didn't change at all. It's a smaller diff, but it silently changes what `palette` means for every caller, and it would still break the hex-alpha track tint.

A test that parses `theme.css` to prove it mirrors `tokens.ts`. Vitest hands CSS imports to tests as empty strings (even `?raw`) unless `test.css` is configured, and reading the file with `node:fs` needs `@types/node`. Either way the change would grow past its declared Lines (`vite.config.ts`, `package.json`). The duplication is flagged in comments in both files instead.

A theme toggle with `localStorage`. It's more UI, more state and more tests than the Intent asks for.

## Notes for reviewers

Three small commits: tokens and CSS first, then the gauge, then tests. `test/gauge.test.tsx` changed in two assertions. It used to look for the light hex (`#0d9488`) in the gauge's inline style, and now looks for the token (`var(--rl-bar)`). The behavior it checks (alert color at the threshold) is unchanged.

`theme.css` and `tokens.ts` both hold the raw colors; keep them in sync by hand. This Channel overlaps any Channel that edits `src/components/Gauge.tsx` (for example a gauge refactor): the changed lines are the color expressions, the track style and the token import.

Tests: 18/18 (14 existing, 4 new in `test/theme.test.tsx`). `pnpm build` (tsc and vite) passes.
