# 02: Only Brands the product search knows are used

**What to build:** A body-photo Styling never builds an Outfit on a Brand the product search doesn't know. As Brands are picked, in Qloo's order, each one a pick is about to use is looked up in the product search, and an unknown one is passed over like a retailer on the denylist. Outfits still have AI-described items after this ticket; what changes is which Brands they're built on.

**Blocked by:** 01

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Brand matching" (cache and lazy lookups), "Usable Brands and picks (Outfit assembly)" (the first point), and "Data model" (Brand matches). Stories 38 and 65.

- [ ] A Brand is usable only if it passes today's rules (the line rule, apparel or footwear, the denylists, the Budget Tier's price guard) and the product search knows it.
- [ ] Matches are looked up lazily, only for Brands a pick is about to use, in Qloo's order, through the same plan-then-fetch loop that fetches each Style Icon's Brands. The plan can now ask for Brand lookups as well as Brand fetches. Each lookup is its own Workflow step, at most 3 product calls at once.
- [ ] Each Qloo Brand's result, found or not, is saved by its Qloo entity ID and reused for 30 days. A new migration adds the table.
- [ ] A Style Icon whose usable Brands can't complete an Outfit is skipped as today, and the next one takes its place.
- [ ] Face Photo Consultations make no product-search call.
- [ ] Tests at the operation seam, with the fake Channel3 transport: an unknown Brand never picked while a known one below it is; lookups only for Brands a pick needs; the 30-day cache (a lookup within 30 days sends no request, one after it does); a Style Icon skipped when too few of its Brands are known; no product-search request for a Face Photo.
