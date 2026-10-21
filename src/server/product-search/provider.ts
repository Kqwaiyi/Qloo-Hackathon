import type { Line } from "@/config/accounts";
import type { ProductCategory } from "@/config/consultations";
import type { ProductSearchMarket } from "@/config/product-search";

// Our own product-search interface (spec: "Product search interface", ADR-0008). The domain depends
// only on this, never on Channel3. What it may receive is limited by its types, as Qloo's is: a
// Brand's name and official site, the provider's own Brand and Product IDs, a Category, a line, a
// market and a price range. Never a user ID, username, email, photo, Style Icon, or anything that
// links two calls to one user.

/** A Qloo Brand to find in the product search. */
export interface BrandLookup {
  /** The Brand's name, as Qloo has it. */
  name: string;
  /** Qloo's official site for the Brand, when it has one, which tells apart several Brands with its name. */
  officialSite: string | null;
}

/** The product search's own ID for a Brand, or that it doesn't know the Brand. */
export type BrandLookupResult = { found: true; brandId: string } | { found: false };

/** Inclusive bounds on a price, in the market's currency. */
export interface PriceRange {
  min: number;
  max: number;
}

/** One search: a Brand's Products in one Category and line, sold new and in stock in the market. */
export interface ProductSearchQuery {
  /** The product search's own ID for the Brand, from `findBrand`. */
  brandId: string;
  category: ProductCategory;
  line: Line;
  market: ProductSearchMarket;
  /** The Brand's price range in the market's currency, or null for no price filter. */
  priceRange: PriceRange | null;
}

/** A check on a Product found earlier, in the market it was found in. */
export interface ProductCheck {
  productId: string;
  market: ProductSearchMarket;
}

/** What a Product's offers are now, or that it's gone: no offer for it in the market any more. */
export type ProductCheckResult = { gone: true } | { gone: false; offers: ProductOffer[] };

/** What a Product photo shows: the garment alone (hero, flat-lay), on a model, in a scene, or something else. */
export type ProductShotType = "hero" | "flat_lay" | "on_model" | "lifestyle" | "other";

export interface ProductImage {
  url: string;
  /** The same photo with its background removed, when the product search has one. */
  backgroundRemovedUrl: string | null;
  /** Null when the product search doesn't say. */
  shotType: ProductShotType | null;
}

/** One shop's offer of a Product. */
export interface ProductOffer {
  /** The Product's page at the shop. */
  url: string;
  /** The shop's domain, such as `nike.com`. */
  shopDomain: string;
  /** The current price, in `currency`. */
  price: number;
  /** An ISO 4217 code, such as `USD`. */
  currency: string;
  availability: "in_stock" | "out_of_stock";
  /** Null when the shop doesn't say. */
  condition: "new" | "used" | null;
}

/** A Product a search found, with what tailoring and its Piece may need. */
export interface CandidateProduct {
  id: string;
  /** The Product's name, as its seller gives it. */
  title: string;
  description: string | null;
  /** Its colours, as hex codes, the most prominent first. */
  colours: string[];
  /** The line it's made for, or null when it's unisex or the product search doesn't say. */
  line: Line | null;
  /** The product search's IDs for its Brands. */
  brandIds: string[];
  images: ProductImage[];
  offers: ProductOffer[];
}

/** The product search answered "too many requests". The caller retries after a back-off. */
export class ProductSearchRateLimitedError extends Error {
  constructor(
    /** How long the product search asked the caller to wait, when it said. */
    readonly retryAfterSeconds: number | undefined,
  ) {
    super("The product search answered 429: too many requests.");
    this.name = "ProductSearchRateLimitedError";
  }
}

/**
 * A product-search call that failed in a way asking again can't change: a refused API key. Every
 * other error it throws is worth retrying.
 */
export class UnretryableProductSearchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UnretryableProductSearchError";
  }
}

export interface ProductSearch {
  /** The product search's ID for a Qloo Brand, matched by exact name, or "not found". */
  findBrand(lookup: BrandLookup): Promise<BrandLookupResult>;
  /** Candidate Products for one Piece, in the product search's order. It never pages. */
  searchProducts(query: ProductSearchQuery): Promise<CandidateProduct[]>;
  /** A Product's current offers in the market it was found in, or "gone" when it has none there. */
  checkProduct(check: ProductCheck): Promise<ProductCheckResult>;
}
