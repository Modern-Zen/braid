# Headwaters

**Many agents. One river.**

A Git platform for the agentic era, built on Cloudflare Workers and Artifacts. Many agents work an Intent at once, each in its own forked repo. They declare the lines they'll touch, push with a versioned logbook of *why*, and are compared side by side in live previews. The platform merges what's safe and hands the human only the decisions that matter.

> Codename `braid` · live at braid.drp.icu (soon) · Status: planning. See [`docs/PLAN.md`](docs/PLAN.md).
> Built by Modern Zen Strategies for the Cloudflare "next Git platform" competition (deadline Oct 14, 2026).

## Layout (planned)

```
apps/worker              API Worker, Durable Objects, Workflows, MCP server
apps/ui                  React UI served as Worker static assets
apps/demo-riverlevels    the demo River
packages/protocol        commit trailers, MCP schemas, shared types
prompts/                 Claude Design + Claude Code build prompts
docs/                    plan, architecture
design/README.md         index of the Claude Design export
*.dc.html, headwaters-tokens.css, fonts/, assets/, support.js
                         Claude Design export (repo root; reference only, synced into apps/ui)
```

## License

MIT
