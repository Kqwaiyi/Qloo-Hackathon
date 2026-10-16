# 15: Budget Tiers with thin-pool widening

**What to build:** A user sending a Full-Body or Body-Only Photo picks a Budget Tier (No Budget, Low, Medium or Expensive) and gets Outfits whose Brands fit it. When a tier leaves too few Brands, the query quietly widens one step at a time instead of giving up.

**Blocked by:** [14 Body-photo Outfits: Brands become Pieces](14-body-photo-brands.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Outfit assembly" (Age groups' widen-to column; Budget Tier tags and price guard; Thin pools; Config) and "Pages" (Photo & budget step; Results page header). Stories 74, 75 and 81.

- [x] The Photo & budget step shows the four Budget Tier buttons for a Full-Body or Body-Only Photo, with No Budget selected by default and a note that it can be changed later. A Face Photo shows no picker, and its Consultation has no Budget Tier.
- [x] The chosen tier is stored as the Consultation's current Budget Tier and shown in the results header.
- [x] A rejected photo returns to the photo step with the Budget Tier kept, as well as the photo.
- [x] Brand queries apply the tier's required and excluded `target_income_level` tags, and usable Brands must pass its price guard, exactly as the spec's Budget Tier table sets out: Low (max ≤ $300), Medium (min ≤ $150), Expensive (min ≥ $100); No Budget adds no tags and no guard.
- [x] Fewer than 10 usable Brands widen quietly, one step at a time:
  1. the next age group, per the age-group table's widen-to column;
  2. drop the `key_market` tag but keep the location signal;
  3. a popularity floor of 0.95;
  4. drop the age tag.
- [x] The module returns these as an ordered list of query variants. The caller tries them in order, within one Brand fetch, until one gives at least 10 usable Brands or the list ends.
- [x] The popularity floors and the widening order live in config.
- [x] Pure tests cover the query parameters for each Budget Tier, the price guard, and the widening order.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The module.** `src/server/outfit-assembly/brands.ts` now has `brandQueries(search, styleIcon)` in place of `brandQuery`: the ordered list of query variants, never empty, the query itself first. `BrandSearch` gains `budgetTier`, and `usableBrands`, `pickBrands` and `planOutfitBrands` take the Budget Tier too, since the price guard is part of what makes a Brand usable. `isThinPool(brands, line, budgetTier)` says whether a Brand call's Brands leave fewer than 10 usable, and `fullestPool(tried, line, budgetTier)` picks which of the calls tried to build on.
  - **Budget Tier tags.** Each tier's required tags join `filter.tags` (so Medium needs both `medium` and `medium_to_high`, as the research meant), and its excluded tags go in `filter.exclude.tags`. No Budget sends neither, so its query, and its cache key, are exactly as before.
  - **The price guard** reads one end of the Brand's range: Low its maximum (≤ $300), Medium and Expensive its minimum (≤ $150, ≥ $100). A Brand without that price fails the guard, so every Brand in a tiered Outfit shows a price. Under No Budget nothing is guarded.
  - **Widening is cumulative:** each wider query keeps the steps before it. A step that would change nothing is skipped: the next age group for 30–34 and 35–44 (they have no widen-to), and dropping `key_market` for the 17 Countries without one. So a query list has 3 to 5 variants. Every variant keeps the tier's tags, the age and gender signals and the location query.
  - **"Usable"** for the threshold means after the Style Preference rule (for the Style Icon's line), the apparel and footwear filter, both denylists and the price guard. De-duplication isn't counted: the pool is per Style Icon, before any Outfit is planned.
- **Config.** `src/config/qloo.ts` holds `BUDGET_TIER_BRAND_FILTERS` (each tier's required and excluded `target_income_level` tags and its price guard), `BRAND_TARGET_AGE_GROUPS` (now each age group's `tag` and `widenTo`, the spec's widen-to column), `BRAND_WIDENED_POPULARITY_FLOOR` (0.95) beside `BRAND_POPULARITY_FLOOR`, `THIN_POOL_USABLE_BRANDS` (10) and `BRAND_WIDENING_STEPS`, the order. `BUDGET_TIER_LABELS` is in `src/config/consultations.ts`.
- **The fetch.** The `fetchBrands` step tries the variants in order, within the one step, until one gives at least 10 usable Brands. When none does, it builds on the query that gave the most usable Brands, the narrower one on a tie: the widest query isn't always the fullest, since each call is one page of 50 that watches and retailers can crowd, and it's the least age-appropriate. Before each wider query it checks the Styling is still running, so a cancelled one stops spending Qloo's calls. Widening calls don't count towards `MAX_BRAND_FETCHES_PER_STYLING`, and they run one after another, so a Styling still has at most 3 Qloo calls in flight.
- **Which tier.** Brand queries and the price guard use the Styling's target Budget Tier (`styling.budget_tier`), not the Consultation's. **For ticket 28:** a Budget Tier change only has to create its Styling with the new tier; its Brand calls and picks follow it, and the Consultation's tier switches on success.
- **"Get my Outfits"** takes an optional `budgetTier`. A body photo sent without one gets No Budget; a Face Photo stores none, even if one is sent. `hasBudgetTier(photoType)` in `src/config/consultations.ts` (a Photo Type whose Outfits are built on Brands) decides this for the operation, the form and the picker. The server action reads the tier from the form's `budgetTier` field, and an unknown value is refused like an unusable file, which only a tampered form can reach.
- **The page.** The Photo & budget step shows a "Budget Tier" radio group of four buttons for a Full-Body or Body-Only Photo, No Budget first and selected, with "You can change this later, on your Outfits." The tier lives in the wizard's state with the photo, so Back, the Face Photo detour and a rejected photo all keep it. The results header reads "Full-Body Photo · <date> · Budget Tier: Low"; a Face Photo's has no Budget Tier part. **For ticket 28:** that "· Budget Tier: …" text is what the dropdown replaces. `ConsultationView.budgetTier` carries it.
- **Tests.** Pure tests in `brands.test.ts` cover each tier's tags, the No Budget query, the price guard at each tier (both sides of each bound, and missing prices), the widening order, every age group's widen-to, the skipped steps, the thin-pool count and which pool to build on. Server-operation tests cover storing the tier (and none for a Face Photo), the header, a Styling querying and picking at its tier, widening within one fetch, building on the fullest query when all are thin, and stopping when the Styling stops. The stylings tests' shared Brand fixture grew to 10 Brands so it isn't a thin pool.
- **Checked in the browser.** On local development with the fake AI and live Qloo (no-preference, United Kingdom, 35–44): the picker at desktop and phone widths, No Budget by default, Low kept across Back and a Face Photo detour, no picker for a Face Photo, and the photo and Expensive kept after a failed send. A Low and a Medium Full-Body Consultation built two Outfits each, all within the tier's guard, with the tier in the header and no console or server errors.
  - **For the team:** with the UK `key_market` tag, the Low and Medium calls returned only 16 and 17 Brands for each Style Icon, and the menswear Style Icon's widened by dropping the market tag (to 27 and 46). Tiered Consultations will widen often, and more so in smaller markets.
  - **For the team:** on that dev server, the `fake_ai_scenario` cookie didn't change the photo check, so the rejected-photo path was checked with a failed send, which comes back to the photo step the same way. The Playwright smoke test that uses the cookie passes on its own server. The likely cause is `aiForBrowser`'s `instanceof FakeAiProvider` failing when another route's bundle created the shared services first.
- **Live calls used:** 8 Brand calls on 2026-10-17 in the browser check; the person calls came from the cache. The Playwright run made a few more.
