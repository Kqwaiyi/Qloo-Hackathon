import type { Line } from "@/config/accounts";
import type { Price } from "@/config/consultations";
import { CANDIDATES_PER_PIECE, PRODUCT_SEARCH_MARKET_CURRENCIES, type ProductSearchMarket } from "@/config/product-search";
import type { CandidateProduct, PriceRange, ProductImage, ProductOffer } from "@/server/product-search/provider";

import { brandPriceRange, type PickedBrand } from "./brands";

// Which of a search's Products may be a Piece, and which offer its Piece links to (spec:
// "Candidates", "Choosing the offer", ADR-0008). Pure: the caller searches and saves.

/** A search's price filter, in the market's currency. */
export type PriceFilter = PriceRange & { currency: string };

/** What a Piece's search was for, which its Products are held to. */
export interface PieceSearchRules {
  /** The product search's ID for the Piece's Brand. */
  brandId: string;
  /** The Outfit's line. */
  line: Line;
  /** The price filter the search sent, or null when it sent none. */
  priceFilter: PriceFilter | null;
  /** Qloo's official site for the Brand: an offer from its own store wins. */
  officialSite: string | null;
}

/** An offer a Piece links to: its page, its shop, and its price in its own currency. */
export interface CandidateOffer {
  url: string;
  shopDomain: string;
  price: number;
  currency: string;
}

/** A Product that qualified for a Piece, with what tailoring and the Piece need. */
export interface Candidate {
  id: string;
  /** The Product's name, as its seller gives it. */
  title: string;
  description: string | null;
  /** Its colours, as hex codes, the most prominent first. */
  colours: string[];
  /** Its garment-only photo: the background-removed version when there is one. */
  photoUrl: string;
  /** The offer its Piece links to. */
  offer: CandidateOffer;
}

/**
 * The Products a Piece may be, at most CANDIDATES_PER_PIECE in the product search's order: each one
 * of whose Brands is the matched Brand, in the Outfit's line or unisex, with a garment-only photo
 * (hero or flat-lay) and an offer `chosenOffer` picks.
 */
export function qualifyingCandidates(products: readonly CandidateProduct[], rules: PieceSearchRules): Candidate[] {
  const candidates: Candidate[] = [];
  for (const product of products) {
    if (candidates.length >= CANDIDATES_PER_PIECE) break;
    if (!product.brandIds.includes(rules.brandId)) continue;
    if (product.line !== null && product.line !== rules.line) continue;
    const photoUrl = garmentOnlyPhotoUrl(product.images);
    const offer = chosenOffer(product.offers, rules);
    if (!photoUrl || !offer) continue;
    const { id, title, description, colours } = product;
    const { url, shopDomain, price, currency } = offer;
    candidates.push({ id, title, description, colours, photoUrl, offer: { url, shopDomain, price, currency } });
  }
  return candidates;
}

/**
 * The offer a Piece links to, or null when none may be: of the new, in-stock offers on the web
 * within the price filter, the one from the Brand's own store, its shop's domain matching the host of
 * Qloo's official site (ignoring `www.`, http or https), or else the first, in the product search's
 * order. Never a second-hand one, and its link is kept exactly as given: no affiliate parameters. The
 * search asked for new Products only, so an offer whose shop doesn't say its condition counts as new.
 */
export function chosenOffer(offers: readonly ProductOffer[], { priceFilter, officialSite }: Pick<PieceSearchRules, "priceFilter" | "officialSite">): ProductOffer | null {
  const buyable = offers.filter(
    (offer) =>
      offer.condition !== "used" &&
      offer.availability === "in_stock" &&
      isWebLink(offer.url) &&
      (!priceFilter || (offer.currency === priceFilter.currency && offer.price >= priceFilter.min && offer.price <= priceFilter.max)),
  );
  const brandHost = officialSite ? siteHost(officialSite) : null;
  return buyable.find((offer) => brandHost !== null && withoutWww(offer.shopDomain) === brandHost) ?? buyable[0] ?? null;
}

/**
 * A Piece's search's price filter: its Brand's Qloo price range, in US dollars, or null for none.
 * Until prices are converted, only a market priced in US dollars gets one; any other gets none, and
 * so does a Brand without a range.
 */
export function searchPriceFilter(
  { priceRangeUsdMin, priceRangeUsdMax }: Pick<PickedBrand, "priceRangeUsdMin" | "priceRangeUsdMax">,
  market: ProductSearchMarket,
): PriceFilter | null {
  const range = brandPriceRange(priceRangeUsdMin, priceRangeUsdMax);
  return range && PRODUCT_SEARCH_MARKET_CURRENCIES[market] === "USD" ? { ...range, currency: "USD" } : null;
}

/**
 * Products' prices added up, when they're all in one currency, as one Styling's offers are in its
 * market's. Null for none, or for prices in different currencies, until prices convert.
 */
export function sumPrices(prices: readonly Price[]): Price | null {
  const [first] = prices;
  if (!first || prices.some(({ currency }) => currency !== first.currency)) return null;
  return { amount: prices.reduce((total, { amount }) => total + amount, 0), currency: first.currency };
}

/** The first hero or flat-lay photo on the web: its background-removed version when there is one. */
function garmentOnlyPhotoUrl(images: readonly ProductImage[]): string | null {
  for (const { shotType, url, backgroundRemovedUrl } of images) {
    if (shotType !== "hero" && shotType !== "flat_lay") continue;
    const photoUrl = backgroundRemovedUrl ?? url;
    if (isWebLink(photoUrl)) return photoUrl;
  }
  return null;
}

/** Whether a link is to a web page or image, over http or https: nothing a browser would run. */
function isWebLink(link: string): boolean {
  if (!URL.canParse(link)) return false;
  const { protocol } = new URL(link);
  return protocol === "https:" || protocol === "http:";
}

/** A site's host, in lower case and without `www.`, whether or not it's written with http or https. Null when it isn't a site. */
export function siteHost(site: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(site) ? site : `https://${site}`;
  if (!URL.canParse(withScheme)) return null;
  return withoutWww(new URL(withScheme).hostname) || null;
}

function withoutWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}
