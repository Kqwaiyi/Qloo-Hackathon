import { describe, expect, it } from "vitest";

import { outfitCategories } from "./categories";

describe("the Categories an Outfit fills", () => {
  it("are the Hairstyle only for a Face Photo", () => {
    expect(outfitCategories({ photoType: "face", hairCovered: false })).toEqual(["hairstyle"]);
  });

  it("are all four for a Full-Body Photo", () => {
    expect(outfitCategories({ photoType: "full_body", hairCovered: false })).toEqual(["hairstyle", "top", "bottom", "shoes"]);
  });

  it("leave out the Hairstyle for a Full-Body Photo with covered hair", () => {
    expect(outfitCategories({ photoType: "full_body", hairCovered: true })).toEqual(["top", "bottom", "shoes"]);
  });

  it("are Top, Bottom and Shoes for a Body-Only Photo", () => {
    expect(outfitCategories({ photoType: "body_only", hairCovered: false })).toEqual(["top", "bottom", "shoes"]);
  });
});
