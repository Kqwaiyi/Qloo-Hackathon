// The product search's settings (spec: "Product search interface", "Channel3 specifics", "Markets").
// Every number and ID list lives here so it can change without hunting through code.

import type { Line } from "./accounts";
import type { BrandCategory } from "./consultations";

/** The countries the product search (Channel3) sells in, each its own market. */
export const PRODUCT_SEARCH_COUNTRY_MARKETS = [
  "US",
  "CA",
  "GB",
  "IE",
  "AU",
  "DE",
  "AT",
  "FR",
  "BE",
  "IT",
  "ES",
  "NL",
  "SE",
  "FI",
  "PT",
  "CZ",
  "GR",
  "RO",
  "CH",
  "PL",
] as const;

/** Every market a search can be made in: the countries' own, and the euro-wide one. */
export const PRODUCT_SEARCH_MARKETS = [...PRODUCT_SEARCH_COUNTRY_MARKETS, "EU"] as const;
export type ProductSearchMarket = (typeof PRODUCT_SEARCH_MARKETS)[number];

/** The market any other Country on the euro searches. */
export const EURO_MARKET: ProductSearchMarket = "EU";

/** The market every other Country searches. */
export const FALLBACK_MARKET: ProductSearchMarket = "US";

/** The currency of each market's prices: the one Channel3 infers from the market's country. */
export const PRODUCT_SEARCH_MARKET_CURRENCIES: Record<ProductSearchMarket, string> = {
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  IE: "EUR",
  AU: "AUD",
  DE: "EUR",
  AT: "EUR",
  FR: "EUR",
  BE: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  SE: "SEK",
  FI: "EUR",
  PT: "EUR",
  CZ: "CZK",
  GR: "EUR",
  RO: "RON",
  CH: "CHF",
  PL: "PLN",
  EU: "EUR",
};

/**
 * Each search asks for this many Products: the most one credit returns, so that enough are left
 * after our own filters. A search never asks for a second page.
 */
export const PRODUCTS_PER_SEARCH = 30;

/** A Piece's search keeps up to this many qualifying Products as its candidates, in the product search's order. */
export const CANDIDATES_PER_PIECE = 8;

/**
 * Whether the product search knows a Qloo Brand, found or not, is kept this long by the Brand's
 * Qloo entity ID, so Stylings don't keep looking up the same Brands.
 */
export const BRAND_MATCH_LIFETIME_DAYS = 30;

/** A Styling retries each product-search call this many times, backing off longer each time on "too many requests". */
export const PRODUCT_SEARCH_STEP_MAX_RETRIES = 5;

/**
 * The price refresh never has more Product checks than this waiting at once, as a Styling has no
 * more product-search calls: Channel3's rate limit is shared by every call the app makes.
 */
export const PRODUCT_CHECKS_AT_ONCE = 3;

// Product photos, which each Preview step fetches from their sellers and never keeps.

/** A Product photo that hasn't fully arrived this long after it was asked for doesn't count. */
export const PRODUCT_PHOTO_TIMEOUT_MS = 5_000;

/**
 * A Product photo bigger than this doesn't count. With the user's photo (2 MB at most) and up to
 * three Product photos, a Preview request stays well within Gemini's 20 MB for images sent inline.
 */
export const PRODUCT_PHOTO_MAX_BYTES = 3 * 1024 * 1024;

/** The kinds of One-Piece (ADR-0003). */
export type OnePieceKind = "dress" | "jumpsuit" | "overalls";

/** The One-Pieces each line may have (ADR-0003): a dress for womenswear, a jumpsuit or overalls for either. */
export const ONE_PIECE_KINDS: Record<Line, readonly OnePieceKind[]> = {
  womenswear: ["dress", "jumpsuit", "overalls"],
  menswear: ["jumpsuit", "overalls"],
};

// Channel3, the product search's first implementation.

/** Channel3's API. */
export const CHANNEL3_API_URL = "https://api.trychannel3.com";

/** How many Brands one free Brand lookup asks for: Channel3's most. Same-name Brands are among the first. */
export const CHANNEL3_BRANDS_PER_LOOKUP = 20;

/**
 * Channel3's category IDs (its category slugs) for our Categories, each taking in its subcategories.
 * Taken from Channel3's free categories endpoint on 2026-10-21. The Top is the main visible upper
 * layer, so it takes in coats and jackets; activewear has its own tops and trousers.
 */
export const CHANNEL3_CATEGORY_IDS: Record<BrandCategory, readonly string[]> = {
  top: ["shirts-tops", "coats-jackets", "activewear-tops", "activewear-sweatshirts-hoodies"],
  bottom: ["pants", "shorts", "skirts", "activewear-pants"],
  shoes: ["shoes"],
};

/** Channel3's category IDs for each kind of One-Piece, from the same endpoint on the same day. */
export const CHANNEL3_ONE_PIECE_CATEGORY_IDS: Record<OnePieceKind, readonly string[]> = {
  dress: ["dresses"],
  jumpsuit: ["jumpsuits-rompers"],
  overalls: ["overalls"],
};
