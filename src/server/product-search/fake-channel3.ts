import { BRAND_CATEGORIES, type ProductCategory } from "@/config/consultations";
import {
  CHANNEL3_CATEGORY_IDS,
  CHANNEL3_ONE_PIECE_CATEGORY_IDS,
  PRODUCT_SEARCH_MARKET_CURRENCIES,
  type ProductSearchMarket,
} from "@/config/product-search";

import type { Channel3Transport } from "./channel3";
import type { ProductCheck } from "./provider";

/** A request as it left for Channel3, its JSON body parsed. */
export interface RecordedChannel3Request {
  method: string;
  url: URL;
  headers: Headers;
  /** The parsed JSON body, or null for a request without one. */
  body: unknown;
}

/**
 * Channel3 in tests: it answers with small hand-written responses and records every request, so
 * tests can see which requests went out and what they carried. Until a test sets `respond`, it
 * knows no Brand, website or Product, and every search finds nothing.
 */
export class FakeChannel3Transport {
  readonly requests: RecordedChannel3Request[] = [];
  respond: (request: RecordedChannel3Request) => Response = knowsNothing;
  /** Runs while each request waits for its answer, so a test can see which requests are in flight together. */
  duringRequest?: (request: RecordedChannel3Request) => Promise<void>;

  readonly send: Channel3Transport = async (request) => {
    const text = await request.text();
    const recorded = {
      method: request.method,
      url: new URL(request.url),
      headers: new Headers(request.headers),
      body: text ? (JSON.parse(text) as unknown) : null,
    };
    this.requests.push(recorded);
    await this.duringRequest?.(recorded);
    return this.respond(recorded);
  };
}

/** Channel3 knowing nothing: no Brands, websites or Products, and empty searches. */
function knowsNothing({ url }: RecordedChannel3Request): Response {
  if (url.pathname === "/v1/brands/search") return channel3Brands([]);
  if (url.pathname === "/v1/browse") return channel3Products([]);
  return channel3NotFound();
}

/** A search, as Channel3's browse request carries it, read back into our terms. */
export interface Channel3Search {
  /** The Brand searched, by Channel3's ID. */
  brandId: string;
  /** Our Category for the request's category IDs, a One-Piece's for any kind of One-Piece, or null when they're none of ours. */
  category: ProductCategory | null;
  /** Channel3's gender for the line: `male` or `female`. */
  gender: string;
  /** The market, from the request's locale `config`. */
  market: ProductSearchMarket;
  /** The price filter, or null when the request sent none. */
  priceRange: { min: number; max: number } | null;
}

/**
 * Channel3 knowing every Brand but those named in `except`, each under its own name: its Brand
 * lookup lists the one Brand with the name looked up, whose ID is `c3-` and the name in lower case.
 * It sells each Brand what `products` gives for a search: by default a small catalogue of two
 * Products in every Category and line, One-Pieces included, new and in stock in the market, priced in its currency within
 * any price filter. Its Product check answers with what `checks` gives: by default, that it knows
 * no such Product. It knows no website.
 */
export function channel3SellingEveryBrand({
  except = [],
  products = channel3SmallCatalogue,
  checks = channel3NotFound,
}: {
  except?: readonly string[];
  products?: (search: Channel3Search) => readonly object[];
  checks?: (check: ProductCheck) => Response;
} = {}) {
  return (request: RecordedChannel3Request): Response => {
    if (request.url.pathname === "/v1/brands/search") {
      const name = request.url.searchParams.get("query") ?? "";
      return channel3Brands(except.includes(name) ? [] : [channel3Brand(channel3BrandId(name), name)]);
    }
    if (request.url.pathname === "/v1/browse") return channel3Products(products(channel3Search(request)));
    const check = channel3ProductCheck(request);
    if (check) return checks(check);
    return knowsNothing(request);
  };
}

/** The Product check a request makes, read back into our terms, or null when it's no Product check. */
export function channel3ProductCheck({ method, url }: RecordedChannel3Request): ProductCheck | null {
  const [, productId] = /^\/v1\/products\/([^/]+)$/.exec(url.pathname) ?? [];
  if (method !== "GET" || !productId) return null;
  return { productId: decodeURIComponent(productId), market: url.searchParams.get("country") as ProductSearchMarket };
}

/** Channel3's ID for a Brand of this name, as `channel3SellingEveryBrand` knows it. */
export function channel3BrandId(name: string): string {
  return `c3-${encodeURIComponent(name.toLowerCase())}`;
}

/** The search a browse request makes. */
export function channel3Search({ body }: RecordedChannel3Request): Channel3Search {
  const { filters, config } = body as {
    filters: { brand_ids: string[]; category_ids: string[]; gender: string; price?: { min_price: number; max_price: number } };
    config: { country: ProductSearchMarket };
  };
  const isOnePiece = Object.values(CHANNEL3_ONE_PIECE_CATEGORY_IDS).some((ids) => ids.some((id) => filters.category_ids.includes(id)));
  return {
    brandId: filters.brand_ids[0] ?? "",
    category: isOnePiece ? "one_piece" : (BRAND_CATEGORIES.find((category) => filters.category_ids.includes(CHANNEL3_CATEGORY_IDS[category][0]!)) ?? null),
    gender: filters.gender,
    market: config.country,
    priceRange: filters.price ? { min: filters.price.min_price, max: filters.price.max_price } : null,
  };
}

/**
 * Two Products of the Brand searched, `<Brand ID>-<Category>-1` and `-2`, in the line searched, each
 * new and in stock at shop.example for 45 in the market's currency, or the nearest price within the
 * price filter.
 */
export function channel3SmallCatalogue({ brandId, category, gender, market, priceRange }: Channel3Search): object[] {
  const price = priceRange ? Math.min(Math.max(45, priceRange.min), priceRange.max) : 45;
  return [1, 2].map((n) => {
    const id = `${brandId}-${category}-${n}`;
    const offer = channel3Offer({ url: `https://shop.example/products/${id}`, price, currency: PRODUCT_SEARCH_MARKET_CURRENCIES[market] });
    return channel3Product(id, { brandIds: [brandId], gender, offers: [offer] });
  });
}

/** A Brand, as Channel3's Brand lookup sends it. */
export function channel3Brand(id: string, name: string, { logoUrl = `https://cdn.channel3.test/logo-brand-${id}` } = {}) {
  return { id, name, logo_url: logoUrl, description: `${name} makes clothes.`, best_commission_rate: 0 };
}

/** Channel3's Brand lookup's answer. */
export function channel3Brands(brands: readonly object[]): Response {
  return Response.json({ brands });
}

/** A website, as Channel3's websites lookup sends it. */
export function channel3Website(id: string, domain: string, { name = domain, logoUrl = `https://cdn.channel3.test/logo-merchant-${id}` } = {}): Response {
  return Response.json({ id, name, url: domain, logo_url: logoUrl, description: `${name} sells clothes.`, best_commission_rate: 0 });
}

/** An offer of a Product, as Channel3 sends it: new and in stock unless said otherwise. */
export function channel3Offer({
  url = "https://shop.example/products/1",
  domain = "shop.example",
  price = 45,
  currency = "USD",
  availability = "InStock",
  condition = "new",
}: { url?: string; domain?: string; price?: number; currency?: string; availability?: string; condition?: string | null } = {}) {
  return { url, domain, price: { price, currency, compare_at_price: null }, availability, condition, max_commission_rate: 0, dimensions: null };
}

/**
 * A Product, as Channel3 sends it, its fields given or made up: by default a hero photo with a
 * background-removed version, and one new, in-stock offer.
 */
export function channel3Product(
  id: string,
  {
    title = `Product ${id}`,
    description = `About product ${id}.`,
    brandIds = ["brand-1"],
    gender = null,
    colors = ["#1f2a44"],
    images = [{ url: `https://images.example/${id}.jpg`, cleaned_url: `https://cdn.channel3.test/${id}-cleaned.png`, shot_type: "hero" }],
    offers = [channel3Offer()],
  }: {
    title?: string;
    description?: string | null;
    brandIds?: string[];
    gender?: string | null;
    colors?: string[];
    images?: object[];
    offers?: object[];
  } = {},
) {
  return {
    id,
    title,
    description,
    brands: brandIds.map((brandId) => ({ id: brandId, name: `Brand ${brandId}` })),
    images,
    category: { slug: "t-shirts-3", title: "T-Shirts", path: [], has_children: false },
    gender,
    age: "adult",
    materials: ["cotton"],
    key_features: [],
    colors: colors.map((hex, index) => ({ hex, percentage: index === 0 ? 0.8 : 0.1 })),
    offers,
    variants: null,
    structured_attributes: {},
    ratings: null,
  };
}

/** A page of Products, as Channel3's search sends it. */
export function channel3Products(products: readonly object[], nextPageToken: string | null = null): Response {
  return Response.json({ products, next_page_token: nextPageToken });
}

/** One Product, as Channel3's Product check sends it. */
export function channel3ProductDetail(product: object): Response {
  return Response.json(product);
}

/** Channel3's "not found". */
export function channel3NotFound(): Response {
  return Response.json({ detail: "Not found" }, { status: 404 });
}

/** Channel3's "too many requests", with the wait it asks for. */
export function channel3TooManyRequests(retryAfterSeconds = 5): Response {
  return Response.json({ detail: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
}

/** Channel3 refusing the API key. */
export function channel3Forbidden(): Response {
  return Response.json({ message: "Forbidden" }, { status: 403 });
}
