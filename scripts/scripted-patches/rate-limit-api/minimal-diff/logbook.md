## Plan

Meet the Intent with the fewest moving parts. One new module (`src/api/rateLimit.ts`) holds the Durable Object, the middleware and `cache()`. Three lines wire it into the API, and the Worker exports the class and binds it in `wrangler.jsonc`. One small test file covers the limit and the cache header.

## Decisions

One `RateLimiter` Durable Object per caller holds a token bucket in memory: 10 tokens, refilled at 10 per second. The object is the single place a caller's count lives, so the limit holds across isolates. Memory is enough, because an object only goes away after idling far longer than the one second the bucket needs to refill.

The caller is the `Authorization` header as sent, else `cf-connecting-ip`, else `anonymous`. Over the limit: 429 `{ "error": "rate_limited", "retryAfter": 1 }`, exactly as the Intent specifies.

No binding, no limit. `pnpm dev` and the existing tests run without Durable Objects, and skipping the limiter there means no other file has to change.

`cache(60)` sets `Cache-Control: max-age=60` on successful `/levels` responses, and nothing else.

## Rejected approaches

A separate bucket module, typed bindings file and middleware folder. They're cleaner to grow, but they triple the file count for 40 lines of logic.

RPC (`extends DurableObject` from `cloudflare:workers`). That module doesn't exist under Node, so the tests would need an alias or the Workers test pool. A plain `fetch` handler avoids both.

Edge caching through the Cache API, and `RateLimit` headers: useful, but beyond what the Intent asks for.

## Notes for reviewers

5 files, +98/−4; no existing file outside the API wiring, the Worker entry and `wrangler.jsonc` changed. Tests: 16/16 (14 existing, 2 new). `pnpm build` passes and `npx wrangler deploy --dry-run` shows the `RATE_LIMITER` binding.

Known trade-offs: the raw `Authorization` value is used as the Durable Object name (`idFromName` hashes it into the ID, but the string still passes through), and there's no `Retry-After` header, only the `retryAfter` field in the body. If the limiter itself fails, the request fails with it (no fallback).
