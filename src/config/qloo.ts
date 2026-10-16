// Qloo rules. Every number and word list lives here so it can change without hunting through code.

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
