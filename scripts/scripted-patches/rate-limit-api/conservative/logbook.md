## Plan

Put a token-bucket limiter in front of `/api`, built in layers that can each be checked on their own. First a pure bucket with clock-driven tests. Then a Durable Object that holds one caller's bucket, then a Hono middleware that asks it for a token, then `cache(60)` on `/levels`. Keep the public API unchanged for callers under the limit, and keep every existing test passing without edits.

## Decisions

10 requests per second per token, with bursts of up to 10. The dashboard asks for `/api/levels` once every 30 seconds per open tab, so a person never gets near the limit; it only bites scripts and agents that loop. A token refills every 100 ms.

One Durable Object instance per caller (`idFromName(key)`), with the bucket in memory. A Durable Object handles one request at a time, so two isolates can't both take the last token. An instance is only evicted after idling far longer than the one second a bucket needs to refill, so a fresh instance starting full gives the same answer storage would, without a write per request.

The key is `token:<sha256(bearer token)>`, else `ip:<cf-connecting-ip>`. Hashing keeps the raw credential out of Durable Object names and anything that logs them.

Over the limit: 429 with `{ "error": "rate_limited", "retryAfter": 1 }` and `Retry-After: 1`. The caller is told to back off rather than having its request queued; the callers that hit this are agents and scripts, and they back off correctly. One second is a safe upper bound on the real wait (at most 100 ms).

Fail open. Without the `RATE_LIMITER` binding (`pnpm dev`, unit tests) the middleware steps aside. If the limiter throws, the request goes through and the error is logged. For a read-only dashboard API, an outage of the limiter shouldn't become an outage of the API.

`cache(60)` marks only successful `/levels` responses, with `Cache-Control: max-age=60`. There's no `public`, so shared caches won't store responses to authorized requests. A 429 is never cacheable. `/levels/:id` is untouched because the Intent names `/levels`.

The Durable Object uses a plain `fetch` handler instead of RPC (`extends DurableObject` from `cloudflare:workers`). That module only exists in the Workers runtime, and the plain class lets the tests drive the real limiter under Node. `src/env.ts` declares the two binding shapes used instead of adding `@cloudflare/workers-types`. No new dependencies.

## Rejected approaches

An in-memory map per isolate: limits reset on every cold start and differ per location, so a caller spread across isolates gets several times the limit.

Cloudflare's Rate Limiting rules or the Workers rate-limit binding: not versioned with the code, and per-location counters don't give an exact per-token limit.

Persisting the bucket to Durable Object storage on every request: it doubles the work per call to protect state that rebuilds itself within one second.

Failing closed when the limiter is unavailable. That's stricter, but it turns a limiter incident into a full API outage for a public, read-only endpoint.

## Notes for reviewers

The change is additive: new files under `src/api/limiter/` and `src/api/middleware/`, plus small edits to `src/api/index.ts`, `src/worker.ts` (exports `RateLimiter`, types the bindings) and `wrangler.jsonc` (binding plus a `v1` migration with `new_sqlite_classes`). No existing test changed.

This touches the public API surface: any caller doing more than 10 requests per second per token now gets 429s. `npx wrangler deploy --dry-run` bundles and lists the `RATE_LIMITER` Durable Object binding. Tests: 25/25 (14 existing, 11 new in `test/rate-limit.test.ts`), driving real `RateLimiter` instances through a fake namespace on a test clock. `pnpm build` passes.
