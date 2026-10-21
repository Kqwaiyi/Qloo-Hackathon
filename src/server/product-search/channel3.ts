import * as z from "zod";

import { type Line, LINES } from "@/config/accounts";
import {
  CHANNEL3_API_URL,
  CHANNEL3_BRANDS_PER_LOOKUP,
  CHANNEL3_CATEGORY_IDS,
  CHANNEL3_ONE_PIECE_CATEGORY_IDS,
  ONE_PIECE_KINDS,
  PRODUCTS_PER_SEARCH,
} from "@/config/product-search";
import { matchedBrand, sameNameBrands } from "@/server/outfit-assembly/brand-names";

import {
  type BrandLookup,
  type BrandLookupResult,
  type CandidateProduct,
  type ProductCategory,
  type ProductCheck,
  type ProductCheckResult,
  type ProductImage,
  type ProductOffer,
  type ProductSearch,
  type ProductSearchQuery,
  ProductSearchRateLimitedError,
  type ProductShotType,
  UnretryableProductSearchError,
} from "./provider";

// The product search on Channel3 (spec: "Channel3 specifics"). The API key goes in the `x-api-key`
// header, and nothing about the user goes anywhere.

/** Sends one HTTP request to Channel3. `fetch` in deployments; a fake in tests. */
export type Channel3Transport = (request: Request) => Promise<Response>;

export interface Channel3Options {
  transport: Channel3Transport;
  apiKey: string;
}

/**
 * How a Qloo Brand matched in Channel3: one Brand under its name, none, or several, which its
 * official site's website either told apart or didn't, and why not.
 */
export type Channel3BrandMatch =
  | { outcome: "found"; brandId: string }
  | { outcome: "not_found" }
  | { outcome: "tie_broken"; brandId: string; tied: number }
  | { outcome: "tie_unbroken"; tied: number; reason: "no_official_site" | "website_unknown" | "no_one_brand_tied" };

export class Channel3ProductSearch implements ProductSearch {
  constructor(private readonly options: Channel3Options) {}

  async findBrand(lookup: BrandLookup): Promise<BrandLookupResult> {
    const match = await this.matchBrand(lookup);
    return "brandId" in match ? { found: true, brandId: match.brandId } : { found: false };
  }

  /**
   * `findBrand`, saying how the Brand matched: two free calls at most. Several Brands under the
   * name are told apart by the website at Qloo's official site for the Brand: the one Brand sharing
   * its logo is the match. Channel3's Brands carry no website of their own.
   */
  async matchBrand({ name, officialSite }: BrandLookup): Promise<Channel3BrandMatch> {
    const { brands } = brandLookupResponse.parse(
      await this.get("/v1/brands/search", { query: name, limit: String(CHANNEL3_BRANDS_PER_LOOKUP) }),
    );
    const sameName = sameNameBrands(name, brands);
    if (sameName.length <= 1) {
      const [only] = sameName;
      return only ? { outcome: "found", brandId: only.id } : { outcome: "not_found" };
    }
    const tied = sameName.length;
    const host = officialSite ? siteHost(officialSite) : null;
    if (!host) return { outcome: "tie_unbroken", tied, reason: "no_official_site" };
    const website = await this.website(host);
    if (!website) return { outcome: "tie_unbroken", tied, reason: "website_unknown" };
    const match = matchedBrand(sameName, (brand) => Boolean(brand.logo_url) && brand.logo_url === website.logo_url);
    return match ? { outcome: "tie_broken", brandId: match.id, tied } : { outcome: "tie_unbroken", tied, reason: "no_one_brand_tied" };
  }

  /**
   * One paid call: Channel3's browse, which filters by Brand, category, line, stock, condition, price
   * and market without a free-text query. Adult Products only, as the app is for adults (ADR-0004).
   * Channel3 has no unisex value, so the line's gender is sent; unisex Products come back ungendered
   * when Channel3 includes them.
   */
  async searchProducts({ brandId, category, line, market, priceRange }: ProductSearchQuery): Promise<CandidateProduct[]> {
    const body = await this.post("/v1/browse", {
      filters: {
        brand_ids: [brandId],
        category_ids: categoryIds(category, line),
        gender: CHANNEL3_GENDERS[line],
        age: ["adult"],
        conditions: ["new"],
        availability: ["InStock"],
        ...(priceRange && { price: { min_price: priceRange.min, max_price: priceRange.max } }),
      },
      limit: PRODUCTS_PER_SEARCH,
      // The market goes in the locale config, the currency left to Channel3 to infer from it.
      config: { country: market },
    });
    return productsResponse.parse(body).products;
  }

  /** One free call: Channel3's Product detail, in the market's locale. */
  async checkProduct({ productId, market }: ProductCheck): Promise<ProductCheckResult> {
    const body = await this.get(`/v1/products/${encodeURIComponent(productId)}`, { country: market }, { notFoundIsNull: true });
    const offers = body === null ? [] : productOffers.parse(body).offers;
    return offers.length === 0 ? { gone: true } : { gone: false, offers };
  }

  /** The website Channel3 has at this host, or null when it has none. */
  private async website(host: string): Promise<z.infer<typeof websiteResponse> | null> {
    const body = await this.get(`/v1/websites/${encodeURIComponent(host)}`, {}, { notFoundIsNull: true });
    return body === null ? null : websiteResponse.parse(body);
  }

  /** A GET's JSON body, or null for a 404 when the caller reads "not found" as an answer. */
  private get(path: string, query: Record<string, string>, { notFoundIsNull = false } = {}): Promise<unknown> {
    const url = new URL(path, CHANNEL3_API_URL);
    for (const [name, value] of Object.entries(query)) url.searchParams.append(name, value);
    return this.send(new Request(url, { method: "GET", headers: { "x-api-key": this.options.apiKey } }), notFoundIsNull);
  }

  /** A POST of a JSON body, and the JSON body it answers with. */
  private post(path: string, body: object): Promise<unknown> {
    const request = new Request(new URL(path, CHANNEL3_API_URL), {
      method: "POST",
      headers: { "x-api-key": this.options.apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.send(request, false);
  }

  /**
   * The answer's JSON body, or null for a 404 when `notFoundIsNull`. "Too many requests" is retried
   * after a back-off, a refused key is unretryable, and the step retries any other error.
   */
  private async send(request: Request, notFoundIsNull: boolean): Promise<unknown> {
    const response = await this.options.transport(request);
    const { status } = response;
    if (status === 404 && notFoundIsNull) return null;
    if (status === 429) throw new ProductSearchRateLimitedError(retryAfterSeconds(response.headers));
    if (status === 401 || status === 403) throw new UnretryableProductSearchError(`Channel3 refused the API key: it answered ${status}.`, status);
    if (!response.ok) throw new Error(`Channel3 answered ${status}.`);
    return response.json();
  }
}

/** How long a "too many requests" asks the caller to wait, in seconds, when it says. */
function retryAfterSeconds(headers: Headers): number | undefined {
  const value = headers.get("Retry-After")?.trim();
  const seconds = value ? Number(value) : Number.NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/** Channel3 with CHANNEL3_API_KEY, over `fetch`. It refuses to start without the key. */
export function channel3FromEnvironment(): Channel3ProductSearch {
  const apiKey = process.env.CHANNEL3_API_KEY;
  if (!apiKey) throw new Error("CHANNEL3_API_KEY must be set when PRODUCT_SEARCH is channel3.");
  return new Channel3ProductSearch({ transport: (request) => fetch(request), apiKey });
}

/** Channel3's gender for each line, on a search and on the Products it finds. It has no unisex value. */
const CHANNEL3_GENDERS: Record<Line, string> = { menswear: "male", womenswear: "female" };

/** Channel3's category IDs for a Category; for a One-Piece, those of the kinds the line may have. */
function categoryIds(category: ProductCategory, line: Line): string[] {
  if (category === "one_piece") return ONE_PIECE_KINDS[line].flatMap((kind) => CHANNEL3_ONE_PIECE_CATEGORY_IDS[kind]);
  return [...CHANNEL3_CATEGORY_IDS[category]];
}

/** A site's host, as Channel3 knows websites by it: without `www.`. Null when it isn't a URL. */
function siteHost(site: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(site) ? site : `https://${site}`;
  if (!URL.canParse(withScheme)) return null;
  return new URL(withScheme).hostname.replace(/^www\./, "") || null;
}

// The trimming. Parsing keeps only the fields named here and drops the rest. A field Channel3 leaves
// out or sends in another shape reads as missing, and a list item without what it must have is dropped.

/** A list's items that parse, in order. Anything else in the list, or a missing list, is dropped. */
function listOf<Item extends z.ZodType>(item: Item) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((values) =>
      values.flatMap((value) => {
        const parsed = item.safeParse(value);
        return parsed.success ? [parsed.data as z.output<Item>] : [];
      }),
    );
}

/** Channel3's shot types, as ours. Any other is "other". */
const SHOT_TYPES = new Map<string, ProductShotType>([
  ["hero", "hero"],
  ["flat_lay", "flat_lay"],
  ["on_model", "on_model"],
  ["lifestyle", "lifestyle"],
]);

const optionalText = z.string().nullish().catch(null);

const productImage = z
  .object({ url: z.string(), cleaned_url: optionalText, shot_type: optionalText })
  .transform(
    ({ url, cleaned_url, shot_type }): ProductImage => ({
      url,
      backgroundRemovedUrl: cleaned_url || null,
      shotType: shot_type ? (SHOT_TYPES.get(shot_type) ?? "other") : null,
    }),
  );

const productOffer = z
  .object({
    url: z.string(),
    domain: z.string(),
    price: z.object({ price: z.number(), currency: z.string() }),
    availability: optionalText,
    condition: optionalText,
  })
  .transform(
    ({ url, domain, price, availability, condition }): ProductOffer => ({
      url,
      shopDomain: domain,
      price: price.price,
      currency: price.currency,
      availability: availability === "InStock" ? "in_stock" : "out_of_stock",
      condition: condition === "new" || condition === "used" ? condition : null,
    }),
  );

const product = z
  .object({
    id: z.string(),
    title: z.string(),
    description: optionalText,
    gender: optionalText,
    brands: listOf(z.object({ id: z.string() })),
    colors: listOf(z.object({ hex: z.string() })),
    images: listOf(productImage),
    offers: listOf(productOffer),
  })
  .transform(
    ({ id, title, description, gender, brands, colors, images, offers }): CandidateProduct => ({
      id,
      title,
      description: description ?? null,
      colours: colors.map((colour) => colour.hex),
      line: LINES.find((line) => CHANNEL3_GENDERS[line] === gender) ?? null,
      brandIds: brands.map((brand) => brand.id),
      images,
      offers,
    }),
  );

const productsResponse = z.object({ products: z.array(z.unknown()).pipe(listOf(product)) });

const productOffers = z.object({ offers: listOf(productOffer) });

const brandLookupResponse = z.object({
  brands: z.array(z.unknown()).pipe(listOf(z.object({ id: z.string(), name: z.string(), logo_url: optionalText }))),
});

const websiteResponse = z.object({ id: z.string(), logo_url: z.string().nullable().catch(null) });
