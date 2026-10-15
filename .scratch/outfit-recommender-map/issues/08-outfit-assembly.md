# How does Qloo build and rank Outfits?

Type: grilling
Status: resolved
Blocked by: 01, 02
Map: [Outfit Recommender](../map.md)

## Question

What exact recipe turns a user (age, Style Preference), a Photo Type and a Budget Tier into ranked Outfits?

- Which Style Icons, and in what order?
- Which Brand supplies each Piece, and how are Top and Bottom told apart?
- How Budget Tier applies, including mixing tiers under No Budget.
- What "top 2" and "see more" mean, and when we run out.
- When to fall back to Outfits themed on a shared style tag.
- Which Qloo calls are cached, and for how long.
- How the two research recipes combine. The Style Icon recipe passes the Style Icon as `signal.interests.entities`. The brand-filter recipe uses a popularity floor, `genre:brand:fashion`, `target_age_group`, a US market tag, and `personal_style` tags the AI reads from the photo. Does having the AI read style tags from the photo fit ADR-0001 (Qloo decides), or does it make the AI a co-decider?
- How Outfits stay distinct when similar Style Icons share most of their Brands.

## Answer

Resolved with the user on 2026-10-15, backed by about 110 more read-only Qloo calls (findings: branch `research/outfit-assembly`, file `.scratch/outfit-recommender-map/research/outfit-assembly.md`). The photo now steers which Style Icons Qloo picks, through a Photo Style ([ADR-0002](../../../docs/adr/0002-photo-style-steers-style-icons.md)). Brands still come only from each Style Icon.

**Inputs.** Outfits depend on the user's age, Style Preference and Country, plus the Consultation's Photo Type, Budget Tier and Photo Style. **Country is a new sign-up field:** required, pre-filled from the browser's locale, editable in settings like Style Preference, and only new Consultations use a changed value.

**1. Photo Style.**
- The photo check also reads 1–2 words from a fixed list of about 12 Qloo `personal_style` values: edgy, classic, sporty, rugged, glamorous, bohemian, minimalist, preppy, streetwear, chic, casual, elegant. The final list and prompt belong to "What do we ask the AI model at each step?".
- It's read for every Photo Type.
- It's shown on the results header next to the Budget Tier, and the user can change it by picking 1–2 words from the same list.
- Edgy and classic change the Style Icons sharply; bohemian and glamorous barely do. Two words blend well.

**2. Style Icons: one person call per Consultation** (two for no-preference users).
- Query:
  - `filter.type=urn:entity:person`, with `filter.tags` = the occupation union (model, fashion_model, singer, rapper, actor, athlete, influencer);
  - `filter.gender` from the Style Preference;
  - `signal.demographics.age` and `signal.demographics.gender`;
  - `signal.location.query=<Country>`;
  - `signal.interests.tags` = the Photo Style's `personal_style` tags;
  - `filter.popularity.min=0.995` (without it the names turn obscure);
  - `take=50`.
- `filter.exclude.tags`: politician, stand_up_comedian and astronomer, plus the `genre:person` comedian, academic, journalist and youtuber tags. This narrow set removes real comedians. The broad set also dropped Nicki Minaj, Tom Hanks and Shaq.
- In the app:
  - Drop anyone with `date_of_death`, and anyone on a short, hand-kept denylist in config:
    - deceased people missing a death date (Liam Payne);
    - adult-film backgrounds;
    - political figures;
    - non-fashion people;
    - people with serious legal or hate-speech controversies.
  - Never show Qloo's person descriptions; one was vandalised text.
- **Order:** Qloo's affinity order. Alternating occupations was tested and dropped: it didn't reduce Brand overlap between Outfits.
- **No preference:** interleave the womenswear and menswear lists (W1, M1, W2, M2…).
- **Country means taste:** people popular there, wherever they're from (K-pop in Japan, US stars in Germany). There is no citizenship filter.
- One page of 50 is enough, because exclusions backfill from Qloo.

**3. Brands: one merged call per Style Icon,** for Full-Body and Body-Only Photos only.
- Query:
  - `filter.type=urn:entity:brand`;
  - `signal.interests.entities=<Style Icon>`;
  - `signal.demographics.age` and `signal.demographics.gender`;
  - `signal.location.query=<Country>`;
  - `operator.filter.tags=intersection`, with `filter.tags` = `genre:brand:fashion`, `target_age_group:qloo:<group>`, `key_market:qloo:<Country>` and the Budget Tier's required tags;
  - `filter.exclude.tags` = the tier's excluded tags;
  - `filter.popularity.min=0.98`;
  - `take=50`.
- The tier and age-group tables are the ones in "How do Qloo filters turn Brands into Pieces?". No Budget sends no tier tags. The Photo Style is never sent on Brand calls.
- Every tested response came back in affinity order in about 3 s.
- In the app:
  - Apply the Style Preference rule.
  - Keep only Brands tagged apparel or footwear/shoes/sneakers. This drops the watches that fill older men's Expensive results, and jewellery, eyewear and lingerie.
  - Apply the retailer denylist, extended with Selfridges, Lojas Renner and Zattini.
  - Apply an off-category denylist (merch shops, shapewear, bridal labels, flip-flop Brands).
  - Apply the price guard.
- **Pieces:**
  - Shoes are the highest-affinity unused footwear Brand.
  - The Top is the highest-affinity unused apparel Brand.
  - The Bottom is the next apparel Brand, preferring a denim Brand in the top 10. It may be the Top's Brand.
- **Distinct Outfits:** no Brand repeats within a Category across the Consultation's current Outfits. This built 8 of 8 Outfits in every tested pool, and 7 of 8 for older men on Low. With no de-duplication, Outfits came out identical. A Style Icon that can't complete an Outfit is skipped.
- **Thin pools** (fewer than 10 usable Brands) widen quietly in this order: next age group, then drop the market tag but keep the location signal, then floor 0.95, then drop the age tag. With the market tag, a UK call returned 50 Brands and an India call 4.

**4. Face Photo.** There's no Budget Tier (the picker is hidden on the upload step and the results) and no Brand calls. Each Outfit is the next Style Icon's Hairstyle.

**5. Top 2 and "see more".**
- Styling fetches Brands for the first 3 Style Icons in parallel. Each "Show 2 more Outfits" fetches the next batch.
- The button disappears when no eligible Style Icon remains.
- **The themed fallback is dropped:** a themed Outfit has no Style Icon, so it can't have a Hairstyle.

**6. Re-runs.** Both re-runs send the user back to the Styling checklist with the photo check ticked, and both replace the Outfits.
- A **Budget Tier change** keeps the Style Icons and fetches their Brands again from the top.
- A **Photo Style change** re-picks the Style Icons.

**7. Caching.** Every Qloo response is cached server-side, keyed by its exact request and trimmed to the fields used, for 30 days, with no pre-warming. An uncached Consultation costs about 4–5 Qloo calls (1–2 person, 3 Brand), so roughly 2,000 Consultations a month fit the 10,000-call quota before cache hits and "see more".

**Corrections to earlier findings.**
- Brand results *can* be localised: `signal.location.query` re-ranks them, and Brands carry `key_market` tags for 39 countries.
- People can be localised with the same signal.
- Without a location signal and exclusions, the raw person pool is weak: only 3 of the top 8 older men were fashion-relevant.
