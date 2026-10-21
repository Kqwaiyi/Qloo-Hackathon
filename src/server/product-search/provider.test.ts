import { describe, expectTypeOf, it } from "vitest";

import type { BrandLookup, PriceRange, ProductCheck, ProductSearch, ProductSearchQuery } from "./provider";

// Checked by `npm run typecheck`: expectTypeOf does nothing at runtime. Adding a field to a request
// type fails these tests, so whoever adds one has to show it can't identify a user or link two
// calls to one.
describe("what the product search may receive", () => {
  it("is only a Brand's name and official site, to find the Brand", () => {
    expectTypeOf<Parameters<ProductSearch["findBrand"]>>().toEqualTypeOf<[BrandLookup]>();
    expectTypeOf<keyof BrandLookup>().toEqualTypeOf<"name" | "officialSite">();
  });

  it("is only its own Brand ID, a Category, a line, a market and a price range, to search a Brand's Products", () => {
    expectTypeOf<Parameters<ProductSearch["searchProducts"]>>().toEqualTypeOf<[ProductSearchQuery]>();
    expectTypeOf<keyof ProductSearchQuery>().toEqualTypeOf<"brandId" | "category" | "line" | "market" | "priceRange">();
    expectTypeOf<keyof PriceRange>().toEqualTypeOf<"min" | "max">();
  });

  it("is only its own Product ID and a market, to check a Product", () => {
    expectTypeOf<Parameters<ProductSearch["checkProduct"]>>().toEqualTypeOf<[ProductCheck]>();
    expectTypeOf<keyof ProductCheck>().toEqualTypeOf<"productId" | "market">();
  });

  it("has no field for a user ID, username, email, photo, Style Icon, or anything linking two calls to one user", () => {
    type RequestField = Lowercase<keyof BrandLookup | keyof ProductSearchQuery | keyof PriceRange | keyof ProductCheck>;
    type UserField = Extract<
      RequestField,
      `${string}${"user" | "mail" | "photo" | "image" | "styleicon" | "icon" | "consultation" | "styling" | "account" | "session" | "cookie"}${string}`
    >;
    expectTypeOf<UserField>().toBeNever();
  });
});
