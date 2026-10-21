import { describe, expect, it } from "vitest";

import { matchedBrand, normaliseBrandName, sameNameBrands } from "./brand-names";

describe("a Brand name, normalised", () => {
  it("is in lower case, with its accents removed", () => {
    expect(normaliseBrandName("HERMÈS")).toBe("hermes");
    expect(normaliseBrandName("Chloé")).toBe("chloe");
  });

  it("has its punctuation removed and its spaces collapsed", () => {
    expect(normaliseBrandName("A.P.C.")).toBe("apc");
    expect(normaliseBrandName("Levi's")).toBe("levis");
    expect(normaliseBrandName("  Johnny Dang & Co.  ")).toBe("johnny dang co");
  });

  it("drops a leading 'the', but no other", () => {
    expect(normaliseBrandName("The North Face")).toBe("north face");
    expect(normaliseBrandName("THE  Kooples")).toBe("kooples");
    expect(normaliseBrandName("Theory")).toBe("theory");
    expect(normaliseBrandName("Off the Hook")).toBe("off the hook");
  });
});

describe("the product search's Brands with a Qloo Brand's name", () => {
  it("are those whose normalised names are exactly the Qloo Brand's, never one merely like it", () => {
    const listed = [
      { id: "b1", name: "Nike SB" },
      { id: "b2", name: "NIKE" },
      { id: "b3", name: "Nikes" },
      { id: "b4", name: "The Nike" },
      { id: "b5", name: "Niké." },
    ];

    expect(sameNameBrands("Nike", listed).map((brand) => brand.id)).toEqual(["b2", "b4", "b5"]);
  });
});

describe("the Brand a Qloo Brand matches", () => {
  const GAP = { id: "b1", name: "Gap" };
  const GAP_SHOUTED = { id: "b2", name: "GAP" };
  const neverTied = () => false;

  it("is the one Brand with its name", () => {
    expect(matchedBrand([GAP], neverTied)).toBe(GAP);
  });

  it("is none when no Brand has its name", () => {
    expect(matchedBrand([], neverTied)).toBeNull();
  });

  it("is, of several with its name, the one tied to its official site", () => {
    expect(matchedBrand([GAP, GAP_SHOUTED], (brand) => brand === GAP_SHOUTED)).toBe(GAP_SHOUTED);
  });

  it("is none when several have its name and none is tied to its official site", () => {
    expect(matchedBrand([GAP, GAP_SHOUTED], neverTied)).toBeNull();
  });

  it("is none when several have its name and the official site can't tell them apart", () => {
    expect(matchedBrand([GAP, GAP_SHOUTED], () => true)).toBeNull();
  });
});
