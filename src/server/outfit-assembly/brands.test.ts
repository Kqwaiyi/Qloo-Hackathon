import { describe, expect, it } from "vitest";

import type { QlooBrand } from "@/server/qloo/client";

import {
  type BrandPicks,
  brandPriceRange,
  brandQuery,
  type BrandSearch,
  needsBrands,
  outfitPriceRange,
  pickBrands,
  planOutfitBrands,
  usableBrands,
  type UsedBrands,
  visitUrl,
} from "./brands";
import { outfitCategories } from "./categories";

const APPAREL = "urn:tag:product_category:qloo:apparel";
const FOOTWEAR = "urn:tag:product_category:qloo:footwear";
const DENIM = "urn:tag:product_category:qloo:denim";

const NOTHING_USED: UsedBrands = { top: new Set(), bottom: new Set(), shoes: new Set() };

const search: BrandSearch = { ageGroup: "35_44", countryCode: "GB" };

describe("Brand calls", () => {
  it.each([
    ["a Full-Body Photo", { photoType: "full_body", hairCovered: false }],
    ["a Full-Body Photo with covered hair", { photoType: "full_body", hairCovered: true }],
    ["a Body-Only Photo", { photoType: "body_only", hairCovered: false }],
  ] as const)("are made for %s, whose Top, Bottom and Shoes are built on Brands", (_, photo) => {
    expect(needsBrands(outfitCategories(photo))).toBe(true);
  });

  it("aren't made for a Face Photo, whose Outfits are a Hairstyle only", () => {
    expect(needsBrands(outfitCategories({ photoType: "face", hairCovered: false }))).toBe(false);
  });
});

describe("the Brand query", () => {
  it("asks Qloo for fashion Brands the Style Icon's fans favour, popular with the age group and Country, in the Outfit's line", () => {
    expect(brandQuery(search, { entityId: "icon-1", line: "womenswear" })).toEqual({
      "signal.interests.entities": ["icon-1"],
      "signal.demographics.age": "35_to_44",
      "signal.demographics.gender": "female",
      "signal.location.query": "United Kingdom",
      "operator.filter.tags": "intersection",
      "filter.tags": [
        "urn:tag:genre:brand:fashion",
        "urn:tag:target_age_group:qloo:adults",
        "urn:tag:key_market:qloo:united_kingdom",
      ],
      "filter.popularity.min": 0.98,
      take: 50,
    });
  });

  it("signals the gender of the Outfit's line", () => {
    expect(brandQuery(search, { entityId: "icon-1", line: "menswear" })["signal.demographics.gender"]).toBe("male");
  });

  it("still sends the location of a Country Qloo has no key_market tag for, with no market tag", () => {
    const query = brandQuery({ ...search, countryCode: "FK" }, { entityId: "icon-1", line: "menswear" });

    expect(query["signal.location.query"]).toBe("Falkland Islands");
    expect(query["filter.tags"]).toEqual(["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:adults"]);
  });

  it("uses Qloo's own location and market names for the Country", () => {
    const query = brandQuery({ ...search, countryCode: "TR" }, { entityId: "icon-1", line: "menswear" });

    expect(query["signal.location.query"]).toBe("Turkey");
    expect(query["filter.tags"]).toContain("urn:tag:key_market:qloo:turkey");
  });

  it.each([
    ["18_24", "24_and_younger", "young_adults"],
    ["25_29", "25_to_29", "young_adults"],
    ["30_34", "30_to_34", "adults"],
    ["35_44", "35_to_44", "adults"],
    ["45_54", "45_to_54", "middle_aged"],
    ["55_64", "55_and_older", "middle_aged"],
    ["65_plus", "55_and_older", "seniors"],
  ] as const)("asks for the %s age group's Brands as Qloo's %s, tagged %s", (ageGroup, qlooAge, targetAgeGroup) => {
    const query = brandQuery({ ...search, ageGroup }, { entityId: "icon-1", line: "womenswear" });

    expect(query["signal.demographics.age"]).toBe(qlooAge);
    expect(query["filter.tags"]).toContain(`urn:tag:target_age_group:qloo:${targetAgeGroup}`);
    expect(query["filter.tags"]!.filter((tag) => tag.startsWith("urn:tag:target_age_group:"))).toHaveLength(1);
  });

  it("refuses a Country that isn't on the list", () => {
    expect(() => brandQuery({ ...search, countryCode: "RU" }, { entityId: "icon-1", line: "menswear" })).toThrow();
  });
});

describe("usable Brands", () => {
  const byGender = [
    brand("m", "Only Male", { targetGender: ["Male"] }),
    brand("f", "Only Female", { targetGender: ["Female"] }),
    brand("mf", "Male and Female", { targetGender: ["Male", "Female"] }),
    brand("fn", "Female and Gender-Neutral", { targetGender: ["Female", "Gender-Neutral"] }),
    brand("n", "Gender-Neutral", { targetGender: ["Gender-Neutral"] }),
    brand("none", "No target gender", { targetGender: [] }),
  ];

  it("for menswear include Male or don't include Female", () => {
    expect(names(usableBrands(byGender, "menswear"))).toEqual(["Only Male", "Male and Female", "Gender-Neutral", "No target gender"]);
  });

  it("for womenswear include Female or don't include Male", () => {
    expect(names(usableBrands(byGender, "womenswear"))).toEqual([
      "Only Female",
      "Male and Female",
      "Female and Gender-Neutral",
      "Gender-Neutral",
      "No target gender",
    ]);
  });

  it("are only those tagged apparel, or footwear, shoes or sneakers, which drops watches, jewellery, eyewear and lingerie", () => {
    const brands = [
      brand("apparel", "Apparel", { tags: [APPAREL] }),
      brand("footwear", "Footwear", { tags: [FOOTWEAR] }),
      brand("shoes", "Shoes", { tags: ["urn:tag:product_category:qloo:shoes"] }),
      brand("sneakers", "Sneakers", { tags: ["urn:tag:product_category:qloo:sneakers", "urn:tag:genre:brand:fashion:footwear:sneakers"] }),
      brand("watches", "Watches", { tags: ["urn:tag:product_category:qloo:watches", "urn:tag:genre:brand:fashion:accessories:watches"] }),
      brand("jewellery", "Jewellery", { tags: ["urn:tag:product_category:qloo:fine_jewelry"] }),
      brand("eyewear", "Eyewear", { tags: ["urn:tag:product_category:qloo:eyewear"] }),
      brand("lingerie", "Lingerie", { tags: ["urn:tag:product_category:qloo:lingerie", "urn:tag:genre:brand:fashion:lingerie_and_sleepwear"] }),
      brand("untagged", "No category tag", { tags: [] }),
    ];

    expect(names(usableBrands(brands, "womenswear"))).toEqual(["Apparel", "Footwear", "Shoes", "Sneakers"]);
  });

  it("leave out multi-brand retailers on the retailer denylist, by their Qloo entity ID", () => {
    const brands = [
      brand("BC0CE285-8053-4D87-9091-16F79874814B", "Farfetch"),
      brand("4C160FEA-FDB6-4DEC-99FC-13899680A0F4", "Foot Locker", { tags: [FOOTWEAR] }),
      brand("28FDFABF-8695-4DE6-9115-BF19EFE7C8F7", "Net a porter"),
      brand("own-label", "Farfetch"),
    ];

    expect(usableBrands(brands, "womenswear").map((kept) => kept.entityId)).toEqual(["own-label"]);
  });

  it("leave out merch shops, shapewear, bridal labels and flip-flops on the off-category denylist, by their Qloo entity ID", () => {
    const brands = [
      brand("1C3B73F4-DEFA-48F3-A5CD-0AA97AE36CD6", "Kylie Jenner Shop", { tags: [APPAREL] }),
      brand("7F9BB603-586C-4601-952F-9E547E6999B5", "Skims", { tags: [APPAREL] }),
      brand("725D8C8B-3643-4E0D-ADCF-3BA8EEAE3C81", "Galia Lahav", { tags: [APPAREL] }),
      brand("433AF5FB-C10A-42B6-AEDC-257B43D4EA19", "Havaianas"),
      brand("kept", "A label of everyday clothes", { tags: [APPAREL] }),
    ];

    expect(names(usableBrands(brands, "womenswear"))).toEqual(["A label of everyday clothes"]);
  });
});

describe("an Outfit's Brands", () => {
  it("are the highest-affinity footwear Brand for the Shoes, then the highest-affinity apparel Brand for the Top, then the next for the Bottom", () => {
    const brands = [
      brand("d", "Dune", { tags: [APPAREL], affinity: 0.8 }),
      brand("b", "Bolt", { tags: [APPAREL], affinity: 0.9 }),
      brand("c", "Cobble", { tags: [FOOTWEAR], affinity: 0.85 }),
      brand("e", "Ember", { tags: [APPAREL], affinity: 0.7 }),
    ];

    expect(pickedNames(pickBrands(brands, "womenswear", NOTHING_USED))).toEqual({ shoes: "Cobble", top: "Bolt", bottom: "Dune" });
  });

  it("never give the Top or Bottom the Shoes' Brand", () => {
    const brands = [
      brand("a", "Allround", { tags: [APPAREL, FOOTWEAR], affinity: 0.95 }),
      brand("b", "Bolt", { tags: [APPAREL], affinity: 0.9 }),
      brand("d", "Dune", { tags: [APPAREL], affinity: 0.8 }),
    ];

    expect(pickedNames(pickBrands(brands, "womenswear", NOTHING_USED))).toEqual({ shoes: "Allround", top: "Bolt", bottom: "Dune" });
  });

  it("prefer a denim Brand in the raw top 10 for the Bottom", () => {
    const brands = [
      brand("s", "Stride", { tags: [FOOTWEAR], affinity: 0.95 }),
      brand("b", "Bolt", { tags: [APPAREL], affinity: 0.9 }),
      brand("d", "Dune", { tags: [APPAREL], affinity: 0.85 }),
      brand("j", "Jeanery", { tags: [APPAREL, DENIM], affinity: 0.8 }),
    ];

    expect(pickedNames(pickBrands(brands, "menswear", NOTHING_USED))).toEqual({ shoes: "Stride", top: "Bolt", bottom: "Jeanery" });
  });

  it("count a Brand tagged jeans as denim", () => {
    const brands = [
      brand("s", "Stride", { tags: [FOOTWEAR] }),
      brand("b", "Bolt", { tags: [APPAREL] }),
      brand("d", "Dune", { tags: [APPAREL] }),
      brand("j", "Jeanery", { tags: [APPAREL, "urn:tag:genre:brand:fashion:jeans"] }),
    ];

    expect(pickBrands(brands, "menswear", NOTHING_USED)?.bottom.name).toBe("Jeanery");
  });

  it("take the denim Brand for the Bottom even when it's the Top's", () => {
    const brands = [
      brand("s", "Stride", { tags: [FOOTWEAR], affinity: 0.95 }),
      brand("j", "Jeanery", { tags: [APPAREL, DENIM], affinity: 0.9 }),
      brand("b", "Bolt", { tags: [APPAREL], affinity: 0.85 }),
    ];

    expect(pickedNames(pickBrands(brands, "menswear", NOTHING_USED))).toEqual({ shoes: "Stride", top: "Jeanery", bottom: "Jeanery" });
  });

  it("don't prefer a denim Brand outside the raw top 10, counting Brands the filters dropped", () => {
    const brands = [
      brand("s", "Stride", { tags: [FOOTWEAR] }),
      brand("b", "Bolt", { tags: [APPAREL] }),
      brand("d", "Dune", { tags: [APPAREL] }),
      ...Array.from({ length: 7 }, (_, index) => brand(`w-${index}`, `Watchmaker ${index}`, { tags: ["urn:tag:product_category:qloo:watches"] })),
      brand("j", "Jeanery", { tags: [APPAREL, DENIM] }),
    ];

    expect(pickBrands(brands, "menswear", NOTHING_USED)?.bottom.name).toBe("Dune");
  });

  it("skip a Brand already used in the same Category, but not one used in another", () => {
    const brands = [
      brand("s1", "Stride", { tags: [FOOTWEAR], affinity: 0.95 }),
      brand("s2", "Sole", { tags: [FOOTWEAR], affinity: 0.9 }),
      brand("b", "Bolt", { tags: [APPAREL], affinity: 0.85 }),
      brand("d", "Dune", { tags: [APPAREL], affinity: 0.8 }),
      brand("e", "Ember", { tags: [APPAREL], affinity: 0.7 }),
    ];
    const used: UsedBrands = { shoes: new Set(["s1"]), top: new Set(["b"]), bottom: new Set(["d"]) };

    expect(pickedNames(pickBrands(brands, "womenswear", used))).toEqual({ shoes: "Sole", top: "Dune", bottom: "Bolt" });
  });

  it("can't complete an Outfit without an unused footwear Brand", () => {
    const brands = [brand("s", "Stride", { tags: [FOOTWEAR] }), brand("b", "Bolt", { tags: [APPAREL] })];

    expect(pickBrands(brands, "womenswear", { ...NOTHING_USED, shoes: new Set(["s"]) })).toBeNull();
    expect(pickBrands([brand("b", "Bolt", { tags: [APPAREL] })], "womenswear", NOTHING_USED)).toBeNull();
  });

  it("can't complete an Outfit when the only apparel Brand is the Shoes'", () => {
    expect(pickBrands([brand("a", "Allround", { tags: [APPAREL, FOOTWEAR] })], "womenswear", NOTHING_USED)).toBeNull();
  });

  it("can't complete an Outfit when every apparel Brand left is already a Bottom", () => {
    const brands = [brand("s", "Stride", { tags: [FOOTWEAR] }), brand("b", "Bolt", { tags: [APPAREL] })];

    expect(pickBrands(brands, "womenswear", { ...NOTHING_USED, bottom: new Set(["b"]) })).toBeNull();
  });

  it("give the Bottom the Top's Brand when no other apparel Brand is left", () => {
    const brands = [brand("s", "Stride", { tags: [FOOTWEAR] }), brand("b", "Bolt", { tags: [APPAREL] })];

    expect(pickedNames(pickBrands(brands, "womenswear", NOTHING_USED))).toEqual({ shoes: "Stride", top: "Bolt", bottom: "Bolt" });
  });

  it("keep each Brand's name, Qloo product categories, price range and official site", () => {
    const brands = [
      brand("s", "Stride", {
        tags: [FOOTWEAR, "urn:tag:product_category:qloo:sneakers", "urn:tag:genre:brand:fashion:footwear:sneakers"],
        priceRangeUsdMin: 60,
        priceRangeUsdMax: 180,
        officialSite: "https://stride.example/",
      }),
      brand("t", "Thread", { tags: [APPAREL, "urn:tag:product_category:qloo:outerwear"], priceRangeUsdMin: null, priceRangeUsdMax: null, officialSite: null }),
    ];

    expect(pickBrands(brands, "menswear", NOTHING_USED)).toEqual({
      shoes: { entityId: "s", name: "Stride", categoryTags: ["footwear", "sneakers"], priceRangeUsdMin: 60, priceRangeUsdMax: 180, officialSite: "https://stride.example/" },
      top: { entityId: "t", name: "Thread", categoryTags: ["apparel", "outerwear"], priceRangeUsdMin: null, priceRangeUsdMax: null, officialSite: null },
      bottom: { entityId: "t", name: "Thread", categoryTags: ["apparel", "outerwear"], priceRangeUsdMin: null, priceRangeUsdMax: null, officialSite: null },
    });
  });
});

describe("the Brands of the Outfits a Styling builds", () => {
  const pool = [
    brand("s1", "Stride", { tags: [FOOTWEAR], affinity: 0.95 }),
    brand("s2", "Sole", { tags: [FOOTWEAR], affinity: 0.9 }),
    brand("b", "Bolt", { tags: [APPAREL], affinity: 0.85 }),
    brand("d", "Dune", { tags: [APPAREL], affinity: 0.8 }),
    brand("e", "Ember", { tags: [APPAREL], affinity: 0.7 }),
  ];

  it("never repeat a Brand within a Category, even when two Style Icons' fans favour the same Brands", () => {
    const plan = planOutfitBrands(
      [
        { styleIconId: "icon-1", line: "womenswear", brands: pool },
        { styleIconId: "icon-2", line: "womenswear", brands: pool },
      ],
      2,
      NOTHING_USED,
    );

    expect(plan.picked.map(({ styleIconId, brands }) => [styleIconId, pickedNames(brands)])).toEqual([
      ["icon-1", { shoes: "Stride", top: "Bolt", bottom: "Dune" }],
      ["icon-2", { shoes: "Sole", top: "Dune", bottom: "Bolt" }],
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("start from the Brands the Outfits already built use", () => {
    const used: UsedBrands = { shoes: new Set(["s1"]), top: new Set(["b"]), bottom: new Set(["d"]) };

    const plan = planOutfitBrands([{ styleIconId: "icon-3", line: "womenswear", brands: pool }], 1, used);

    expect(plan.picked.map(({ brands }) => pickedNames(brands))).toEqual([{ shoes: "Sole", top: "Dune", bottom: "Bolt" }]);
  });

  it("skip a Style Icon that can't complete an Outfit for the next, and stop once there are enough", () => {
    const plan = planOutfitBrands(
      [
        { styleIconId: "icon-1", line: "womenswear", brands: [brand("b", "Bolt", { tags: [APPAREL] })] },
        { styleIconId: "icon-2", line: "womenswear", brands: pool },
        { styleIconId: "icon-3", line: "womenswear", brands: pool },
        { styleIconId: "icon-4", line: "womenswear", brands: [] },
      ],
      2,
      NOTHING_USED,
    );

    expect(plan.picked.map(({ styleIconId }) => styleIconId)).toEqual(["icon-2", "icon-3"]);
    expect(plan.skipped).toEqual(["icon-1"]);
  });

  it("leave a Style Icon held back only by another planned Outfit's Brands for a later plan, without skipping it", () => {
    const sameAsFirst = [
      brand("s1", "Stride", { tags: [FOOTWEAR], affinity: 0.95 }),
      brand("b", "Bolt", { tags: [APPAREL], affinity: 0.85 }),
      brand("d", "Dune", { tags: [APPAREL], affinity: 0.8 }),
    ];

    const plan = planOutfitBrands(
      [
        { styleIconId: "icon-1", line: "womenswear", brands: pool },
        { styleIconId: "icon-2", line: "womenswear", brands: sameAsFirst },
        { styleIconId: "icon-3", line: "womenswear", brands: pool },
      ],
      2,
      NOTHING_USED,
    );

    expect(plan.picked.map(({ styleIconId }) => styleIconId)).toEqual(["icon-1", "icon-3"]);
    expect(plan.skipped).toEqual([]);
  });

  it("use each Style Icon's own line for the Style Preference rule", () => {
    const menswearOnly = [brand("ms", "Menswear Shoes", { tags: [FOOTWEAR], targetGender: ["Male"] }), brand("mc", "Menswear Clothes", { tags: [APPAREL], targetGender: ["Male"] })];

    const plan = planOutfitBrands(
      [
        { styleIconId: "icon-w", line: "womenswear", brands: menswearOnly },
        { styleIconId: "icon-m", line: "menswear", brands: menswearOnly },
      ],
      2,
      NOTHING_USED,
    );

    expect(plan.picked.map(({ styleIconId }) => styleIconId)).toEqual(["icon-m"]);
    expect(plan.skipped).toEqual(["icon-w"]);
  });
});

describe("price ranges", () => {
  it("are a Brand's price_range_usd_min to max", () => {
    expect(brandPriceRange(20, 120)).toEqual({ min: 20, max: 120 });
  });

  it("are missing for a Brand without both ends", () => {
    expect(brandPriceRange(20, null)).toBeNull();
    expect(brandPriceRange(null, 120)).toBeNull();
    expect(brandPriceRange(null, null)).toBeNull();
  });

  it("sum an Outfit's Brand Pieces' minimums and maximums", () => {
    expect(outfitPriceRange([{ min: 20, max: 120 }, { min: 60, max: 180 }, { min: 10, max: 40 }])).toEqual({ min: 90, max: 340 });
  });

  it("leave a Piece with no price data out of the Outfit's sum", () => {
    expect(outfitPriceRange([{ min: 20, max: 120 }, null, { min: 10, max: 40 }])).toEqual({ min: 30, max: 160 });
  });

  it("give an Outfit none when none of its Pieces has price data", () => {
    expect(outfitPriceRange([null, null])).toBeNull();
    expect(outfitPriceRange([])).toBeNull();
  });
});

describe("the Visit link", () => {
  it("goes to the Brand's official site when it's an https URL", () => {
    expect(visitUrl("https://www.stride.example/en")).toBe("https://www.stride.example/en");
  });

  it("is left out for any other official site, or none", () => {
    expect(visitUrl("http://www.stride.example/")).toBeNull();
    expect(visitUrl("www.stride.example")).toBeNull();
    expect(visitUrl("javascript:alert(1)")).toBeNull();
    expect(visitUrl("")).toBeNull();
    expect(visitUrl(null)).toBeNull();
  });
});

/** A Brand as Qloo's client hands it over: an apparel and footwear Brand for everyone, unless overridden. */
function brand(entityId: string, name: string, overrides: Partial<QlooBrand> = {}): QlooBrand {
  return {
    entityId,
    name,
    tags: [APPAREL, FOOTWEAR],
    targetGender: ["Male", "Female"],
    priceRangeUsdMin: 20,
    priceRangeUsdMax: 120,
    officialSite: `https://${entityId}.example`,
    affinity: null,
    ...overrides,
  };
}

function names(brands: readonly QlooBrand[]): string[] {
  return brands.map((kept) => kept.name);
}

/** Each Category's Brand name, or null when the Style Icon can't complete an Outfit. */
function pickedNames(picks: BrandPicks | null) {
  return picks && { shoes: picks.shoes.name, top: picks.top.name, bottom: picks.bottom.name };
}
