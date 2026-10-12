## Plan

Rewrite the gauge around a real hook rather than lifting the old code out. `useGauge` gets a table of scales (each kind in both unit systems), pure `formatReading` and `fillPercent` helpers, and prop getters that carry the ARIA meter wiring and the unit toggle. `Gauge` becomes presentation only and takes the API's `Reading` object directly, and `RiverCard` and the tests follow the new props.

## Decisions

A `SCALES` table replaces three if/else chains. Each kind and unit system declares its unit label, conversion and `Intl.NumberFormat`, so adding a unit or a kind is one entry, not a new branch.

Prop getters (`getMeterProps()`, `getToggleProps()`) put the accessibility contract next to the logic that computes it. `aria-valuetext` and the toggle's title can't drift from the text on screen, and any future gauge layout gets them for free.

`Gauge` takes `reading={river.stage}` instead of spreading `value`, `min`, `max`, `alertAt` and `unit` as loose props. The API's shape and the component's input are now the same type. `RiverCard` passes readings straight through.

Number formatting moved to `Intl.NumberFormat`, so metric flow now groups thousands too ("1,132.7 m³/s"; it used to print "1132.7"). No current reading reaches that, and the US formatting is unchanged.

Colors stay in `Gauge.tsx`: the hook knows nothing about themes.

## Rejected approaches

A verbatim move of the old logic into a hook. It's a smaller diff, but it keeps the duplicated branches and leaves the ARIA wiring scattered in JSX.

Returning a ready-made element (a render-prop or `<GaugeView>`) from the hook. It's too opinionated: prop getters let any markup use it.

Keeping the old loose props alongside `reading` for compatibility: there's one caller, and it's updated in the same change.

## Notes for reviewers

The component's API changed: `<Gauge kind label reading defaultUnits />`. `RiverCard.tsx` was updated (3 lines). `test/gauge.test.tsx` now builds a `Reading` from its flat fixtures through a small adapter, and all of its assertions are unchanged and pass.

`Gauge.tsx` is rewritten almost entirely (+11/−57), so it will conflict with any Channel that edits the gauge, and `RiverCard.tsx` with any Channel that changes how cards render gauges.

There's one behavior change: grouped thousands in metric flow (see Decisions). Tests: 19/19 (14 existing, 5 new in `test/useGauge.test.tsx`). `pnpm build` passes.
