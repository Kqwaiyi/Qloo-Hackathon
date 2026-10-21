import { describe, expect, it } from "vitest";

import { productSearchMarket } from "./markets";

describe("the market a Country searches", () => {
  it("is the Country's own for one of the product search's countries", () => {
    expect(productSearchMarket("GB")).toBe("GB");
  });

  it.each([
    ["Luxembourg", "LU"],
    ["Croatia", "HR"],
    ["Bulgaria (on the euro since 2026)", "BG"],
    ["Monaco (outside the EU)", "MC"],
    ["Réunion (a French overseas region)", "RE"],
  ])("is the euro-wide market for another Country on the euro: %s", (_, code) => {
    expect(productSearchMarket(code)).toBe("EU");
  });

  it("stays the Country's own for a Country on the euro that the product search sells in", () => {
    expect(productSearchMarket("FR")).toBe("FR");
  });

  it.each([
    ["Indonesia", "ID"],
    ["Japan", "JP"],
    ["Denmark (in the EU, but not on the euro)", "DK"],
  ])("is the US market for any other Country: %s", (_, code) => {
    expect(productSearchMarket(code)).toBe("US");
  });
});
