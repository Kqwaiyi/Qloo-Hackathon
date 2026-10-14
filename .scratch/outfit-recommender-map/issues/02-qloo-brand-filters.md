# How do Qloo filters turn Brands into Pieces?

Type: research
Status: resolved
Map: [Outfit Recommender](../map.md)

## Question

For one Outfit we need a Top Brand, a Bottom Brand and a Shoes Brand that respect the user's age, Style Preference and Budget Tier and are "currently popular". What combination of Qloo parameters does that reliably?

1. **Category:** which tags best separate Shoes Brands from clothing Brands, and is there any signal for Top vs Bottom (denim, trousers, skirts, shirts, outerwear)? If not, what's the cleanest split (for example, one apparel Brand supplies both and the AI picks the garment)?
2. **Budget Tier:** propose Low / Medium / Expensive in terms of `target_income_level` tags and/or `price_range_usd_min`/`max`. Check coverage (what share of fashion Brands have these fields) and how many Brands remain per Category per tier.
3. **Age:** map a user's age (13+) to Qloo's age buckets and `target_age_group` tags. Does filtering on `target_age_group` change results meaningfully compared with the age signal alone?
4. **Style Preference:** map menswear / womenswear / no preference to `target_gender` tags and/or the gender signal, and show the effect.
5. **Currently popular:** what do `popularity`, `filter.popularity.min` and `bias.trends` actually do to brand results? Recommend a ranking recipe.
6. **Call budget:** estimate Qloo calls per Consultation against the 10,000/month limit, and what can be cached.

Read-only Qloo calls are allowed. Keep only trimmed examples in the findings, no bulk response dumps.

## Answer

**Recipe for every Brand call:**
- `filter.type=urn:entity:brand`, `operator.filter.tags=intersection`, `take=50`, `filter.popularity.min=0.98`.
- `filter.tags` = the Category tag, `urn:tag:genre:brand:fashion` (drops retailers and media brands), the user's `target_age_group` tag, and optionally `key_market:qloo:united_states` (fixes a strong Brazilian skew).
- Also send `signal.interests.tags` (1–3 `personal_style` tags read from the photo) and `signal.demographics.age`. Leave `bias.trends` unset.

No single call tested every part of the recipe together on every tier.

- **Category:** Shoes use `product_category:qloo:footwear`; clothing uses `product_category:qloo:apparel`. **There is no usable Top vs Bottom signal**, so one clothing Brand call supplies both and the AI picks the garments.
- **Budget Tier** (`target_income_level` tags; all six Category × tier pools returned 50 of 50 matching results):

  | Tier | Required | Excluded |
  |---|---|---|
  | Low | `low_to_medium` | `medium_to_high`, `high` |
  | Medium | `medium`, `medium_to_high` | `low` |
  | Expensive | `high` | `low`, `low_to_medium`, `medium` |

  The tiers don't overlap, and coverage is about 100%. Typical prices: Low up to about $100–120, Medium about $50–300, Expensive about $300–4,000. Price can't be filtered on the server, so the app needs a small price check.
- **Age:** the age signal alone never reorders results; the `target_age_group` filter does. Small pools (Teens × Expensive × Shoes returns only 5) need widening to the neighbouring age group.
- **Style Preference:** a gender tag filter wrongly drops gender-neutral Brands (Supreme, Converse). Use the gender signal plus an app-side rule instead.
- **"Currently popular":** `popularity` is fixed over time and `audience_growth` is always 0. `bias.trends=high` surfaces obscure Brands. Use the popularity floor, which also blocks explicit Brand names that otherwise appear with a style signal.
- **Retailers:** keep a small denylist in the app for multi-brand stores (Farfetch, MR PORTER and similar).
- **Call budget:** about 2.2 calls per Consultation, so about 4,500 Consultations a month. Cache results server-side for a long time. Without style tags there are only 192 distinct queries.

Findings: branch `research/qloo-brand-filters`, file `.scratch/outfit-recommender-map/research/qloo-brand-filters.md`.
