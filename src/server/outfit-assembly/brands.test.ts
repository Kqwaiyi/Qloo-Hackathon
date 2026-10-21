import { describe, expect, it } from "vitest";

import type { QlooBrand, QlooBrandQuery } from "@/server/qloo/client";

import {
  type BrandMatches,
  type BrandPicks,
  brandPriceRange,
  brandQueries,
  brandsUsedBy,
  type BrandSearch,
  fullestPool,
  isThinPool,
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

/** No Brand looked up in the product search yet, so every Brand can be picked. */
const NONE_LOOKED_UP: BrandMatches = new Map();

const search: BrandSearch = { ageGroup: "35_44", countryCode: "GB", budgetTier: "no_budget" };

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
    expect(brandQueries(search, { entityId: "icon-1", line: "womenswear" })[0]).toEqual({
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
    expect(brandQueries(search, { entityId: "icon-1", line: "menswear" })[0]["signal.demographics.gender"]).toBe("male");
  });

  it("still sends the location of a Country Qloo has no key_market tag for, with no market tag", () => {
    const [query] = brandQueries({ ...search, countryCode: "FK" }, { entityId: "icon-1", line: "menswear" });

    expect(query["signal.location.query"]).toBe("Falkland Islands");
    expect(query["filter.tags"]).toEqual(["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:adults"]);
  });

  it("uses Qloo's own location and market names for the Country", () => {
    const [query] = brandQueries({ ...search, countryCode: "TR" }, { entityId: "icon-1", line: "menswear" });

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
    const [query] = brandQueries({ ...search, ageGroup }, { entityId: "icon-1", line: "womenswear" });

    expect(query["signal.demographics.age"]).toBe(qlooAge);
    expect(query["filter.tags"]).toContain(`urn:tag:target_age_group:qloo:${targetAgeGroup}`);
    expect(query["filter.tags"]!.filter((tag) => tag.startsWith("urn:tag:target_age_group:"))).toHaveLength(1);
  });

  it("refuses a Country that isn't on the list", () => {
    expect(() => brandQueries({ ...search, countryCode: "RU" }, { entityId: "icon-1", line: "menswear" })).toThrow();
  });
});

describe("the Brand query for a Budget Tier", () => {
  it.each([
    [
      "low",
      ["urn:tag:target_income_level:qloo:low_to_medium"],
      ["urn:tag:target_income_level:qloo:medium_to_high", "urn:tag:target_income_level:qloo:high"],
    ],
    [
      "medium",
      ["urn:tag:target_income_level:qloo:medium", "urn:tag:target_income_level:qloo:medium_to_high"],
      ["urn:tag:target_income_level:qloo:low"],
    ],
    [
      "expensive",
      ["urn:tag:target_income_level:qloo:high"],
      ["urn:tag:target_income_level:qloo:low", "urn:tag:target_income_level:qloo:low_to_medium", "urn:tag:target_income_level:qloo:medium"],
    ],
  ] as const)("for %s requires every one of its income levels and excludes the others", (budgetTier, required, excluded) => {
    const [query] = brandQueries({ ...search, budgetTier }, { entityId: "icon-1", line: "womenswear" });

    expect(query["operator.filter.tags"]).toBe("intersection");
    expect(query["filter.tags"]).toEqual([
      "urn:tag:genre:brand:fashion",
      "urn:tag:target_age_group:qloo:adults",
      "urn:tag:key_market:qloo:united_kingdom",
      ...required,
    ]);
    expect(query["filter.exclude.tags"]).toEqual(excluded);
  });

  it("for No Budget adds no income level and excludes nothing", () => {
    const [query] = brandQueries({ ...search, budgetTier: "no_budget" }, { entityId: "icon-1", line: "womenswear" });

    expect(query["filter.tags"]).toEqual([
      "urn:tag:genre:brand:fashion",
      "urn:tag:target_age_group:qloo:adults",
      "urn:tag:key_market:qloo:united_kingdom",
    ]);
    expect(query).not.toHaveProperty("filter.exclude.tags");
  });
});

describe("a thin pool's wider Brand queries", () => {
  /** What changes from one query to the next: the tags Brands must carry, and the popularity floor. */
  const steps = (queries: readonly QlooBrandQuery[]) =>
    queries.map((query) => ({ tags: query["filter.tags"], floor: query["filter.popularity.min"] }));

  it("widen one step at a time: the next age group, then no key_market tag, then a 0.95 floor, then no age tag", () => {
    const queries = brandQueries({ ageGroup: "18_24", countryCode: "GB", budgetTier: "no_budget" }, { entityId: "icon-1", line: "womenswear" });

    expect(steps(queries)).toEqual([
      {
        tags: ["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:young_adults", "urn:tag:key_market:qloo:united_kingdom"],
        floor: 0.98,
      },
      { tags: ["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:adults", "urn:tag:key_market:qloo:united_kingdom"], floor: 0.98 },
      { tags: ["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:adults"], floor: 0.98 },
      { tags: ["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:adults"], floor: 0.95 },
      { tags: ["urn:tag:genre:brand:fashion"], floor: 0.95 },
    ]);
  });

  it("keep the Budget Tier's income levels, the age and gender signals and the Country's location at every step", () => {
    const queries = brandQueries({ ageGroup: "45_54", countryCode: "GB", budgetTier: "expensive" }, { entityId: "icon-1", line: "menswear" });

    expect(queries).toHaveLength(5);
    for (const query of queries) {
      expect(query).toMatchObject({
        "signal.interests.entities": ["icon-1"],
        "signal.demographics.age": "45_to_54",
        "signal.demographics.gender": "male",
        "signal.location.query": "United Kingdom",
        "operator.filter.tags": "intersection",
        "filter.exclude.tags": [
          "urn:tag:target_income_level:qloo:low",
          "urn:tag:target_income_level:qloo:low_to_medium",
          "urn:tag:target_income_level:qloo:medium",
        ],
        take: 50,
      });
      expect(query["filter.tags"]).toContain("urn:tag:target_income_level:qloo:high");
    }
  });

  it.each([
    ["18_24", "young_adults", "adults"],
    ["25_29", "young_adults", "adults"],
    ["45_54", "middle_aged", "adults"],
    ["55_64", "middle_aged", "adults"],
    ["65_plus", "seniors", "middle_aged"],
  ] as const)("widen the %s age group from %s to %s", (ageGroup, from, to) => {
    const queries = brandQueries({ ...search, ageGroup }, { entityId: "icon-1", line: "womenswear" });

    expect(queries.slice(0, 2).map((query) => ageTags(query))).toEqual([
      [`urn:tag:target_age_group:qloo:${from}`],
      [`urn:tag:target_age_group:qloo:${to}`],
    ]);
  });

  it.each(["30_34", "35_44"] as const)("skip the next age group for the %s age group, which has none to widen to", (ageGroup) => {
    const queries = brandQueries({ ...search, ageGroup }, { entityId: "icon-1", line: "womenswear" });

    expect(steps(queries)).toEqual([
      { tags: ["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:adults", "urn:tag:key_market:qloo:united_kingdom"], floor: 0.98 },
      { tags: ["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:adults"], floor: 0.98 },
      { tags: ["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:adults"], floor: 0.95 },
      { tags: ["urn:tag:genre:brand:fashion"], floor: 0.95 },
    ]);
  });

  it("skip dropping the key_market tag for a Country Qloo has none for, still sending its location", () => {
    const queries = brandQueries({ ...search, ageGroup: "25_29", countryCode: "FK" }, { entityId: "icon-1", line: "womenswear" });

    expect(steps(queries)).toEqual([
      { tags: ["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:young_adults"], floor: 0.98 },
      { tags: ["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:adults"], floor: 0.98 },
      { tags: ["urn:tag:genre:brand:fashion", "urn:tag:target_age_group:qloo:adults"], floor: 0.95 },
      { tags: ["urn:tag:genre:brand:fashion"], floor: 0.95 },
    ]);
    expect(queries.map((query) => query["signal.location.query"])).toEqual(Array(4).fill("Falkland Islands"));
  });
});

describe("a thin pool", () => {
  const usable = (count: number) => Array.from({ length: count }, (_, index) => brand(`b-${index}`, `Brand ${index}`));
  const watchmakers = Array.from({ length: 5 }, (_, index) =>
    brand(`w-${index}`, `Watchmaker ${index}`, { tags: ["urn:tag:product_category:qloo:watches"] }),
  );

  it("has fewer than 10 usable Brands, however many Qloo sent", () => {
    expect(isThinPool([...usable(9), ...watchmakers], "womenswear", "no_budget")).toBe(true);
    expect(isThinPool(usable(10), "womenswear", "no_budget")).toBe(false);
  });

  it("counts only the Brands the Outfit's line can use at the Budget Tier", () => {
    const tenOneTooPricey = [...usable(9), brand("pricey", "Pricey", { priceRangeUsdMin: 200, priceRangeUsdMax: 900 })];
    const tenOneMenswearOnly = [...usable(9), brand("m", "Menswear only", { targetGender: ["Male"] })];

    expect(isThinPool(tenOneTooPricey, "womenswear", "no_budget")).toBe(false);
    expect(isThinPool(tenOneTooPricey, "womenswear", "low")).toBe(true);
    expect(isThinPool(tenOneMenswearOnly, "menswear", "no_budget")).toBe(false);
    expect(isThinPool(tenOneMenswearOnly, "womenswear", "no_budget")).toBe(true);
  });
});

describe("the Brands a thin pool's Outfits are built on", () => {
  const usable = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => brand(`${prefix}-${index}`, `${prefix} ${index}`));
  const menswearOnly = (count: number) => Array.from({ length: count }, (_, index) => brand(`m-${index}`, `Menswear ${index}`, { targetGender: ["Male"] }));

  it("are the last query's, once it gives enough usable Brands", () => {
    const tried = [usable("narrow", 4), usable("wider", 10)];

    expect(fullestPool(tried, "womenswear", "no_budget")).toBe(tried[1]);
  });

  it("are the query's with the most usable Brands for the line when every query left a thin pool", () => {
    // Womenswear can use 4, 6 and 3 of them; menswear 4, 8 and 9.
    const tried = [usable("narrow", 4), [...usable("wider", 6), ...menswearOnly(2)], [...usable("widest", 3), ...menswearOnly(6)]];

    expect(fullestPool(tried, "womenswear", "no_budget")).toBe(tried[1]);
    expect(fullestPool(tried, "menswear", "no_budget")).toBe(tried[2]);
  });

  it("are the narrower query's when two leave as many usable Brands, since it's closer to the age group and Country", () => {
    const tried = [usable("narrow", 6), usable("wider", 6), usable("widest", 3)];

    expect(fullestPool(tried, "womenswear", "no_budget")).toBe(tried[0]);
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
    expect(names(usableBrands(byGender, "menswear", "no_budget"))).toEqual(["Only Male", "Male and Female", "Gender-Neutral", "No target gender"]);
  });

  it("for womenswear include Female or don't include Male", () => {
    expect(names(usableBrands(byGender, "womenswear", "no_budget"))).toEqual([
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

    expect(names(usableBrands(brands, "womenswear", "no_budget"))).toEqual(["Apparel", "Footwear", "Shoes", "Sneakers"]);
  });

  it("leave out multi-brand retailers on the retailer denylist, by their Qloo entity ID", () => {
    const brands = [
      brand("BC0CE285-8053-4D87-9091-16F79874814B", "Farfetch"),
      brand("4C160FEA-FDB6-4DEC-99FC-13899680A0F4", "Foot Locker", { tags: [FOOTWEAR] }),
      brand("28FDFABF-8695-4DE6-9115-BF19EFE7C8F7", "Net a porter"),
      brand("own-label", "Farfetch"),
    ];

    expect(usableBrands(brands, "womenswear", "no_budget").map((kept) => kept.entityId)).toEqual(["own-label"]);
  });

  it("leave out merch shops, shapewear, bridal labels and flip-flops on the off-category denylist, by their Qloo entity ID", () => {
    const brands = [
      brand("1C3B73F4-DEFA-48F3-A5CD-0AA97AE36CD6", "Kylie Jenner Shop", { tags: [APPAREL] }),
      brand("7F9BB603-586C-4601-952F-9E547E6999B5", "Skims", { tags: [APPAREL] }),
      brand("725D8C8B-3643-4E0D-ADCF-3BA8EEAE3C81", "Galia Lahav", { tags: [APPAREL] }),
      brand("433AF5FB-C10A-42B6-AEDC-257B43D4EA19", "Havaianas"),
      brand("kept", "A label of everyday clothes", { tags: [APPAREL] }),
    ];

    expect(names(usableBrands(brands, "womenswear", "no_budget"))).toEqual(["A label of everyday clothes"]);
  });
});

describe("usable Brands' prices", () => {
  /** An apparel and footwear Brand for everyone, named by its prices. */
  const priced = (min: number | null, max: number | null) =>
    brand(`$${min ?? "?"}-$${max ?? "?"}`, `$${min ?? "?"}–$${max ?? "?"}`, { priceRangeUsdMin: min, priceRangeUsdMax: max });

  it("for Low top out at $300 or less, so a Brand without a top price is left out", () => {
    const brands = [priced(20, 300), priced(20, 301), priced(20, null), priced(null, 120)];

    expect(names(usableBrands(brands, "womenswear", "low"))).toEqual(["$20–$300", "$?–$120"]);
  });

  it("for Medium start at $150 or less, so a Brand without a starting price is left out", () => {
    const brands = [priced(150, 900), priced(151, 400), priced(null, 200), priced(40, null)];

    expect(names(usableBrands(brands, "womenswear", "medium"))).toEqual(["$150–$900", "$40–$?"]);
  });

  it("for Expensive start at $100 or more, so a Brand without a starting price is left out", () => {
    const brands = [priced(100, 2400), priced(99, 1500), priced(null, 3000), priced(450, null)];

    expect(names(usableBrands(brands, "womenswear", "expensive"))).toEqual(["$100–$2400", "$450–$?"]);
  });

  it("for No Budget can be anything, or unknown", () => {
    const brands = [priced(5, 20000), priced(null, null)];

    expect(names(usableBrands(brands, "womenswear", "no_budget"))).toEqual(["$5–$20000", "$?–$?"]);
  });

  it("decide which Brands an Outfit is built on, however high their affinity", () => {
    const brands = [
      brand("s1", "Pricey Stride", { tags: [FOOTWEAR], affinity: 0.95, priceRangeUsdMin: 90, priceRangeUsdMax: 450 }),
      brand("s2", "Sole", { tags: [FOOTWEAR], affinity: 0.9, priceRangeUsdMin: 40, priceRangeUsdMax: 90 }),
      brand("b", "Bolt", { tags: [APPAREL], affinity: 0.85, priceRangeUsdMin: 20, priceRangeUsdMax: 120 }),
    ];

    expect(pickedNames(pickBrands(brands, "womenswear", "low", NOTHING_USED, NONE_LOOKED_UP))).toEqual({ shoes: "Sole", top: "Bolt", bottom: "Bolt" });
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

    expect(pickedNames(pickBrands(brands, "womenswear", "no_budget", NOTHING_USED, NONE_LOOKED_UP))).toEqual({ shoes: "Cobble", top: "Bolt", bottom: "Dune" });
  });

  it("never give the Top or Bottom the Shoes' Brand", () => {
    const brands = [
      brand("a", "Allround", { tags: [APPAREL, FOOTWEAR], affinity: 0.95 }),
      brand("b", "Bolt", { tags: [APPAREL], affinity: 0.9 }),
      brand("d", "Dune", { tags: [APPAREL], affinity: 0.8 }),
    ];

    expect(pickedNames(pickBrands(brands, "womenswear", "no_budget", NOTHING_USED, NONE_LOOKED_UP))).toEqual({ shoes: "Allround", top: "Bolt", bottom: "Dune" });
  });

  it("prefer a denim Brand in the raw top 10 for the Bottom", () => {
    const brands = [
      brand("s", "Stride", { tags: [FOOTWEAR], affinity: 0.95 }),
      brand("b", "Bolt", { tags: [APPAREL], affinity: 0.9 }),
      brand("d", "Dune", { tags: [APPAREL], affinity: 0.85 }),
      brand("j", "Jeanery", { tags: [APPAREL, DENIM], affinity: 0.8 }),
    ];

    expect(pickedNames(pickBrands(brands, "menswear", "no_budget", NOTHING_USED, NONE_LOOKED_UP))).toEqual({ shoes: "Stride", top: "Bolt", bottom: "Jeanery" });
  });

  it("count a Brand tagged jeans as denim", () => {
    const brands = [
      brand("s", "Stride", { tags: [FOOTWEAR] }),
      brand("b", "Bolt", { tags: [APPAREL] }),
      brand("d", "Dune", { tags: [APPAREL] }),
      brand("j", "Jeanery", { tags: [APPAREL, "urn:tag:genre:brand:fashion:jeans"] }),
    ];

    expect(pickBrands(brands, "menswear", "no_budget", NOTHING_USED, NONE_LOOKED_UP)?.bottom.name).toBe("Jeanery");
  });

  it("take the denim Brand for the Bottom even when it's the Top's", () => {
    const brands = [
      brand("s", "Stride", { tags: [FOOTWEAR], affinity: 0.95 }),
      brand("j", "Jeanery", { tags: [APPAREL, DENIM], affinity: 0.9 }),
      brand("b", "Bolt", { tags: [APPAREL], affinity: 0.85 }),
    ];

    expect(pickedNames(pickBrands(brands, "menswear", "no_budget", NOTHING_USED, NONE_LOOKED_UP))).toEqual({ shoes: "Stride", top: "Jeanery", bottom: "Jeanery" });
  });

  it("don't prefer a denim Brand outside the raw top 10, counting Brands the filters dropped", () => {
    const brands = [
      brand("s", "Stride", { tags: [FOOTWEAR] }),
      brand("b", "Bolt", { tags: [APPAREL] }),
      brand("d", "Dune", { tags: [APPAREL] }),
      ...Array.from({ length: 7 }, (_, index) => brand(`w-${index}`, `Watchmaker ${index}`, { tags: ["urn:tag:product_category:qloo:watches"] })),
      brand("j", "Jeanery", { tags: [APPAREL, DENIM] }),
    ];

    expect(pickBrands(brands, "menswear", "no_budget", NOTHING_USED, NONE_LOOKED_UP)?.bottom.name).toBe("Dune");
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

    expect(pickedNames(pickBrands(brands, "womenswear", "no_budget", used, NONE_LOOKED_UP))).toEqual({ shoes: "Sole", top: "Dune", bottom: "Bolt" });
  });

  it("can't complete an Outfit without an unused footwear Brand", () => {
    const brands = [brand("s", "Stride", { tags: [FOOTWEAR] }), brand("b", "Bolt", { tags: [APPAREL] })];

    expect(pickBrands(brands, "womenswear", "no_budget", { ...NOTHING_USED, shoes: new Set(["s"]) }, NONE_LOOKED_UP)).toBeNull();
    expect(pickBrands([brand("b", "Bolt", { tags: [APPAREL] })], "womenswear", "no_budget", NOTHING_USED, NONE_LOOKED_UP)).toBeNull();
  });

  it("can't complete an Outfit when the only apparel Brand is the Shoes'", () => {
    expect(pickBrands([brand("a", "Allround", { tags: [APPAREL, FOOTWEAR] })], "womenswear", "no_budget", NOTHING_USED, NONE_LOOKED_UP)).toBeNull();
  });

  it("can't complete an Outfit when every apparel Brand left is already a Bottom", () => {
    const brands = [brand("s", "Stride", { tags: [FOOTWEAR] }), brand("b", "Bolt", { tags: [APPAREL] })];

    expect(pickBrands(brands, "womenswear", "no_budget", { ...NOTHING_USED, bottom: new Set(["b"]) }, NONE_LOOKED_UP)).toBeNull();
  });

  it("give the Bottom the Top's Brand when no other apparel Brand is left", () => {
    const brands = [brand("s", "Stride", { tags: [FOOTWEAR] }), brand("b", "Bolt", { tags: [APPAREL] })];

    expect(pickedNames(pickBrands(brands, "womenswear", "no_budget", NOTHING_USED, NONE_LOOKED_UP))).toEqual({ shoes: "Stride", top: "Bolt", bottom: "Bolt" });
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

    expect(pickBrands(brands, "menswear", "no_budget", NOTHING_USED, NONE_LOOKED_UP)).toEqual({
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
      "no_budget",
      2,
      NOTHING_USED,
      NONE_LOOKED_UP,
    );

    expect(plan.picked.map(({ styleIconId, brands }) => [styleIconId, pickedNames(brands)])).toEqual([
      ["icon-1", { shoes: "Stride", top: "Bolt", bottom: "Dune" }],
      ["icon-2", { shoes: "Sole", top: "Dune", bottom: "Bolt" }],
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("start from the Brands the Outfits already built use", () => {
    const used: UsedBrands = { shoes: new Set(["s1"]), top: new Set(["b"]), bottom: new Set(["d"]) };

    const plan = planOutfitBrands([{ styleIconId: "icon-3", line: "womenswear", brands: pool }], "no_budget", 1, used, NONE_LOOKED_UP);

    expect(plan.picked.map(({ brands }) => pickedNames(brands))).toEqual([{ shoes: "Sole", top: "Dune", bottom: "Bolt" }]);
  });

  it("treat a One-Piece Outfit's left-out Bottom Brand as used for a Bottom, though not for a Top", () => {
    const withDenim = [
      brand("s1", "Stride", { tags: [FOOTWEAR], affinity: 0.95 }),
      brand("s2", "Sole", { tags: [FOOTWEAR], affinity: 0.9 }),
      brand("j", "Jeanery", { tags: [APPAREL, DENIM], affinity: 0.88 }),
      brand("b", "Bolt", { tags: [APPAREL], affinity: 0.85 }),
    ];
    // That Outfit's Top and Bottom became one One-Piece on Bolt, so Jeanery was left out of it.
    const used = brandsUsedBy([{ top: "b", bottom: "j", shoes: "s1" }]);

    const plan = planOutfitBrands([{ styleIconId: "icon-2", line: "womenswear", brands: withDenim }], "no_budget", 1, used, NONE_LOOKED_UP);

    // Jeanery, denim in the raw top 10, would otherwise be the Bottom.
    expect(plan.picked.map(({ brands }) => pickedNames(brands))).toEqual([{ shoes: "Sole", top: "Jeanery", bottom: "Bolt" }]);
  });

  it("skip a Style Icon that can't complete an Outfit for the next, and stop once there are enough", () => {
    const plan = planOutfitBrands(
      [
        { styleIconId: "icon-1", line: "womenswear", brands: [brand("b", "Bolt", { tags: [APPAREL] })] },
        { styleIconId: "icon-2", line: "womenswear", brands: pool },
        { styleIconId: "icon-3", line: "womenswear", brands: pool },
        { styleIconId: "icon-4", line: "womenswear", brands: [] },
      ],
      "no_budget",
      2,
      NOTHING_USED,
      NONE_LOOKED_UP,
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
      "no_budget",
      2,
      NOTHING_USED,
      NONE_LOOKED_UP,
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
      "no_budget",
      2,
      NOTHING_USED,
      NONE_LOOKED_UP,
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

/** The query's `target_age_group` tags. */
function ageTags(query: QlooBrandQuery): string[] {
  return (query["filter.tags"] ?? []).filter((tag) => tag.startsWith("urn:tag:target_age_group:"));
}

function names(brands: readonly QlooBrand[]): string[] {
  return brands.map((kept) => kept.name);
}

/** Each Category's Brand name, or null when the Style Icon can't complete an Outfit. */
function pickedNames(picks: BrandPicks | null) {
  return picks && { shoes: picks.shoes.name, top: picks.top.name, bottom: picks.bottom.name };
}
