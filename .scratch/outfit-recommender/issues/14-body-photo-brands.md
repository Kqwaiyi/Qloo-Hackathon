# 14: Body-photo Outfits: Brands become Pieces

**What to build:** Full-Body and Body-Only Consultations get complete Outfits. For each Style Icon, Qloo picks the Brands its fans favour, our rules turn them into a Top, a Bottom and Shoes, and the AI tailors each into a concrete Piece. Each row shows the item, its Brand, why it suits, the Brand's price range and a "Visit <Brand>" link, and each card shows the Outfit's total price range. Budget Tiers come in ticket 15; until then every body-photo Consultation is at No Budget.

**Blocked by:** [07 Photo check rejections and the one-tap Photo Type switch](07-photo-check-rejections.md), [11 Hairstyle Pieces tailored to the photo](11-hairstyle-pieces.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Outfit assembly (pure module)" (Brands, the Style Preference rule, Usable Brands, Pieces, De-duplication, Categories by photo, Price range, "Visit <Brand>", Config, denylist seeds), "Stylings" (How many Outfits; Tailoring failures), "Qloo client and cache" (Rate limits) and "AI provider interface" (2. Tailor: In, Rules). Stories 83, 92 (the price range), 93, 96 and 109. [ADR-0001](../../../docs/adr/0001-qloo-selects-ai-concretizes.md), [ADR-0002](../../../docs/adr/0002-photo-style-steers-style-icons.md).

- [ ] Body-photo Stylings gain a Brands stage: one merged Brand call per Style Icon, built by the assembly module with `filter.type=urn:entity:brand`; `signal.interests.entities=<Style Icon>`; `signal.demographics.age`, and `signal.demographics.gender` from the Outfit's line; `signal.location.query=<Country>`; `operator.filter.tags=intersection`, with `filter.tags` = `genre:brand:fashion`, the age group's `target_age_group` tag and `key_market:qloo:<Country>` when Qloo has one for that Country; `filter.popularity.min=0.98`; and `take=50`. The Photo Style is never sent on Brand calls.
- [ ] Queries use the Style Preference, Country and age group stored on the Consultation. A no-preference user's Brand calls and tailoring use the line of the Outfit's Style Icon.
- [ ] Each Country in config gains its `key_market` tag where Qloo has one.
- [ ] The first Styling fetches Brands for the first 3 Style Icons in parallel and later ones as needed, for at most 6 Style Icons per Styling, with at most 3 Qloo calls in flight at once.
- [ ] The Style Preference rule, applied to `target_gender`: menswear keeps a Brand that includes Male or doesn't include Female; womenswear keeps a Brand that includes Female or doesn't include Male.
- [ ] Usable Brands are only those tagged apparel, or footwear/shoes/sneakers, which drops watches, jewellery, eyewear and lingerie. Then the retailer and off-category denylists apply. Both live in config, match by entity ID with the name kept for readability, and are seeded from the spec.
- [ ] Pieces are picked in this order: Shoes, the highest-affinity unused footwear Brand; Top, the highest-affinity unused apparel Brand; Bottom, the next apparel Brand, preferring a denim Brand in the raw top 10, which may be the Top's Brand. Shoes never share a Brand with the Top or Bottom of the same Outfit. A Style Icon that can't complete an Outfit is skipped.
- [ ] No Brand repeats within a Category across the Outfits a Styling builds. Each Outfit stores its Brand picks separately from its Pieces.
- [ ] Categories by photo: a Full-Body Photo gets Hairstyle, Top, Bottom and Shoes, with no Hairstyle when the hair is covered; a Body-Only Photo gets Top, Bottom and Shoes.
- [ ] Tailoring now also receives each Brand Piece's Brand, Qloo category tags and price range. Its rules: items are generic, never product or model names; never a price; only an item the Brand plausibly makes; the Top is one garment, the main visible upper layer. The fake adapter builds generic Top, Bottom and Shoes items.
- [ ] A substitute after failed tailoring fetches Brands for the next Style Icon when it needs to.
- [ ] Brand Pieces store the Brand's entity ID, name, official site and price minimum and maximum.
- [ ] Each Brand row shows its Category, the item, its Brand, why it suits, its price range (`price_range_usd_min`–`max`) and a "Visit <Brand>" link to the Brand's `official_site` when that's an https URL; otherwise the row has no link. The card shows the Outfit's range: the sums of its Brand Pieces' minimums and maximums, leaving out any Piece with no price data.
- [ ] Pure tests cover the Brand query for each body Photo Type, age group, Country with and without a `key_market` tag, and Style Preference; the Style Preference rule; the apparel and footwear filter; both denylists; the pick order, the denim preference and Shoes never sharing a Brand with the Top or Bottom; de-duplication across a Styling's Outfits; skipping a Style Icon that can't complete an Outfit; price-range sums; and the `official_site` link rule.
- [ ] A server-operation test covers covered hair dropping the Hairstyle from a Full-Body Photo's Outfits.
