# 01: Product search and the coverage check

**What to build:** The app gains a product search it can ask about real Products, and the team can find out, before anything else is built, how many of the Brands Qloo returns the product search knows. This lays what every later ticket reuses: our own product-search interface (as `AiProvider` is), its Channel3 implementation over an injectable transport, a fake implementation, the switch between them, the rule for which market a Country searches, and exact Brand-name matching. It ends in an opt-in coverage check whose result is the go/no-go for the rest of the work. Respect [ADR-0008](../../../docs/adr/0008-pieces-are-real-products.md).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Product search interface", "Channel3 specifics", "Markets", "Brand matching" (normalising and ties), and "Testing Decisions" (Seam 2, the privacy commitment, live checks). Stories 28–30, 38, 54, 62, 68 and 69.

- [ ] The product-search interface has the spec's three operations (find a Brand, search a Brand's Products, check a Product) and its candidate shape. Its request types have no field for a user ID, username, email, photo, Style Icon, or anything that links two calls to one user, and a type-level test says so.
- [ ] The Channel3 implementation sends the `x-api-key` header, puts the market in the request's locale `config` (never at the top of a search body), asks for up to 30 Products per search and never pages. It maps "too many requests" to a retry with back-off and a refused key to an unretryable error. Our Categories map to Channel3 category IDs kept in config (Top, Bottom, Shoes, and dresses, jumpsuits and overalls for One-Pieces).
- [ ] The test harness gains a fake Channel3 transport, modelled on the fake Qloo transport: it serves small hand-written responses and records every request.
- [ ] A fake product search serves a small built-in catalogue for any Brand, in every Category and line. `PRODUCT_SEARCH` switches between the fake and Channel3, as `AI_PROVIDER` does, defaulting to the fake. With Channel3 switched on and no `CHANNEL3_API_KEY`, startup fails with a clear error.
- [ ] A pure rule gives each Country its market: its own for Channel3's 20 countries, the euro-wide `EU` market for any other euro Country, and the US market for every other Country.
- [ ] A pure rule normalises Brand names (lower case, accents and punctuation removed, spaces collapsed, a leading "the" dropped) and accepts only exact matches. Several exact matches are broken by Channel3's free websites lookup against Qloo's official site, or the Brand counts as not found.
- [ ] Tests at Seam 2 cover the market rule for a covered Country, another euro Country and any other Country, and normalisation and matching, including ties. A test at the transport records that Channel3 requests carry no user identifiers.
- [ ] An opt-in coverage check, never run in CI, takes the Brands Qloo returns (from the Qloo cache, or fresh Qloo calls), looks each up through Channel3's free Brand lookup, runs one search per line and Category for the matched ones, and reports how many Brands are usable. It reports whether the websites lookup could break the ties it met. It needs `CHANNEL3_API_KEY`, and costs a few credits per Brand searched.
- [ ] `.env.example` documents `PRODUCT_SEARCH` and `CHANNEL3_API_KEY`.
- [ ] **Team step:** sign up for Channel3, add the key to `.env.local`, and run the coverage check. If fewer than about 60% of the Brands that would be picked are usable, stop here: `main` stays the submission.
