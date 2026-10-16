// Qloo rules. Every number and word list lives here so it can change without hunting through code.

import type { AgeGroup } from "./consultations";

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

/**
 * The `target_age_group` tag each age group's Brands must carry. Qloo publishes no ages for them,
 * so the mapping is ours. The age signal alone never reorders Brands: this filter is what makes
 * them age-appropriate.
 */
export const BRAND_TARGET_AGE_GROUPS: Record<AgeGroup, `urn:tag:target_age_group:qloo:${string}`> = {
  "18_24": "urn:tag:target_age_group:qloo:young_adults",
  "25_29": "urn:tag:target_age_group:qloo:young_adults",
  "30_34": "urn:tag:target_age_group:qloo:adults",
  "35_44": "urn:tag:target_age_group:qloo:adults",
  "45_54": "urn:tag:target_age_group:qloo:middle_aged",
  "55_64": "urn:tag:target_age_group:qloo:middle_aged",
  "65_plus": "urn:tag:target_age_group:qloo:seniors",
};

/** Lower than the Style Icons' floor: Brands sit very high on popularity, and this keeps currently popular ones. */
export const BRAND_POPULARITY_FLOOR = 0.98;

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
