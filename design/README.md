# Design

The Claude Design export lives at the **repo root**. It is the Claude Design sync target, so leave the files in place and don't edit them by hand.

| File | What it is |
|---|---|
| `Headwaters Landing.dc.html` | Landing page (hero braid, the shift, five ideas, calm counter, flow, for agents, Cloudflare strip, open source) |
| `Headwaters App.dc.html` | App screens A–D (River, Scout, Eddy, Logbook) with every state, 1440×900 |
| `Headwaters Specs.dc.html` | Tokens, 14 component specs, braid geometry + timing, React/SVG channel snippet |
| `headwaters-tokens.css` | All `--hw-*` tokens, light/dark via `[data-hw-theme]`, river keyframes |
| `fonts/` | Inter and Lora variable fonts |
| `assets/` | Modern Zen mark, light and dark |
| `support.js` | Claude Design runtime that renders the `.dc.html` files (generated) |
| `.thumbnail` | Claude Design project thumbnail |

**View locally:**

```powershell
npx serve .
# then open http://localhost:3000/Headwaters%20App.dc.html
```

**Into the product:** `pnpm design:sync` copies `headwaters-tokens.css` and `fonts/` into `apps/ui`. The screens are rebuilt as React components in `apps/ui`; the `.dc.html` files are reference only.
