import type { Channel3Transport } from "./channel3";

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
