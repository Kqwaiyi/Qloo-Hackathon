import { describe, expect, it } from "vitest";

import { COUNTRIES, findCountry } from "@/config/countries";

describe("the Country list", () => {
  it("holds every Country Gemini serves, once each", () => {
    expect(COUNTRIES).toHaveLength(230);
    expect(new Set(COUNTRIES.map((country) => country.code)).size).toBe(230);
  });

  it("leaves out the countries Gemini doesn't serve", () => {
    for (const code of ["CN", "HK", "MO", "RU", "IR", "CU", "BY", "KP", "SY"]) {
      expect(findCountry(code)).toBeUndefined();
    }
  });

  it("gives each Country an ISO code, a display name and a Qloo location query", () => {
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.name).not.toBe("");
      expect(country.qlooLocation).not.toBe("");
    }
    expect(findCountry("gb")).toEqual({
      code: "GB",
      name: "United Kingdom",
      qlooLocation: "United Kingdom",
      qlooKeyMarket: "urn:tag:key_market:qloo:united_kingdom",
    });
  });

  it("gives a Country Qloo's key_market tag for it, under Qloo's own name, only where Qloo has one", () => {
    expect(findCountry("CI")?.qlooKeyMarket).toBe("urn:tag:key_market:qloo:ivory_coast");
    expect(findCountry("FK")?.qlooKeyMarket).toBeNull();
    expect(COUNTRIES.filter((country) => country.qlooKeyMarket !== null)).toHaveLength(213);
  });
});
