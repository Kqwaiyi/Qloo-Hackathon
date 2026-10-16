# 09: Qloo client with a 30-day cache

**What to build:** The one way the app talks to Qloo: a client that sends read-only requests with the API key, has no room for anything that identifies a user, and caches every response in Neon for 30 days so repeat requests cost nothing. Nothing calls it yet; ticket 10 wires it into the first Styling. It is split out as a prefactor so that ticket stays small.

**Blocked by:** [01 Walking skeleton: sign up, sign in and the app shell](01-walking-skeleton.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Qloo client and cache", "Data model" (Qloo cache) and "Testing Decisions" (the Qloo privacy commitment). Stories 140 and 147.

- [x] Requests are `GET` with the `X-Api-Key` header against `QLOO_API_URL`, both read from environment variables. The transport is injectable, and tests use a fake transport that serves small hand-written responses and records every request. No fixture holds bulk Qloo data.
- [x] The request type has fields only for the age group, the gender signal, the Country (location query and `key_market` tag), Photo Style tags, entity IDs, and filter, exclusion, popularity, operator and `take` parameters. A type-level test asserts it has no field for a user ID, username, email or photo, or anything else that links two requests to one user.
- [x] Every response is cached in a Neon table for 30 days, keyed by the canonical request: parameters sorted and values normalised. An identical request within 30 days is served from the cache without calling Qloo, and an older entry is fetched again.
- [x] The cached body is trimmed to the fields used. People keep entity ID, name, whether `date_of_death` is set, and `query.affinity`. Brands keep entity ID, name, their tags, `target_gender`, `price_range_usd_min/max`, `official_site` and `query.affinity`. Descriptions and images are never kept.
- [x] A "too many requests" response surfaces as an error the caller can retry with back-off. From ticket 10 on, Workflow steps do the retrying.
- [x] There's no pre-warming and no shared rate limiter.
- [x] Tests cover a cache miss followed by a hit, reordered parameters hitting the same cache entry, the trimming, and refetching after 30 days using the injectable clock.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The interface.** `QlooClient` (`src/server/qloo/client.ts`) has `people(query)` and `brands(query)`, which return the trimmed entities in Qloo's order. `QlooQuery`'s keys are Qloo's own parameter names (`"signal.demographics.age"`, `"filter.tags"`…), so the Outfit assembly module can write the spec's queries as they read. `brands()` takes `QlooBrandQuery`, which has no `signal.interests.tags` (ADR-0002) and no `filter.gender` (people only). `qlooClientFromEnvironment({ db, clock })` reads `QLOO_API_URL` and `QLOO_API_KEY` and sends over `fetch`. It isn't in `Services` or `OperationContext` yet: ticket 10 adds it there, and adds `FakeQlooTransport` (`src/server/qloo/fake.ts`) to the test harness.
- **What comes back.**
  - People: `{ entityId, name, hasDateOfDeath, affinity }`.
  - Brands: `{ entityId, name, tags, targetGender, priceRangeUsdMin, priceRangeUsdMax, officialSite, affinity }`.
  - A field Qloo leaves out reads as null (or an empty list), and `affinity` can be null.
  - `targetGender` is Qloo's own wording, such as `["Male", "Female", "Gender-Neutral"]`.
  - `officialSite` is sometimes null and sometimes `http://`, so ticket 14's https-only "Visit" rule is needed.
- **Which Brand tags are kept.** The ticket says "their tags", but each Brand carries about 140 tags across about 33 types. Following the spec ("the tags the rules read"), only `urn:tag:product_category:qloo` (apparel, footwear, shoes, sneakers, denim…) and `urn:tag:genre:brand` (`fashion:jeans`, `fashion:footwear:*`…) are kept, as tag IDs. That covers every rule in the spec and the category tags tailoring sends. The list is `QLOO_BRAND_TAG_TYPES_KEPT` in `src/config/qloo.ts`. If a later rule needs another tag type, or any other field, it also needs a migration that empties `qloo_cache`, since older entries were trimmed without it. A real 2-Brand response went from 45 KB to 1.8 KB.
- **The canonical request** is both what Qloo receives and the cache key, for example `/v2/insights?filter.popularity.min=0.995&filter.tags=urn:tag:…,urn:tag:…&filter.type=urn:entity:person&take=50`. Parameters are sorted by name. Values are trimmed. Lists are sorted and de-duplicated, so the order of the Photo Style words changes neither the request nor the cache entry. Empty lists are dropped. Commas and colons stay unescaped, as in the research calls.
- **Errors.**
  - A 429 throws `QlooRateLimitedError`, with `retryAfterSeconds` taken from `Retry-After` when Qloo sends one. Ticket 10's steps should rethrow it as a retryable error with a back-off.
  - Any other non-2xx status throws `QlooError` with the `status`.
  - A body that doesn't parse throws.
  - Nothing is cached on any error.
- **For ticket 23.** Every live response carries `X-Month-RateLimit-Remaining` and `X-Month-RateLimit-Reset`. The reset value is in seconds from now: `2421095.46` on 2026-10-16 points to about 2026-11-13. There's also `X-Second-RateLimit-*` (5 a second). The client doesn't read these headers yet. Ticket 23 hooks into `QlooClient.send`, which only live responses go through, so cache hits record nothing.
- **For ticket 10's live check.** The Photo Style tag check in the research was `/v2/insights?filter.type=urn:tag&filter.results.tags=…`. The client only builds person and Brand queries, so that check extends the client or calls Qloo on its own.
- **Live calls used:** two read-only calls (`take=2`, one Brand and one person) on 2026-10-16, to confirm the response shape and headers. Their JSON stayed outside the repo. 9,702 calls were left afterwards.
- **Tests** (`src/server/qloo/client.test.ts`) run the client against a fresh PGlite with the real migrations, `TestClock` and the fake transport, using small made-up entities. They don't go through `createTestHarness`, since the client needs only the database and the clock. The type-level tests (the exact `QlooQuery` keys, no user-like key, no Photo Style on Brand queries) are checked by `npm run typecheck`, because `expectTypeOf` does nothing at runtime. Adding a `userId` field, or letting `brands()` take Photo Style tags, was confirmed to fail typecheck.
