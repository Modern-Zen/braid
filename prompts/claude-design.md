# Claude Design prompt: Headwaters

*Paste everything below the line into Claude Design. Attach Modern Zen brand files if you have them handy; the prompt works without them.*

---

## What you're designing

**Headwaters** is a Git platform for the agentic era, built on Cloudflare Workers and Artifacts by Modern Zen Strategies. It's an entry in Cloudflare's "build the next Git platform" competition, and it will be shown in a 5–10 minute demo video. It has to look finished, calm, and unmistakably new: not "GitHub with an AI sidebar."

Design two things:

1. **A landing page** at `braid.drp.icu` that explains the idea in 10 seconds and the value in 60.
2. **Four core app screens**, with their key states, that the video will be recorded on.

Also deliver **design tokens as CSS custom properties** (color, type scale, spacing, radius, shadow, motion) and component specs clean enough for an engineer to port 1:1 into React.

## The idea in one breath

GitHub was built when hands were scarce. Agents made hands abundant. Now the scarce thing is human attention. Headwaters lets many agents work the same codebase at once, each in its own forked repo, and turns all of that activity into the few decisions that actually need a person.

The metaphor is a **braided river**: one channel splits into many shallow channels that run side by side, shift, and rejoin downstream. Mainline → many parallel attempts → compared → rejoined.

## Brand: Modern Zen

- **Voice:** "Calm hands, fast water." The agents are the fast water. The human stays calm, reads the river, and picks the line.
- **Copy register:** short, declarative, confident. No cleverness, no puns, no hype words ("revolutionary," "supercharge," "10x"). River words name *things* (River, Channel, Line, Scout, Confluence, Logbook, Eddy); sentences stay plain.
- **Feel:** a field guide, not a cockpit. Quiet confidence, generous whitespace, precise detail. The opposite of neon-gradient AI branding.

## Visual direction

- **Core motif:** aerial braided-river topography drawn as fine, generative line work. Hairline strokes that split from a single line, run in parallel, and rejoin. Use it as the hero animation, as section dividers, and as the literal data visualization in the app (the "channel map"). Think survey maps, contour lines, and ink on paper.
- **Palette (proposal, adjust to brand files if attached):**
  - Paper `#F6F4EF` (light background) / Basalt `#0F1416` (dark background)
  - Slate `#2B3A42` for primary text in light mode
  - Glacial teal `#3E8A8C` as the primary accent: channels, links, active agents
  - River stone greys `#8A9496`, `#C9CFCF`, `#E4E7E6` for structure
  - **Sunlit amber `#E3A33B`, reserved only for "needs a human."** It is the only warm color in the system. When amber appears, a person has a decision to make. Protect that rule everywhere.
  - Success = deep moss `#4F7A4A`, conflict = muted rust `#B5573B`, both used sparingly
- **Type:** a confident, slightly literary serif for display (Fraunces, Newsreader, or similar), a clean grotesk for UI (Inter, Söhne-like), and a mono for hashes, branches, and code (JetBrains Mono or similar). Large display sizes, tight UI sizes.
- **Motion:** slow and fluid. Lines draw on; channels fork and merge with ease-in-out over 600–1200ms. Nothing bounces. Respect `prefers-reduced-motion`.
- **Light and dark modes**, both first-class. Dark mode should feel like a river at night with teal lines glowing faintly, not a generic dark dashboard.
- **Responsive:** desktop first (the video is desktop), with a clean mobile landing page.

## Part 1: Landing page

Use this copy as the starting point; tighten it if you can do better in the same register.

1. **Hero**
   - Eyebrow: `HEADWATERS · BY MODERN ZEN`
   - Headline: **Many agents. One river.**
   - Sub: A Git platform for the agentic era. Agents work in parallel, each in its own repo. You make the few decisions that matter.
   - CTAs: `See it run` (anchors to demo video) · `Read the source` (GitHub)
   - Visual: the animated braid. A single line enters from the left, splits into 3–9 channels (each a small pulsing agent dot with a label like `ch-2 · claude`), the channels run and drift, and a few rejoin into a bolder mainline on the right. One channel briefly turns amber where a human decision is needed, then resolves.
2. **The shift** (two-column contrast)
   - Left, muted: *Built for scarce hands.* Branches, pull requests, review requests, notifications: tools for coordinating a few people typing.
   - Right, emphasized: *Built for scarce attention.* When agents are abundant, the bottleneck is your judgment. Headwaters spends it carefully.
3. **Five ideas** (the heart of the page; each gets a small, precise diagram in the river line style)
   - **Forks, not branches.** Every attempt is its own repo with its own scoped token. Agents can't touch each other's work, or main.
   - **Lines.** Agents declare what they'll touch before they write. Overlaps surface instantly, so conflict is avoided upstream.
   - **Scout.** Compare every attempt running side by side: live previews, tests, cost, and a judge's verdict. Choose; don't read diffs.
   - **Logbook.** The *why* behind every commit lives in the repo: plan, decisions, rejected paths. Versioned, forkable, searchable.
   - **Eddy.** The only place a human is needed. Headwaters measures itself by how few decisions it asks of you.
4. **The calm counter**: a large, quiet stat band, animated from zero:
   `9 agents · 41 commits · 3 previews · 1 decision for you`
5. **How it flows**: a horizontal flow diagram drawn as one river: *Intent → Channels → Lines → Scout → Confluence → Main*, with a short sentence under each.
6. **For agents**: a split code panel. Left: the MCP join (`river.join`, `channel.start`, `line.declare`). Right: a plain `git clone https://x:<token>@…/river-riverlevels--ch-2.git`. Caption: *Agents already know Git. Headwaters speaks it.*
7. **Built on Cloudflare**: a typographic strip (product names as text, no logos): Artifacts · Workers · Durable Objects · Workflows · Queues · Sandboxes · Browser Rendering · AI Gateway · Vectorize. One line: *Every attempt is a repo. Artifacts makes that cheap enough to be the default.*
8. **Open source**: MIT, GitHub `Modern-Zen/braid`, with run-it-yourself instructions as a CTA.
9. **Footer**: *Calm hands, fast water.* · Modern Zen Strategies · modernzen.co

## Part 2: App screens (for the demo video)

The demo project is a River called **riverlevels**, a small river gauge dashboard app. Three Intents run at once: *Add a dark mode*, *Add rate limiting to /api*, and *Refactor the gauge component*, each with 3 Channels, for 9 agents total.

App shell: a slim left rail (Rivers, Intents, Scout, Eddy, Logbook), a top bar with the River name, `main @ 4f2a9c1`, and the calm counter. The Eddy entry shows an amber count badge when decisions are waiting.

**Screen A: River (live channel map)**
- The centerpiece: a horizontal river visualization. The mainline runs across the screen; each Intent forks into its Channels as flowing lines; each Channel has an agent chip (`ch-2 · claude-code · minimal-diff`), live status (`cloning`, `planning`, `editing 3 files`, `pushed a41c…`, `tests ✓`), and commit dots along its line.
- **Lines** overlay: when two Channels declare overlapping files, a soft rust "shoal" mark appears where their lines cross, with a tooltip: `ch-2 (dark mode) and ch-7 (refactor) both claim src/components/Gauge.tsx`.
- A right-hand live feed: compact event rows (`repo.forked`, `repo.pushed`, `line.declared`, `review.passed`) in mono with relative timestamps.
- States: *empty River* (single calm line, "Open an Intent"), *9 agents running*, *overlap detected*, *all merged*.

**Screen B: Scout (compare an Intent's Channels)**
- Three columns, one per Channel. Each has a live preview screenshot (riverlevels in light vs dark variations), a status row (tests 14/14, diff +82 −11 across 4 files, cost $0.31, time 3m12s), and the risk score as a small gauge.
- The judge's verdict across the top: ranked 1–2–3 with a two-sentence rationale and a `Pick ch-2` primary button. Secondary actions: `Open preview`, `View diff`, `Replay from commit…`.
- States: *still running* (skeleton previews), *verdict ready*, *tie, human needed* (amber).

**Screen C: Eddy (the human inbox)**
- Top: the calm counter large and centered: **"9 agents · 41 commits · 1 decision for you."**
- Below: decision cards only. Each card has one question ("Pick a dark mode", "Approve a high-risk change to /api", "Confirm merge resolution"), the minimal context to decide, and 1–3 buttons. Auto-handled items collapse into one quiet line: *38 changes merged automatically. Review log →*
- State: *inbox zero*, designed as a moment of calm: still water, one line, "Nothing needs you. The river is running."

**Screen D: Logbook / commit view**
- A commit header (hash, Channel, agent, Intent) with the commit trailers shown as clean tags.
- Split view: diff on the left; on the right, the Logbook entry for that change: **Plan**, **Decisions**, **Rejected approaches**, **Model and cost**, and a link to the full transcript.
- A `Replay from here` action that forks the Channel at this commit, with a model/strategy picker.
- An "Ask the river" search box at top: *Why does /api rate-limit at 10 req/s?* → result card linking the commit and quoting its Logbook.

## Components to specify

Agent chip · channel line (idle/active/pushed/merged/conflict states) · commit dot · event row · stat counter · decision card · verdict banner · risk gauge · preview card · code panel · trailer tag · left rail · top bar · empty states.

## Deliverables checklist

- [ ] Landing page, desktop + mobile, light + dark
- [ ] Screens A–D at 1440px, with the listed states
- [ ] Design tokens as CSS custom properties (`--hw-color-*`, `--hw-font-*`, `--hw-space-*`, `--hw-radius-*`, `--hw-motion-*`)
- [ ] Component specs with sizes, states, and spacing
- [ ] Notes on the braid animation (timing, easing, how channels split and rejoin) so it can be rebuilt in SVG + CSS/JS
