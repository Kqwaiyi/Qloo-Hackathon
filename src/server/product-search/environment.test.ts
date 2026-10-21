import { afterEach, describe, expect, it, vi } from "vitest";

import { productSearchFromEnvironment } from "./environment";
import { FakeProductSearch } from "./fake";
import { channel3Brand, channel3Brands, FakeChannel3Transport } from "./fake-channel3";

describe("switching Channel3 on", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("runs the fake product search unless PRODUCT_SEARCH says channel3, even with CHANNEL3_API_KEY set", () => {
    vi.stubEnv("PRODUCT_SEARCH", "");
    vi.stubEnv("CHANNEL3_API_KEY", "key-from-the-environment");

    expect(productSearchFromEnvironment()).toBeInstanceOf(FakeProductSearch);
  });

  it("runs Channel3 when PRODUCT_SEARCH says channel3, with CHANNEL3_API_KEY as its key", async () => {
    vi.stubEnv("PRODUCT_SEARCH", "channel3");
    vi.stubEnv("CHANNEL3_API_KEY", "key-from-the-environment");
    const channel3 = new FakeChannel3Transport();
    channel3.respond = () => channel3Brands([channel3Brand("c3-northbound", "Northbound")]);
    vi.stubGlobal("fetch", channel3.send);

    const found = await productSearchFromEnvironment().findBrand({ name: "Northbound", officialSite: null });

    expect(found).toEqual({ found: true, brandId: "c3-northbound" });
    expect(channel3.requests.map(({ headers }) => headers.get("x-api-key"))).toEqual(["key-from-the-environment"]);
  });

  it("can't run Channel3 without CHANNEL3_API_KEY", () => {
    vi.stubEnv("PRODUCT_SEARCH", "channel3");
    vi.stubEnv("CHANNEL3_API_KEY", "");

    expect(() => productSearchFromEnvironment()).toThrow("CHANNEL3_API_KEY must be set when PRODUCT_SEARCH is channel3.");
  });

  it("refuses a PRODUCT_SEARCH it doesn't know", () => {
    vi.stubEnv("PRODUCT_SEARCH", "exa");

    expect(() => productSearchFromEnvironment()).toThrow("PRODUCT_SEARCH must be one of: fake, channel3.");
  });
});
