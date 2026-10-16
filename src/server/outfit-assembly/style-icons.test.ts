import { describe, expect, it } from "vitest";

import type { QlooPerson } from "@/server/qloo/client";

import { ageGroupAt } from "./age-group";
import { rankStyleIcons, styleIconLines, styleIconQuery, type StyleIconSearch } from "./style-icons";

const search: StyleIconSearch = { ageGroup: "35_44", countryCode: "GB", photoStyle: ["edgy", "chic"] };

describe("the Style Icon query", () => {
  it("asks Qloo for well-known people in the line, popular with the age group and Country, in tune with the Photo Style", () => {
    expect(styleIconQuery(search, "womenswear")).toEqual({
      "filter.tags": [
        "urn:tag:occupation:person:model",
        "urn:tag:occupation:person:fashion_model",
        "urn:tag:occupation:person:singer",
        "urn:tag:occupation:person:rapper",
        "urn:tag:occupation:person:actor",
        "urn:tag:occupation:person:athlete",
        "urn:tag:occupation:person:influencer",
      ],
      "filter.exclude.tags": [
        "urn:tag:occupation:person:politician",
        "urn:tag:occupation:person:stand_up_comedian",
        "urn:tag:occupation:person:astronomer",
        "urn:tag:genre:person:comedian",
        "urn:tag:genre:person:academic",
        "urn:tag:genre:person:journalist",
        "urn:tag:genre:person:youtuber",
      ],
      "filter.gender": "female",
      "signal.demographics.gender": "female",
      "signal.demographics.age": "35_to_44",
      "signal.location.query": "United Kingdom",
      "signal.interests.tags": ["urn:tag:personal_style:qloo:edgy", "urn:tag:personal_style:qloo:chic"],
      "filter.popularity.min": 0.995,
      take: 50,
    });
  });

  it("filters and signals the gender of the line", () => {
    const menswear = styleIconQuery(search, "menswear");

    expect(menswear["filter.gender"]).toBe("male");
    expect(menswear["signal.demographics.gender"]).toBe("male");
  });

  it("sends a one-word Photo Style as one tag", () => {
    expect(styleIconQuery({ ...search, photoStyle: ["casual"] }, "menswear")["signal.interests.tags"]).toEqual([
      "urn:tag:personal_style:qloo:casual",
    ]);
  });

  it("sends the Country's own Qloo location, which can differ from its name", () => {
    expect(styleIconQuery({ ...search, countryCode: "US" }, "menswear")["signal.location.query"]).toBe("United States");
    expect(styleIconQuery({ ...search, countryCode: "BS" }, "menswear")["signal.location.query"]).toBe("The Bahamas");
  });

  it("refuses a Country that isn't on the list", () => {
    expect(() => styleIconQuery({ ...search, countryCode: "RU" }, "menswear")).toThrow();
  });

  it.each([
    [18, "24_and_younger"],
    [24, "24_and_younger"],
    [25, "25_to_29"],
    [29, "25_to_29"],
    [30, "30_to_34"],
    [34, "30_to_34"],
    [35, "35_to_44"],
    [44, "35_to_44"],
    [45, "45_to_54"],
    [54, "45_to_54"],
    [55, "55_and_older"],
    [64, "55_and_older"],
    [65, "55_and_older"],
    [90, "55_and_older"],
  ])("asks about someone aged %i as Qloo's %s", (age, qlooAge) => {
    const now = new Date("2026-10-16T12:00:00Z");
    const ageGroup = ageGroupAt(2026 - age, 10, now);

    expect(styleIconQuery({ ...search, ageGroup }, "womenswear")["signal.demographics.age"]).toBe(qlooAge);
  });

  it("counts a birthday from the first of its month, since only the birth year and month are kept", () => {
    const query = (now: string) => styleIconQuery({ ...search, ageGroup: ageGroupAt(2001, 11, new Date(now)) }, "menswear");

    expect(query("2026-10-31T23:59:59Z")["signal.demographics.age"]).toBe("24_and_younger");
    expect(query("2026-11-01T00:00:00Z")["signal.demographics.age"]).toBe("25_to_29");
  });
});

describe("the person calls", () => {
  it("makes one call in the user's own line for a menswear or womenswear user", () => {
    expect(styleIconLines("menswear")).toEqual(["menswear"]);
    expect(styleIconLines("womenswear")).toEqual(["womenswear"]);
  });

  it("makes two for a no-preference user, womenswear and then menswear", () => {
    expect(styleIconLines("no_preference")).toEqual(["womenswear", "menswear"]);
  });
});

describe("ranking Style Icons", () => {
  it("keeps Qloo's affinity order, and each Style Icon's line", () => {
    const ranked = rankStyleIcons({
      menswear: [person("a", "Ana", 0.81), person("b", "Ben", 0.93), person("c", "Cy", 0.87)],
    });

    expect(ranked).toEqual([
      { entityId: "b", name: "Ben", line: "menswear" },
      { entityId: "c", name: "Cy", line: "menswear" },
      { entityId: "a", name: "Ana", line: "menswear" },
    ]);
  });

  it("puts anyone without an affinity last, in the order Qloo sent them", () => {
    const ranked = rankStyleIcons({
      womenswear: [person("a", "Ana", null), person("b", "Bea", 0.7), person("c", "Cy", null)],
    });

    expect(ranked.map((icon) => icon.name)).toEqual(["Bea", "Ana", "Cy"]);
  });

  it("drops anyone with a date of death", () => {
    const ranked = rankStyleIcons({
      menswear: [person("a", "Ana", 0.9), { ...person("b", "Ben", 0.95), hasDateOfDeath: true }, person("c", "Cy", 0.8)],
    });

    expect(ranked.map((icon) => icon.name)).toEqual(["Ana", "Cy"]);
  });

  it("drops anyone on the Style Icon denylist by their Qloo entity ID, whatever Qloo calls them", () => {
    const ranked = rankStyleIcons({
      menswear: [
        person("8D14B185-0229-46EC-B024-C7B50980DBBF", "Liam Pane", 0.95),
        person("not-on-the-denylist", "Liam Payne", 0.9),
        person("CB6258A6-C9B8-45C8-81CD-45D6077DD981", "Conor McGregor", 0.85),
      ],
    });

    expect(ranked).toEqual([{ entityId: "not-on-the-denylist", name: "Liam Payne", line: "menswear" }]);
  });

  it("interleaves a no-preference user's lists, womenswear first, then carries on with the longer one", () => {
    const ranked = rankStyleIcons({
      menswear: [person("m1", "M1", 0.9), person("m2", "M2", 0.8)],
      womenswear: [person("w1", "W1", 0.7), person("w2", "W2", 0.6), person("w3", "W3", 0.5), person("w4", "W4", 0.4)],
    });

    expect(ranked.map(({ name, line }) => [name, line])).toEqual([
      ["W1", "womenswear"],
      ["M1", "menswear"],
      ["W2", "womenswear"],
      ["M2", "menswear"],
      ["W3", "womenswear"],
      ["W4", "womenswear"],
    ]);
  });

  it("keeps someone who comes back in both lists once, in the line they first appear in", () => {
    const ranked = rankStyleIcons({
      womenswear: [person("w1", "W1", 0.9), person("both", "Both", 0.8)],
      menswear: [person("both", "Both", 0.95), person("m2", "M2", 0.7)],
    });

    expect(ranked.map(({ name, line }) => [name, line])).toEqual([
      ["W1", "womenswear"],
      ["Both", "menswear"],
      ["M2", "menswear"],
    ]);
  });

  it("ranks nobody when Qloo found nobody", () => {
    expect(rankStyleIcons({ womenswear: [], menswear: [] })).toEqual([]);
  });
});

function person(entityId: string, name: string, affinity: number | null): QlooPerson {
  return { entityId, name, hasDateOfDeath: false, affinity };
}
