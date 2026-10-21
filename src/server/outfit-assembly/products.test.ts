import { describe, expect, it } from "vitest";

import type { CandidateProduct, ProductImage, ProductOffer } from "@/server/product-search/provider";

import { chosenOffer, type PieceSearchRules, qualifyingCandidates, sumPrices } from "./products";

// Which of a search's Products may be a Piece, and which of a Product's offers its Piece links to
// (spec: "Candidates", "Choosing the offer"). Small hand-written Products, decisions out.

const RULES: PieceSearchRules = {
  brandId: "c3-bolt",
  line: "womenswear",
  priceFilter: { min: 20, max: 120, currency: "USD" },
  officialSite: "https://www.bolt.example/",
};

describe("a Product that qualifies for a Piece", () => {
  it("is the matched Brand's, in the Outfit's line, with a garment-only photo and a new, in-stock offer within the price filter", () => {
    const qualifying = qualifyingCandidates([product("p-1")], RULES);

    expect(qualifying).toEqual([
      {
        id: "p-1",
        title: "Product p-1",
        description: "About product p-1.",
        colours: ["#1f2a44"],
        photoUrl: "https://cdn.example/p-1-cutout.png",
        offer: { url: "https://shop.example/products/p-1", shopDomain: "shop.example", price: 45, currency: "USD" },
      },
    ]);
  });

  it("is one of whose Brands is the matched Brand, never another Brand's", () => {
    const products = [
      product("collab", { brandIds: ["c3-other", "c3-bolt"] }),
      product("other", { brandIds: ["c3-other"] }),
      product("no-brand", { brandIds: [] }),
    ];

    expect(ids(qualifyingCandidates(products, RULES))).toEqual(["collab"]);
  });

  it("is in the Outfit's line, or unisex", () => {
    const products = [product("womens", { line: "womenswear" }), product("mens", { line: "menswear" }), product("unisex", { line: null })];

    expect(ids(qualifyingCandidates(products, RULES))).toEqual(["womens", "unisex"]);
  });

  it("has a hero or flat-lay photo, never only an on-model, lifestyle or other one", () => {
    const products = [
      product("hero", { images: [image("hero")] }),
      product("flat-lay", { images: [image("flat_lay")] }),
      product("on-model", { images: [image("on_model")] }),
      product("lifestyle", { images: [image("lifestyle")] }),
      product("other", { images: [image("other")] }),
      product("unsaid", { images: [image(null)] }),
      product("no-photo", { images: [] }),
    ];

    expect(ids(qualifyingCandidates(products, RULES))).toEqual(["hero", "flat-lay"]);
  });

  it("is shown by its first garment-only photo, the background-removed version when there is one", () => {
    const [onModelFirst, withoutCutout] = qualifyingCandidates(
      [
        product("on-model-first", {
          images: [image("on_model", "https://cdn.example/model.jpg"), image("flat_lay", "https://cdn.example/flat.jpg", "https://cdn.example/flat-cutout.png"), image("hero", "https://cdn.example/hero.jpg")],
        }),
        product("without-cutout", { images: [image("hero", "https://cdn.example/hero.jpg", null)] }),
      ],
      RULES,
    );

    expect(onModelFirst!.photoUrl).toBe("https://cdn.example/flat-cutout.png");
    expect(withoutCutout!.photoUrl).toBe("https://cdn.example/hero.jpg");
  });

  it("has an in-stock offer that isn't second-hand, never only a used or out-of-stock one; the search asked for new Products, so one whose condition is unsaid counts", () => {
    const products = [
      product("new", { offers: [offer()] }),
      product("used", { offers: [offer({ condition: "used" })] }),
      product("unsaid", { offers: [offer({ condition: null })] }),
      product("out-of-stock", { offers: [offer({ availability: "out_of_stock" })] }),
      product("no-offer", { offers: [] }),
      product("one-good-offer", { offers: [offer({ condition: "used" }), offer({ shopDomain: "good.example" })] }),
    ];

    expect(ids(qualifyingCandidates(products, RULES))).toEqual(["new", "unsaid", "one-good-offer"]);
  });

  it("has an offer within the price filter, its ends included, in the filter's currency", () => {
    const products = [
      product("at-min", { offers: [offer({ price: 20 })] }),
      product("at-max", { offers: [offer({ price: 120 })] }),
      product("too-cheap", { offers: [offer({ price: 19.99 })] }),
      product("too-dear", { offers: [offer({ price: 450 })] }),
      product("in-euros", { offers: [offer({ price: 45, currency: "EUR" })] }),
    ];

    expect(ids(qualifyingCandidates(products, RULES))).toEqual(["at-min", "at-max"]);
  });

  it("can have any price, in any currency, when the search had no price filter", () => {
    const products = [product("dear", { offers: [offer({ price: 450 })] }), product("in-euros", { offers: [offer({ currency: "EUR" })] })];

    expect(ids(qualifyingCandidates(products, { ...RULES, priceFilter: null }))).toEqual(["dear", "in-euros"]);
  });

  it("has a photo and an offer on the web, never some other kind of link", () => {
    const products = [
      product("script-photo", { images: [image("hero", "javascript:alert(1)", null)] }),
      product("script-offer", { offers: [offer({ url: "javascript:alert(1)" })] }),
      product("http", { images: [image("hero", "http://cdn.example/p.jpg", null)], offers: [offer({ url: "http://shop.example/p" })] }),
    ];

    expect(ids(qualifyingCandidates(products, RULES))).toEqual(["http"]);
  });

  it("is one of at most 8 kept, in the product search's order", () => {
    const products = Array.from({ length: 12 }, (_, index) => product(`p-${index + 1}`, index === 1 ? { line: "menswear" } : {}));

    expect(ids(qualifyingCandidates(products, RULES))).toEqual(["p-1", "p-3", "p-4", "p-5", "p-6", "p-7", "p-8", "p-9"]);
  });
});

describe("the offer a Piece links to", () => {
  it("is the Brand's own store's, by Qloo's official site, ignoring www. and http or https, wherever it comes", () => {
    const own = offer({ url: "https://bolt.example/p-1", shopDomain: "bolt.example" });

    expect(chosenOffer([offer(), own], RULES)).toBe(own);
    expect(chosenOffer([offer(), own], { ...RULES, officialSite: "http://bolt.example" })).toBe(own);
    const ownWithWww = offer({ shopDomain: "WWW.Bolt.example" });
    expect(chosenOffer([offer(), ownWithWww], { ...RULES, officialSite: "https://bolt.example/en/" })).toBe(ownWithWww);
  });

  it("is otherwise the first new, in-stock offer within the price filter, in the product search's order", () => {
    const first = offer({ shopDomain: "first.example" });

    expect(chosenOffer([offer({ condition: "used" }), offer({ availability: "out_of_stock" }), offer({ price: 500 }), first, offer()], RULES)).toBe(first);
    expect(chosenOffer([offer(), offer({ shopDomain: "bolt-fans.example" })], { ...RULES, officialSite: null })).toEqual(offer());
  });

  it("is never second-hand, out of stock or outside the price filter, even at the Brand's own store", () => {
    const elsewhere = offer({ shopDomain: "elsewhere.example" });

    for (const own of [
      offer({ shopDomain: "bolt.example", condition: "used" }),
      offer({ shopDomain: "bolt.example", availability: "out_of_stock" }),
      offer({ shopDomain: "bolt.example", price: 500 }),
    ]) {
      expect(chosenOffer([own, elsewhere], RULES)).toBe(elsewhere);
    }
    expect(chosenOffer([offer({ shopDomain: "bolt.example", condition: "used" })], RULES)).toBeNull();
  });

  it("keeps its own link exactly as the product search gave it", () => {
    const linked = offer({ url: "https://shop.example/products/p-1?colour=navy" });

    expect(chosenOffer([linked], RULES)?.url).toBe("https://shop.example/products/p-1?colour=navy");
  });
});

describe("a whole Outfit's Products' prices", () => {
  it("add up in their currency", () => {
    expect(sumPrices([price(45, "EUR"), price(59.9, "EUR"), price(120, "EUR")])).toEqual({ amount: 224.9, currency: "EUR" });
  });

  it("add up to nothing when they're in different currencies, until prices convert", () => {
    expect(sumPrices([price(45, "EUR"), price(40, "GBP")])).toBeNull();
    expect(sumPrices([])).toBeNull();
  });
});

function price(amount: number, currency: string) {
  return { amount, currency };
}

/** A Product of the matched Brand in the line, with a hero photo and one new, in-stock offer at 45 dollars, unless overridden. */
function product(id: string, overrides: Partial<CandidateProduct> = {}): CandidateProduct {
  return {
    id,
    title: `Product ${id}`,
    description: `About product ${id}.`,
    colours: ["#1f2a44"],
    line: "womenswear",
    brandIds: ["c3-bolt"],
    images: [image("hero", `https://cdn.example/${id}.jpg`, `https://cdn.example/${id}-cutout.png`)],
    offers: [offer({ url: `https://shop.example/products/${id}` })],
    ...overrides,
  };
}

function image(shotType: ProductImage["shotType"], url = "https://cdn.example/photo.jpg", backgroundRemovedUrl: string | null = null): ProductImage {
  return { url, backgroundRemovedUrl, shotType };
}

/** A new, in-stock offer at 45 dollars from shop.example, unless overridden. */
function offer(overrides: Partial<ProductOffer> = {}): ProductOffer {
  return {
    url: "https://shop.example/products/1",
    shopDomain: "shop.example",
    price: 45,
    currency: "USD",
    availability: "in_stock",
    condition: "new",
    ...overrides,
  };
}

function ids(candidates: readonly { id: string }[]): string[] {
  return candidates.map((candidate) => candidate.id);
}
