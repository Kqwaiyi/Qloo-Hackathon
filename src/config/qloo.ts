// Qloo rules. Every number and word list lives here so it can change without hunting through code.

import type { AgeGroup, BudgetTier } from "./consultations";

/**
 * Every Qloo response is cached for this long, so a repeat request costs nothing. Qloo's data isn't
 * time-based on the hackathon host, and the daily sweep purges older entries.
 */
export const QLOO_CACHE_LIFETIME_DAYS = 30;

/**
 * The Brand tag types the cache keeps, because the rules read them: product categories (apparel,
 * footwear, denim…) and Qloo's fashion genres (jeans…). A rule that reads another type adds it
 * here, with a migration that empties `qloo_cache`, since older entries were trimmed without it.
 * The same goes for any other field added to the trimming.
 */
export const QLOO_BRAND_TAG_TYPES_KEPT: readonly string[] = ["urn:tag:product_category:qloo", "urn:tag:genre:brand"];

/** A Styling retries each Qloo call this many times, backing off longer each time on "too many requests". */
export const QLOO_STEP_MAX_RETRIES = 5;

// The Style Icon query: well-known people, popular with the user's age group and Country and in
// tune with the Photo Style.

/** A Style Icon has at least one of these occupations. */
export const STYLE_ICON_OCCUPATION_TAGS = [
  "urn:tag:occupation:person:model",
  "urn:tag:occupation:person:fashion_model",
  "urn:tag:occupation:person:singer",
  "urn:tag:occupation:person:rapper",
  "urn:tag:occupation:person:actor",
  "urn:tag:occupation:person:athlete",
  "urn:tag:occupation:person:influencer",
] as const;

/**
 * Nobody with any of these is a Style Icon: the occupations, and Qloo's `genre:person` tags for
 * people whose fame isn't their look. Anyone these miss goes on the Style Icon denylist instead.
 */
export const STYLE_ICON_EXCLUDED_TAGS = [
  "urn:tag:occupation:person:politician",
  "urn:tag:occupation:person:stand_up_comedian",
  "urn:tag:occupation:person:astronomer",
  "urn:tag:genre:person:comedian",
  "urn:tag:genre:person:academic",
  "urn:tag:genre:person:journalist",
  "urn:tag:genre:person:youtuber",
] as const;

/** Without a floor this high, the Photo Style swaps stars for little-known names. */
export const STYLE_ICON_POPULARITY_FLOOR = 0.995;

/** One page is enough: the exclusions backfill from Qloo, and a Styling uses at most 6 Style Icons. */
export const STYLE_ICONS_PER_CALL = 50;

// The Brand query: one call per Style Icon, for the Brands their fans favour, popular with the
// user's age group and Country. Every tag in `filter.tags` must match (intersection).

/**
 * On every fashion Brand. It also drops stores and media brands tagged only as retail or media,
 * though they carry fashion product tags. Multi-brand stores tagged fashion as well are on the
 * retailer denylist.
 */
export const BRAND_FASHION_TAG = "urn:tag:genre:brand:fashion";

type TargetAgeGroupTag = `urn:tag:target_age_group:qloo:${string}`;

/**
 * The `target_age_group` tag each age group's Brands must carry, and the next age group's that a
 * thin pool widens to, if any. Qloo publishes no ages for them, so the mapping is ours. The age
 * signal alone never reorders Brands: this filter is what makes them age-appropriate.
 */
export const BRAND_TARGET_AGE_GROUPS: Record<AgeGroup, { tag: TargetAgeGroupTag; widenTo: TargetAgeGroupTag | null }> = {
  "18_24": { tag: "urn:tag:target_age_group:qloo:young_adults", widenTo: "urn:tag:target_age_group:qloo:adults" },
  "25_29": { tag: "urn:tag:target_age_group:qloo:young_adults", widenTo: "urn:tag:target_age_group:qloo:adults" },
  "30_34": { tag: "urn:tag:target_age_group:qloo:adults", widenTo: null },
  "35_44": { tag: "urn:tag:target_age_group:qloo:adults", widenTo: null },
  "45_54": { tag: "urn:tag:target_age_group:qloo:middle_aged", widenTo: "urn:tag:target_age_group:qloo:adults" },
  "55_64": { tag: "urn:tag:target_age_group:qloo:middle_aged", widenTo: "urn:tag:target_age_group:qloo:adults" },
  "65_plus": { tag: "urn:tag:target_age_group:qloo:seniors", widenTo: "urn:tag:target_age_group:qloo:middle_aged" },
};

/** Lower than the Style Icons' floor: Brands sit very high on popularity, and this keeps currently popular ones. */
export const BRAND_POPULARITY_FLOOR = 0.98;

/** The floor a thin pool widens to. Fashion Brands at 0.95 are still among the top thousand or so. */
export const BRAND_WIDENED_POPULARITY_FLOOR = 0.95;

// Thin pools: a Brand call whose Brands leave too few usable ones widens quietly, one step at a
// time, all within one Brand fetch, until a query gives enough or none is left to try.

/** A Brand call with fewer usable Brands than this is a thin pool. */
export const THIN_POOL_USABLE_BRANDS = 10;

/**
 * How a thin pool's Brand query widens, in order, each step on top of the ones before: the next age
 * group, then no `key_market` tag (the location signal stays), then the lower popularity floor, then
 * no age tag. A step that would change nothing, such as the next age group for one with none, is
 * skipped.
 */
export const BRAND_WIDENING_STEPS = ["next_age_group", "drop_key_market", "lower_popularity_floor", "drop_age_tag"] as const;
export type BrandWideningStep = (typeof BRAND_WIDENING_STEPS)[number];

// The Budget Tiers. Qloo's `target_income_level` tags describe a Brand's customers' income, which
// tracks its prices; the price guard catches the Brands whose prices don't.

type IncomeLevelTag = `urn:tag:target_income_level:qloo:${string}`;

/** A Brand's `price_range_usd_min` or `_max` must be at most, or at least, `usd`. A Brand without that price fails. */
export interface BrandPriceGuard {
  end: "min" | "max";
  bound: "at_most" | "at_least";
  usd: number;
}

export interface BudgetTierBrandFilter {
  /** The Brand must carry every one of these, as every tag in `filter.tags` must match. */
  required: readonly IncomeLevelTag[];
  /** The Brand must carry none of these. */
  excluded: readonly IncomeLevelTag[];
  /** Its prices must pass this to be usable, or there's no guard. */
  priceGuard: BrandPriceGuard | null;
}

/**
 * Each Budget Tier's income levels and price guard. The tiers don't overlap. Medium requires both
 * `medium` and `medium_to_high`, so Brands spanning to High, such as Nike and Ralph Lauren, are
 * Medium. No Budget filters nothing, so one Outfit may mix tiers.
 */
export const BUDGET_TIER_BRAND_FILTERS: Record<BudgetTier, BudgetTierBrandFilter> = {
  no_budget: { required: [], excluded: [], priceGuard: null },
  low: {
    required: ["urn:tag:target_income_level:qloo:low_to_medium"],
    excluded: ["urn:tag:target_income_level:qloo:medium_to_high", "urn:tag:target_income_level:qloo:high"],
    priceGuard: { end: "max", bound: "at_most", usd: 300 },
  },
  medium: {
    required: ["urn:tag:target_income_level:qloo:medium", "urn:tag:target_income_level:qloo:medium_to_high"],
    excluded: ["urn:tag:target_income_level:qloo:low"],
    priceGuard: { end: "min", bound: "at_most", usd: 150 },
  },
  expensive: {
    required: ["urn:tag:target_income_level:qloo:high"],
    excluded: ["urn:tag:target_income_level:qloo:low", "urn:tag:target_income_level:qloo:low_to_medium", "urn:tag:target_income_level:qloo:medium"],
    priceGuard: { end: "min", bound: "at_least", usd: 100 },
  },
};

/** One page is enough to pick an Outfit's Top, Bottom and Shoes, with room for the filters and de-duplication. */
export const BRANDS_PER_CALL = 50;

// What a Brand makes, by its tags. Qloo's product categories are free text, so Shoes go by three.

/** The start of every Qloo product category tag, such as `urn:tag:product_category:qloo:denim`. */
export const BRAND_PRODUCT_CATEGORY_TAG = "urn:tag:product_category:qloo:";

/** A Brand with this tag can be a Top or a Bottom. */
export const BRAND_APPAREL_TAGS = ["urn:tag:product_category:qloo:apparel"] as const;

/** A Brand with any of these tags can be the Shoes. */
export const BRAND_FOOTWEAR_TAGS = [
  "urn:tag:product_category:qloo:footwear",
  "urn:tag:product_category:qloo:shoes",
  "urn:tag:product_category:qloo:sneakers",
] as const;

/** A Brand with either of these tags makes denim: the one Bottom signal Qloo has. */
export const BRAND_DENIM_TAGS = ["urn:tag:product_category:qloo:denim", "urn:tag:genre:brand:fashion:jeans"] as const;

/** The Bottom prefers a denim Brand ranked this high or higher in its Brand call, before any filter. */
export const BOTTOM_DENIM_RANK = 10;
