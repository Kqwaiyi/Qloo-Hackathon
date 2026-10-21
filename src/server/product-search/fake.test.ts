import { describe, expect, it } from "vitest";

import { LINES } from "@/config/accounts";

import { FakeProductSearch } from "./fake";
import type { ProductCategory } from "./provider";

// The fake is what local development and the browser tests run on, so it must always have
// something to offer, whatever Brand, Category, line and market they ask for.

const CATEGORIES: readonly ProductCategory[] = ["top", "bottom", "shoes", "one_piece"];

describe("the fake product search", () => {
  const search = new FakeProductSearch();

  it("knows every Brand", async () => {
    const first = await search.findBrand({ name: "Northbound", officialSite: null });
    const again = await search.findBrand({ name: "Northbound", officialSite: "https://northbound.example" });
    const other = await search.findBrand({ name: "Southbound", officialSite: null });

    expect(first).toEqual({ found: true, brandId: expect.any(String) });
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it.each(LINES.flatMap((line) => CATEGORIES.map((category) => [category, line] as const)))(
    "offers %s Products in %s, each the Brand's, new and in stock, with a garment-only photo",
    async (category, line) => {
      const products = await search.searchProducts({ brandId: "fake-brand-1", category, line, market: "US", priceRange: null });

      expect(products.length).toBeGreaterThan(0);
      for (const product of products) {
        expect(product.title).not.toBe("");
        expect(product.brandIds).toContain("fake-brand-1");
        expect([line, null]).toContain(product.line);
        expect(product.images.some((image) => image.shotType === "hero" && image.backgroundRemovedUrl !== null)).toBe(true);
        expect(product.offers).toContainEqual(expect.objectContaining({ availability: "in_stock", condition: "new", currency: "USD" }));
      }
    },
  );

  it("never offers a dress for menswear", async () => {
    const products = await search.searchProducts({ brandId: "fake-brand-1", category: "one_piece", line: "menswear", market: "US", priceRange: null });

    expect(products.map((product) => product.title.toLowerCase()).join(" ")).not.toContain("dress");
  });

  it("prices every Product within the price range, in the market's currency", async () => {
    const products = await search.searchProducts({
      brandId: "fake-brand-1",
      category: "shoes",
      line: "womenswear",
      market: "GB",
      priceRange: { min: 200, max: 220 },
    });

    for (const { offers } of products) {
      for (const offer of offers) {
        expect(offer.currency).toBe("GBP");
        expect(offer.price).toBeGreaterThanOrEqual(200);
        expect(offer.price).toBeLessThanOrEqual(220);
      }
    }
  });

  it("finds a Product it offered still on offer, and one it never offered gone", async () => {
    const [product] = await search.searchProducts({ brandId: "fake-brand-1", category: "top", line: "menswear", market: "FR", priceRange: null });

    expect(await search.checkProduct({ productId: product!.id, market: "FR" })).toEqual({
      gone: false,
      offers: [expect.objectContaining({ availability: "in_stock", condition: "new", currency: "EUR" })],
    });
    expect(await search.checkProduct({ productId: "never-offered", market: "FR" })).toEqual({ gone: true });
  });
});
