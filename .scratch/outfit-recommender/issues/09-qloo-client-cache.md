# 09: Qloo client with a 30-day cache

**What to build:** The one way the app talks to Qloo: a client that sends read-only requests with the API key, has no room for anything that identifies a user, and caches every response in Neon for 30 days so repeat requests cost nothing. Nothing calls it yet; ticket 10 wires it into the first Styling. It is split out as a prefactor so that ticket stays small.

**Blocked by:** [01 Walking skeleton: sign up, sign in and the app shell](01-walking-skeleton.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Qloo client and cache", "Data model" (Qloo cache) and "Testing Decisions" (the Qloo privacy commitment). Stories 140 and 147.

- [ ] Requests are `GET` with the `X-Api-Key` header against `QLOO_API_URL`, both read from environment variables. The transport is injectable, and tests use a fake transport that serves small hand-written responses and records every request. No fixture holds bulk Qloo data.
- [ ] The request type has fields only for the age group, the gender signal, the Country (location query and `key_market` tag), Photo Style tags, entity IDs, and filter, exclusion, popularity, operator and `take` parameters. A type-level test asserts it has no field for a user ID, username, email or photo, or anything else that links two requests to one user.
- [ ] Every response is cached in a Neon table for 30 days, keyed by the canonical request: parameters sorted and values normalised. An identical request within 30 days is served from the cache without calling Qloo, and an older entry is fetched again.
- [ ] The cached body is trimmed to the fields used. People keep entity ID, name, whether `date_of_death` is set, and `query.affinity`. Brands keep entity ID, name, their tags, `target_gender`, `price_range_usd_min/max`, `official_site` and `query.affinity`. Descriptions and images are never kept.
- [ ] A "too many requests" response surfaces as an error the caller can retry with back-off. From ticket 10 on, Workflow steps do the retrying.
- [ ] There's no pre-warming and no shared rate limiter.
- [ ] Tests cover a cache miss followed by a hit, reordered parameters hitting the same cache entry, the trimming, and refetching after 30 days using the injectable clock.
