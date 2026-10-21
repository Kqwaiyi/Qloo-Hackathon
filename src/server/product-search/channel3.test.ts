import { beforeEach, describe, expect, it } from "vitest";

import { Channel3ProductSearch } from "./channel3";
import {
  channel3Brand,
  channel3Brands,
  channel3Forbidden,
  channel3NotFound,
  channel3Offer,
  channel3Product,
  channel3ProductDetail,
  channel3Products,
  channel3TooManyRequests,
  channel3Website,
  FakeChannel3Transport,
} from "./fake-channel3";
import { ProductSearchRateLimitedError, type ProductSearchQuery, UnretryableProductSearchError } from "./provider";

// Small hand-written samples shaped like Channel3's answers. The Brands, shops and Products are made up.

let channel3: FakeChannel3Transport;
let search: Channel3ProductSearch;

beforeEach(() => {
  channel3 = new FakeChannel3Transport();
  search = new Channel3ProductSearch({ transport: channel3.send, apiKey: "test-channel3-key" });
});

describe("finding a Brand", () => {
  it("asks Channel3's Brand lookup for the Brand's name, with the API key in the x-api-key header and nothing else", async () => {
    channel3.respond = () => channel3Brands([channel3Brand("c3-northbound", "Northbound")]);

    await search.findBrand({ name: "Northbound", officialSite: null });

    expect(channel3.requests).toHaveLength(1);
    const [request] = channel3.requests;
    expect(request!.method).toBe("GET");
    expect([...request!.headers]).toEqual([["x-api-key", "test-channel3-key"]]);
    expect(`${request!.url.origin}${request!.url.pathname}`).toBe("https://api.trychannel3.com/v1/brands/search");
    expect([...request!.url.searchParams]).toEqual([
      ["query", "Northbound"],
      ["limit", "20"],
    ]);
  });

  it("finds the one Brand Channel3 lists under the Brand's name, however it writes it", async () => {
    channel3.respond = () =>
      channel3Brands([
        channel3Brand("c3-northbound-kids", "Northbound Kids"),
        channel3Brand("c3-northbound", "NORTHBOUND."),
        channel3Brand("c3-northbend", "Northbend"),
      ]);

    expect(await search.findBrand({ name: "Northbound", officialSite: null })).toEqual({ found: true, brandId: "c3-northbound" });
  });

  it("doesn't find a Brand Channel3 lists only under similar names", async () => {
    channel3.respond = () => channel3Brands([channel3Brand("c3-northbound-kids", "Northbound Kids"), channel3Brand("c3-northbend", "Northbend")]);

    expect(await search.findBrand({ name: "Northbound", officialSite: "https://northbound.example" })).toEqual({ found: false });
    expect(channel3.requests).toHaveLength(1);
  });

  describe("when Channel3 lists several Brands under its name", () => {
    const SHARED_LOGO = "https://cdn.channel3.test/0b6c-northbound-logo";
    const sameNameBrands = () =>
      channel3Brands([channel3Brand("c3-northbound-1", "Northbound"), channel3Brand("c3-northbound-2", "NORTHBOUND", { logoUrl: SHARED_LOGO })]);

    it("finds the one whose logo is that of the website at the Brand's official site, looked up by its host", async () => {
      channel3.respond = ({ url }) =>
        url.pathname === "/v1/brands/search" ? sameNameBrands() : channel3Website("site-1", "northbound.example", { logoUrl: SHARED_LOGO });

      const found = await search.findBrand({ name: "Northbound", officialSite: "http://www.northbound.example/en/index.html" });

      expect(found).toEqual({ found: true, brandId: "c3-northbound-2" });
      expect(channel3.requests.map(({ method, url }) => `${method} ${url.pathname}`)).toEqual([
        "GET /v1/brands/search",
        "GET /v1/websites/northbound.example",
      ]);
      expect([...channel3.requests[1]!.headers]).toEqual([["x-api-key", "test-channel3-key"]]);
    });

    it("finds none when no Brand shares the website's logo", async () => {
      channel3.respond = ({ url }) => (url.pathname === "/v1/brands/search" ? sameNameBrands() : channel3Website("site-1", "northbound.example"));

      expect(await search.findBrand({ name: "Northbound", officialSite: "https://northbound.example" })).toEqual({ found: false });
    });

    it("finds none when Channel3 doesn't know the website", async () => {
      channel3.respond = ({ url }) => (url.pathname === "/v1/brands/search" ? sameNameBrands() : channel3NotFound());

      expect(await search.findBrand({ name: "Northbound", officialSite: "https://northbound.example" })).toEqual({ found: false });
    });

    it("finds none when neither the Brands nor the website have a logo", async () => {
      channel3.respond = ({ url }) =>
        url.pathname === "/v1/brands/search"
          ? channel3Brands([channel3Brand("c3-northbound-1", "Northbound", { logoUrl: "" }), channel3Brand("c3-northbound-2", "Northbound", { logoUrl: "" })])
          : channel3Website("site-1", "northbound.example", { logoUrl: "" });

      expect(await search.findBrand({ name: "Northbound", officialSite: "https://northbound.example" })).toEqual({ found: false });
    });

    it("finds none, and looks up no website, when Qloo has no official site for the Brand", async () => {
      channel3.respond = () => sameNameBrands();

      expect(await search.findBrand({ name: "Northbound", officialSite: null })).toEqual({ found: false });
      expect(channel3.requests).toHaveLength(1);
    });
  });
});

describe("searching a Brand's Products", () => {
  it("asks Channel3 once for up to 30 of the Brand's new, in-stock adult Products in the Category, line, price range and market", async () => {
    await search.searchProducts({
      brandId: "c3-northbound",
      category: "shoes",
      line: "womenswear",
      market: "GB",
      priceRange: { min: 40, max: 180 },
    });

    expect(channel3.requests).toHaveLength(1);
    const [request] = channel3.requests;
    expect(`${request!.method} ${request!.url.href}`).toBe("POST https://api.trychannel3.com/v1/browse");
    expect([...request!.headers]).toEqual([
      ["content-type", "application/json"],
      ["x-api-key", "test-channel3-key"],
    ]);
    expect(request!.body).toEqual({
      filters: {
        brand_ids: ["c3-northbound"],
        category_ids: ["shoes"],
        gender: "female",
        age: ["adult"],
        conditions: ["new"],
        availability: ["InStock"],
        price: { min_price: 40, max_price: 180 },
      },
      limit: 30,
      config: { country: "GB" },
    });
  });

  it.each([
    ["Top", "top", "menswear", ["shirts-tops", "coats-jackets", "activewear-tops", "activewear-sweatshirts-hoodies"], "male"],
    ["Bottom", "bottom", "womenswear", ["pants", "shorts", "skirts", "activewear-pants"], "female"],
    ["womenswear One-Piece: a dress, jumpsuit or overalls", "one_piece", "womenswear", ["dresses", "jumpsuits-rompers", "overalls"], "female"],
    ["menswear One-Piece: a jumpsuit or overalls, never a dress", "one_piece", "menswear", ["jumpsuits-rompers", "overalls"], "male"],
  ] as const)("searches a %s in Channel3's categories for it, in the line's gender", async (_, category, line, categoryIds, gender) => {
    await search.searchProducts({ brandId: "c3-northbound", category, line, market: "US", priceRange: null });

    expect(channel3.requests[0]!.body).toMatchObject({ filters: { category_ids: categoryIds, gender } });
  });

  it("returns each Product Channel3 found, in its order, with what tailoring and a Piece may need", async () => {
    channel3.respond = () =>
      channel3Products([
        channel3Product("p-overshirt", {
          title: "Northbound Relaxed Cotton Overshirt",
          description: "A relaxed overshirt in brushed cotton.",
          brandIds: ["c3-northbound", "c3-northbound-collab"],
          gender: "male",
          colors: ["#1f2a44", "#f5f5f0"],
          images: [
            { url: "https://images.example/overshirt-model.jpg", cleaned_url: null, shot_type: "on_model", is_main_image: true, alt_text: null },
            { url: "https://images.example/overshirt.jpg", cleaned_url: "https://cdn.channel3.test/overshirt.png", shot_type: "hero" },
            { url: "https://images.example/overshirt-flat.jpg", shot_type: "flat_lay" },
            { url: "https://images.example/overshirt-street.jpg", shot_type: "lifestyle" },
            { url: "https://images.example/overshirt-cuff.jpg", shot_type: "detail" },
            { url: "https://images.example/overshirt-unsaid.jpg" },
          ],
          offers: [
            channel3Offer({ url: "https://northbound.example/p/overshirt", domain: "northbound.example", price: 89.5, currency: "GBP" }),
            channel3Offer({ url: "https://resale.example/overshirt", domain: "resale.example", price: 40, currency: "GBP", condition: "used" }),
            channel3Offer({ url: "https://shop.example/overshirt", domain: "shop.example", price: 95, currency: "GBP", availability: "OutOfStock", condition: null }),
          ],
        }),
        channel3Product("p-tee", { title: "Northbound Pocket Tee", description: null, gender: null, colors: [] }),
      ]);

    const products = await search.searchProducts({ brandId: "c3-northbound", category: "top", line: "menswear", market: "GB", priceRange: null });

    expect(products).toEqual([
      {
        id: "p-overshirt",
        title: "Northbound Relaxed Cotton Overshirt",
        description: "A relaxed overshirt in brushed cotton.",
        colours: ["#1f2a44", "#f5f5f0"],
        line: "menswear",
        brandIds: ["c3-northbound", "c3-northbound-collab"],
        images: [
          { url: "https://images.example/overshirt-model.jpg", backgroundRemovedUrl: null, shotType: "on_model" },
          { url: "https://images.example/overshirt.jpg", backgroundRemovedUrl: "https://cdn.channel3.test/overshirt.png", shotType: "hero" },
          { url: "https://images.example/overshirt-flat.jpg", backgroundRemovedUrl: null, shotType: "flat_lay" },
          { url: "https://images.example/overshirt-street.jpg", backgroundRemovedUrl: null, shotType: "lifestyle" },
          { url: "https://images.example/overshirt-cuff.jpg", backgroundRemovedUrl: null, shotType: "other" },
          { url: "https://images.example/overshirt-unsaid.jpg", backgroundRemovedUrl: null, shotType: null },
        ],
        offers: [
          {
            url: "https://northbound.example/p/overshirt",
            shopDomain: "northbound.example",
            price: 89.5,
            currency: "GBP",
            availability: "in_stock",
            condition: "new",
          },
          { url: "https://resale.example/overshirt", shopDomain: "resale.example", price: 40, currency: "GBP", availability: "in_stock", condition: "used" },
          { url: "https://shop.example/overshirt", shopDomain: "shop.example", price: 95, currency: "GBP", availability: "out_of_stock", condition: null },
        ],
      },
      {
        id: "p-tee",
        title: "Northbound Pocket Tee",
        description: null,
        colours: [],
        line: null,
        brandIds: ["brand-1"],
        images: [
          { url: "https://images.example/p-tee.jpg", backgroundRemovedUrl: "https://cdn.channel3.test/p-tee-cleaned.png", shotType: "hero" },
        ],
        offers: [{ url: "https://shop.example/products/1", shopDomain: "shop.example", price: 45, currency: "USD", availability: "in_stock", condition: "new" }],
      },
    ]);
  });

  it("never asks for a second page, even when Channel3 has one", async () => {
    channel3.respond = () => channel3Products([channel3Product("p-1")], "next-page-token");

    const products = await search.searchProducts({ brandId: "c3-northbound", category: "shoes", line: "menswear", market: "US", priceRange: null });

    expect(products.map((product) => product.id)).toEqual(["p-1"]);
    expect(channel3.requests).toHaveLength(1);
  });

  it("drops a Product Channel3 sends without an ID or title", async () => {
    channel3.respond = () => channel3Products([{ title: "No ID" }, { id: "p-untitled" }, channel3Product("p-1")]);

    const products = await search.searchProducts({ brandId: "c3-northbound", category: "top", line: "menswear", market: "US", priceRange: null });

    expect(products.map((product) => product.id)).toEqual(["p-1"]);
  });

  it("sends no price filter for a Brand with no price range, and the euro-wide market in its config", async () => {
    await search.searchProducts({ brandId: "c3-northbound", category: "top", line: "menswear", market: "EU", priceRange: null });

    const body = channel3.requests[0]!.body as { filters: object; config: object };
    expect(body.filters).not.toHaveProperty("price");
    expect(body.config).toEqual({ country: "EU" });
  });
});

describe("checking a Product", () => {
  it("asks Channel3's free Product detail for it in the market it was found in, and returns its offers there now", async () => {
    channel3.respond = () =>
      channel3ProductDetail(
        channel3Product("p-overshirt", {
          offers: [channel3Offer({ url: "https://northbound.example/p/overshirt", domain: "northbound.example", price: 79, currency: "EUR" })],
        }),
      );

    const check = await search.checkProduct({ productId: "p-overshirt", market: "EU" });

    expect(check).toEqual({
      gone: false,
      offers: [
        { url: "https://northbound.example/p/overshirt", shopDomain: "northbound.example", price: 79, currency: "EUR", availability: "in_stock", condition: "new" },
      ],
    });
    expect(channel3.requests).toHaveLength(1);
    const [request] = channel3.requests;
    expect(`${request!.method} ${request!.url.href}`).toBe("GET https://api.trychannel3.com/v1/products/p-overshirt?country=EU");
    expect([...request!.headers]).toEqual([["x-api-key", "test-channel3-key"]]);
  });

  it("finds it gone when Channel3 has no offer for it in the market", async () => {
    channel3.respond = () => channel3ProductDetail(channel3Product("p-overshirt", { offers: [] }));

    expect(await search.checkProduct({ productId: "p-overshirt", market: "GB" })).toEqual({ gone: true });
  });

  it("finds it gone when Channel3 no longer knows it", async () => {
    channel3.respond = () => channel3NotFound();

    expect(await search.checkProduct({ productId: "p-overshirt", market: "GB" })).toEqual({ gone: true });
  });
});

describe("what Channel3 receives", () => {
  it("is only the API key, a Brand's name and site, Channel3's own IDs, a Category, a line, a market and a price range: nothing that identifies a user", async () => {
    channel3.respond = ({ url }) => {
      if (url.pathname === "/v1/brands/search") return channel3Brands([channel3Brand("c3-a", "Northbound"), channel3Brand("c3-b", "Northbound")]);
      if (url.pathname.startsWith("/v1/websites/")) return channel3Website("site-1", "northbound.example");
      if (url.pathname === "/v1/browse") return channel3Products([channel3Product("p-1")]);
      return channel3ProductDetail(channel3Product("p-1"));
    };

    await search.findBrand({ name: "Northbound", officialSite: "https://www.northbound.example" });
    await search.searchProducts({ brandId: "c3-a", category: "one_piece", line: "womenswear", market: "FR", priceRange: { min: 30, max: 250 } });
    await search.checkProduct({ productId: "p-1", market: "FR" });

    expect(channel3.requests.map(({ method, url }) => `${method} ${url.pathname}`)).toEqual([
      "GET /v1/brands/search",
      "GET /v1/websites/northbound.example",
      "POST /v1/browse",
      "GET /v1/products/p-1",
    ]);
    for (const { headers, url, body } of channel3.requests) {
      // No x-user-id, which Channel3 would add to its buy links, and no cookie.
      expect([...headers.keys()].filter((name) => name !== "content-type")).toEqual(["x-api-key"]);
      expect([...url.searchParams.keys()].every((name) => ["query", "limit", "country"].includes(name))).toBe(true);
      if (body !== null) {
        const { filters, config, ...rest } = body as { filters: object; config: object };
        expect(Object.keys(rest)).toEqual(["limit"]);
        expect(Object.keys(config)).toEqual(["country"]);
        expect(Object.keys(filters).sort()).toEqual(["age", "availability", "brand_ids", "category_ids", "conditions", "gender", "price"]);
      }
    }
  });
});

describe("when Channel3 can't answer", () => {
  const SEARCH: ProductSearchQuery = { brandId: "c3-northbound", category: "top", line: "menswear", market: "US", priceRange: null };

  it("surfaces too many requests as an error to retry after the wait Channel3 asks for", async () => {
    channel3.respond = () => channel3TooManyRequests(5);

    const error = await search.searchProducts(SEARCH).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ProductSearchRateLimitedError);
    expect(error).toMatchObject({ retryAfterSeconds: 5 });
  });

  it("surfaces a refused API key as an error retrying can't fix, on every call", async () => {
    channel3.respond = () => channel3Forbidden();

    await expect(search.findBrand({ name: "Northbound", officialSite: null })).rejects.toBeInstanceOf(UnretryableProductSearchError);
    await expect(search.searchProducts(SEARCH)).rejects.toBeInstanceOf(UnretryableProductSearchError);
    await expect(search.checkProduct({ productId: "p-1", market: "US" })).rejects.toBeInstanceOf(UnretryableProductSearchError);
  });

  it.each([
    ["a request Channel3 rejects", 422],
    ["Channel3 asking for payment", 402],
    ["Channel3 failing", 500],
  ])("surfaces any other failure, such as %s, as an error the step retries", async (_, status) => {
    channel3.respond = () => Response.json({ detail: "Something went wrong" }, { status });

    const error = await search.searchProducts(SEARCH).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ message: `Channel3 answered ${status}.` });
    expect(error).not.toBeInstanceOf(UnretryableProductSearchError);
    expect(error).not.toBeInstanceOf(ProductSearchRateLimitedError);
  });
});
