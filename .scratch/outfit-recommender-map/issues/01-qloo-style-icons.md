# Can Style Icons drive whole Outfits in Qloo?

Type: research
Status: resolved
Map: [Outfit Recommender](../map.md)

## Question

Every Outfit is meant to be inspired by one Style Icon: their signature haircut becomes the Hairstyle Piece and Qloo's taste links from that person pick the Brands for the other Pieces. Can the Qloo hackathon API actually support this?

1. Can `urn:entity:person` results be filtered or ranked by `signal.demographics.age` and `signal.demographics.gender` (or by tags) so the top people are plausibly fashion-relevant for that demographic (musicians, actors, athletes, models, not politicians or authors)? Which tags or properties mark that relevance? Do person entities carry an image and short description usable in the UI?
2. With a person passed as `signal.interests.entities`, does `/v2/insights?filter.type=urn:entity:brand` return fashion Brands that plausibly fit that person? Can it be combined with filters for product category (apparel, footwear, denim), `target_income_level`, `target_age_group` and `target_gender`?
3. How many Qloo calls does one Outfit cost, how long do they take, and can several Outfits share calls?
4. Fallback: if (1) or (2) falls short, which Qloo fashion style tags (`fashion_segment`, `personal_style`, others) could serve as an Outfit theme instead, and how many Brands sit under each?

Read-only Qloo calls are allowed. Keep only trimmed examples in the findings, no bulk response dumps.

## Answer

**Viable with caveats.** Qloo returns fashion-relevant people for a demographic. Passing one of them as `signal.interests.entities` returns Brands that fit them (Snoop Dogg plus apparel gives Timberland, Air Jordan, Nike, Puma). The product-category, income-level, target-age-group and target-gender filters each changed results in tests.

**Recipe:**
1. **Pick Style Icons (cached).** Make one person call per age bucket × Style Preference (18 combinations): `filter.type=urn:entity:person`, `filter.tags` = an occupation union (model, fashion_model, singer, rapper, actor, athlete, influencer), `filter.exclude.tags` for politician, `filter.gender`, both demographic signals, `take=50`. Then in the app: drop people with `date_of_death`, re-sort by `query.affinity`, and spread picks across occupation groups.
2. **One Brand call per Outfit, run in parallel.** Pass the Style Icon plus demographics, `filter.tags` = apparel, denim, footwear and shoes, and `filter.exclude.tags` for the Budget Tier (Low excludes `high` and `medium_to_high`; Expensive excludes `low`, `low_to_medium` and `medium`; Medium excluding `low` and `high` is untested). Use `take=10–20`. Then in the app: filter by gender tag. Shoes come from footwear/shoes/sneakers, Bottom from denim (else apparel), Top from apparel. Skip Brands another Outfit already used.

**Caveats:**
- **Demographics score people but don't rank them.** Results come back in popularity order and only `query.affinity` changes, so the app must re-sort. A demographics-only person query returns a 400 error.
- **Similar Style Icons give near-identical Brands.** Zendaya, Gigi Hadid and Billie Eilish share 9 of their top 10 Brands in Expensive; Zendaya vs Snoop Dogg shares 1. Outfits need diverse Style Icons and Brand de-duplication.
- **One call can't serve several Style Icons**, because explainability doesn't split Brands per person.
- **Latency:** about 2 s at `take=10`; median 5.6 s and up to 12.8 s at `take=50`. Repeating a request wasn't faster, so cache on our side.
- **Data gaps:** no top/bottom categories; denim Brands are sparse; "apparel" includes merch and headwear shops. Qloo has no hair data, but people do have an image URL and a short description.
- **Fallback is solid:** `fashion_segment` has about 19 fixed values with deep Brand pools (streetwear about 700, casual_wear over 1,550). The Tags API doesn't index them.

Findings: branch `research/qloo-style-icons`, file `.scratch/outfit-recommender-map/research/qloo-style-icons.md`.
