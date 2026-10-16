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
