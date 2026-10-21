import type { Line } from "@/config/accounts";
import { PRODUCT_SEARCH_MARKET_CURRENCIES, type ProductSearchMarket } from "@/config/product-search";

import type {
  BrandLookup,
  BrandLookupResult,
  CandidateProduct,
  PriceRange,
  ProductCategory,
  ProductCheck,
  ProductCheckResult,
  ProductOffer,
  ProductSearch,
  ProductSearchQuery,
} from "./provider";

// The product search in local development and the browser tests, unless PRODUCT_SEARCH switches
// Channel3 on: no network, no cost. It knows every Brand, and sells each one the same small
// catalogue, in every Category and line, new and in stock in every market.

/** One Product in the built-in catalogue, priced in the market's currency. */
interface CatalogueEntry {
  key: string;
  title: string;
  description: string;
  colours: string[];
  price: number;
}

const CATALOGUE: Record<ProductCategory, Record<Line, readonly CatalogueEntry[]>> = {
  top: {
    menswear: [
      entry("navy-overshirt", "Relaxed cotton overshirt", "A relaxed overshirt in navy brushed cotton, with two chest pockets.", ["#1f2a44"], 70),
      entry("white-tee", "Heavyweight crew-neck T-shirt", "A boxy crew-neck T-shirt in thick white cotton jersey.", ["#f5f5f0"], 35),
    ],
    womenswear: [
      entry("ecru-shirt", "Cropped boxy cotton shirt", "A cropped, boxy shirt in ecru cotton poplin.", ["#efe8d8"], 55),
      entry("sage-cardigan", "Ribbed knit cardigan", "A fitted cardigan in sage ribbed knit, with pearl buttons.", ["#9caf88"], 65),
    ],
  },
  bottom: {
    menswear: [
      entry("indigo-jeans", "Straight-leg selvedge jeans", "Straight-leg jeans in rinsed indigo selvedge denim.", ["#24324f"], 90),
      entry("charcoal-trousers", "Pleated wool-blend trousers", "Relaxed pleated trousers in charcoal wool blend.", ["#3b3b3d"], 85),
    ],
    womenswear: [
      entry("wide-jeans", "Wide-leg high-rise jeans", "High-rise, wide-leg jeans in mid-blue denim.", ["#5a7aa6"], 80),
      entry("satin-skirt", "Satin midi slip skirt", "A bias-cut midi skirt in champagne satin.", ["#d9c3a0"], 60),
    ],
  },
  shoes: {
    menswear: [
      entry("suede-trainers", "Suede low-top trainers", "Low-top trainers in tan suede with a gum sole.", ["#a87b50"], 95),
      entry("chelsea-boots", "Leather Chelsea boots", "Chelsea boots in dark brown leather.", ["#4a2f22"], 140),
    ],
    womenswear: [
      entry("ballet-flats", "Leather ballet flats", "Round-toe ballet flats in black leather.", ["#111111"], 75),
      entry("chunky-loafers", "Chunky leather loafers", "Loafers in burgundy leather on a chunky sole.", ["#5c1f2b"], 110),
    ],
  },
  one_piece: {
    menswear: [
      entry("utility-jumpsuit", "Cotton utility jumpsuit", "A relaxed utility jumpsuit in olive cotton twill.", ["#5b5f3a"], 120),
      entry("denim-overalls", "Denim work overalls", "Work overalls in rigid indigo denim.", ["#2c3e62"], 110),
    ],
    womenswear: [
      entry("linen-dress", "Linen wrap midi dress", "A wrap midi dress in terracotta linen.", ["#c0603f"], 95),
      entry("utility-jumpsuit", "Cotton utility jumpsuit", "A relaxed utility jumpsuit in olive cotton twill.", ["#5b5f3a"], 120),
    ],
  },
};

/** The catalogue by key, for checking a Product it offered. */
const BY_KEY = new Map(
  Object.values(CATALOGUE)
    .flatMap((byLine) => Object.values(byLine).flat())
    .map((catalogued) => [catalogued.key, catalogued] as const),
);

/** The shop every fake Product is sold at. */
const FAKE_SHOP = "shop.example";

export class FakeProductSearch implements ProductSearch {
  async findBrand({ name }: BrandLookup): Promise<BrandLookupResult> {
    return { found: true, brandId: `fake-brand-${encodeURIComponent(name.trim().toLowerCase())}` };
  }

  async searchProducts({ brandId, category, line, market, priceRange }: ProductSearchQuery): Promise<CandidateProduct[]> {
    return CATALOGUE[category][line].map((catalogued) => ({
      id: productId(brandId, catalogued.key),
      title: catalogued.title,
      description: catalogued.description,
      colours: catalogued.colours,
      line,
      brandIds: [brandId],
      images: [
        {
          url: `https://${FAKE_SHOP}/images/${catalogued.key}.jpg`,
          backgroundRemovedUrl: `https://${FAKE_SHOP}/images/${catalogued.key}-cutout.png`,
          shotType: "hero",
        },
      ],
      offers: [offer(catalogued, market, priceRange)],
    }));
  }

  async checkProduct({ productId: id, market }: ProductCheck): Promise<ProductCheckResult> {
    const catalogued = BY_KEY.get(id.slice(id.lastIndexOf("~") + 1));
    return catalogued ? { gone: false, offers: [offer(catalogued, market, null)] } : { gone: true };
  }
}

function entry(key: string, title: string, description: string, colours: string[], price: number): CatalogueEntry {
  return { key, title, description, colours, price };
}

/** A fake Product's ID: its Brand's and its catalogue entry's, so a later check can find it again. */
function productId(brandId: string, key: string): string {
  return `${brandId}~${key}`;
}

/** The fake shop's offer, priced within the price range when there is one. */
function offer(catalogued: CatalogueEntry, market: ProductSearchMarket, priceRange: PriceRange | null): ProductOffer {
  const price = priceRange ? Math.min(Math.max(catalogued.price, priceRange.min), priceRange.max) : catalogued.price;
  return {
    url: `https://${FAKE_SHOP}/products/${catalogued.key}`,
    shopDomain: FAKE_SHOP,
    price,
    currency: PRODUCT_SEARCH_MARKET_CURRENCIES[market],
    availability: "in_stock",
    condition: "new",
  };
}
