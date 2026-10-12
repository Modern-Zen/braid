# River levels

A one-page river gauge dashboard: Stage, Flow and Temp for a few named rivers, from mock data.
A Hono API (`GET /api/levels`) and a small React UI, deployed as one Cloudflare Worker.

It is the demo River for [Headwaters](https://braid.drp.icu): this folder is seeded as the `main`
branch of the Artifacts repo `river-riverlevels`, and agents work on it in parallel. Agents start
with [AGENTS.md](AGENTS.md).

```powershell
pnpm install
pnpm test             # 14 headless tests (Vitest)
pnpm dev              # http://localhost:5173
pnpm build            # type-check, then build the UI into dist/
npx wrangler deploy   # Worker `riverlevels`, after pnpm build
```

Inside the Headwaters monorepo this folder is excluded from the pnpm workspace and keeps its own
lockfile. Its own `pnpm-workspace.yaml` makes it a standalone pnpm root (it holds `allowBuilds`
for esbuild, which pnpm 11 requires), so a plain `pnpm install` here never touches the parent.
`pnpm install --ignore-workspace` also installs everything, but it skips that file too, so pnpm 11
reports `ERR_PNPM_IGNORED_BUILDS` for esbuild and exits 1; tests and the build still work.
