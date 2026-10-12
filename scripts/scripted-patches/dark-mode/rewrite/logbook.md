## Plan

Rewrite the presentation layer dark-first. Each component (Gauge, RiverCard, App) owns a light and a dark color set, and a single `useColorScheme()` hook reads the system setting and passes it down. The gauge gets a cleaner layout while it's open (value above a full-width bar), and `theme.css` drops its colors to become layout and type only.

## Decisions

Colors live next to the markup that uses them: `GAUGE_COLORS`, `CARD_COLORS` and `PAGE_COLORS`, each with `light` and `dark`. Reading a component then tells you exactly what it looks like in both schemes, with no indirection through variables, and every color is visible to the SSR tests.

The scheme comes from `prefers-color-scheme` through `useColorScheme()`, which keeps listening for changes. Components take a `scheme` prop that defaults to `light`, so the server render and existing callers are unchanged.

While rewriting the gauge, its unit logic became a table (`SCALES`: unit, conversion, decimals, spacing per kind and unit system) instead of three if/else chains. Number formatting now uses `toLocaleString`, so metric flow above 999 m³/s gets a thousands separator too. No current reading is that high.

Alerts tint the track as well as the bar (`alertTrack`), so an alert reads at a glance on a dark card, where an orange bar on a near-black track is easy to miss.

`tokens.ts` is removed: after the rewrite nothing imports it, and keeping a second, unused palette would invite drift.

## Rejected approaches

CSS custom properties with a `prefers-color-scheme` override. That's the smaller change, but it splits each component's look between a `.tsx` and a stylesheet, and the gauge's state-dependent colors can't be checked in a server-rendered test.

A shared token module that every component imports. It's the same indirection as CSS variables, just in JavaScript; with three components, per-component sets are easier to read and to change in isolation.

A theme toggle. The Intent is a dark mode; following the system setting covers it without new UI or stored state.

## Notes for reviewers

This is a rewrite, so the diff is wide: 8 files, +237/−116. `Gauge.tsx` is replaced almost entirely and `RiverCard.tsx` and `App.tsx` change throughout. Expect conflicts with any other Channel that touches these components, especially a gauge refactor.

Colors are duplicated on purpose. The stone/teal values appear in three components, and a palette change means editing each set.

`test/gauge.test.tsx` changed its import (`GAUGE_COLORS` instead of `palette`) and its two color assertions; the behaviors it checks are the same. Tests: 18/18 (14 existing, 4 new in `test/dark-mode.test.tsx`). `pnpm build` passes.

The first frame of a system-dark reader is light until the hook runs, because the server render and initial state default to light.
