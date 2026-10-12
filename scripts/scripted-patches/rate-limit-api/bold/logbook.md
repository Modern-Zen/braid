## Plan

Build the limiter the way a production API would want it, even though it costs more surface. A Durable Object per caller exposes `take()` over RPC and persists its bucket, so limits survive restarts. Every response carries the standard RateLimit headers. The API fails closed when the limiter is missing. `/levels` is served from the edge cache, not just marked cacheable. Then rebuild the test harness so all of this runs under Node, and make `pnpm dev` exercise the real limiter too.

## Decisions

`TokenBucket extends DurableObject` and is called over RPC (`bucket.take(limit)`), with its state written to SQLite-backed storage on every take. Restarts, deploys and evictions can't hand a caller a fresh burst. The object handles one call at a time, and the write isn't awaited because the runtime's output gate already holds the reply until it is durable.

10 requests per second per token, bursts of 10. The key is a SHA-256 of the bearer token, else the client IP. The raw credential never becomes an object name.

Responses carry `RateLimit-Policy: "burst";q=10;w=1` and `RateLimit: "burst";r=<remaining>;t=<seconds to full>`, following the IETF draft (draft-ietf-httpapi-ratelimit-headers). Well-behaved agents can pace themselves before they ever see a 429. A refusal is 429 with `{ "error": "rate_limited", "retryAfter": 1 }` and `Retry-After`, computed from the bucket (1 s at this rate).

Fail closed: no binding or an unreachable limiter answers 503 `rate_limiter_unavailable`. A limit that silently disappears is worse than a visible outage, because the API exists to be polled by agents.

The edge cache uses the Workers Cache API keyed by URL only. Hono's built-in `cache()` skips every request that carries `Authorization`, and here that is every API caller, so it would never cache anything. The data is public, so one cached copy serves everyone, with `public, max-age=60, stale-while-revalidate=60` and `X-Cache: HIT/MISS`. It sits behind the limiter, so cache hits still count.

Tests and `pnpm dev` run the real `TokenBucket` in-process. `src/dev/memoryEnv.ts` provides Map-backed storage and a `restart()` that keeps storage, and Vite aliases `cloudflare:workers` to a 10-line shim. Wrangler bundles the real module. The runtime types live in `src/cloudflare.d.ts` rather than adding `@cloudflare/workers-types`. Wrangler config uses the declarative `exports` form for the Durable Object.

## Rejected approaches

A per-isolate in-memory map: it resets on cold start and multiplies the limit by the number of isolates.

Keeping the bucket only in Durable Object memory: an eviction or deploy hands every caller a fresh burst.

Failing open: it keeps the API up during a limiter incident, but it also removes the limit exactly when something is going wrong.

Hono's `cache()` middleware: it never caches requests with `Authorization`.

`@cloudflare/vitest-pool-workers` for tests: it's the most faithful runtime, but it brings a large dependency tree into a deliberately small project.

## Notes for reviewers

This is the widest change of the three: 14 files, +426/−10, and it changes behavior outside the limit. `/api` now returns 503 without the `RATE_LIMITER` binding, so `test/api.test.ts` and `test/render.test.tsx` were updated to pass in-memory bindings (their assertions are unchanged), and `vite.config.ts` gained an alias and dev bindings.

Commits 1 and 2 are red: the Worker imports `cloudflare:workers`, which Node can't load until commit 3 adds the shim and alias. Final: 24/24 (14 existing, 10 new), `pnpm build` passes, and `npx wrangler deploy --dry-run` lists `env.RATE_LIMITER (TokenBucket)`.

The Cache API is a no-op on `*.workers.dev` hostnames, so edge caching only takes effect on a custom domain; the headers are set either way.

The RateLimit header syntax follows an IETF draft that may still change.
