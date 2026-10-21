import { describe, expect, it } from "vitest";

import { type ExchangeRates, outfitTotalText, priceText } from "./prices";

// How every price a user sees reads (spec: "Prices and currencies"): in their Country's currency,
// converted with the stored rates and marked "≈" when it was in another. Small hand-written prices
// and rates in, what the card shows out.

/** Units of each currency a US dollar bought on the day, rounded as Frankfurter gives them. */
const RATES: ExchangeRates = new Map([
  ["EUR", 0.89166],
  ["GBP", 0.74925],
  ["IDR", 17986],
  ["JPY", 158.13],
]);

describe("a price", () => {
  it("is shown as it is, in whole units, when it's in the viewer's Country's currency", () => {
    expect(priceText({ amount: 45, currency: "EUR" }, { countryCode: "FR", rates: RATES })).toBe("€45");
  });

  it('is converted into the viewer\'s Country\'s currency through the US dollar, and marked "≈", when it\'s in another', () => {
    // 45 dollars at 17,986 rupiah to the dollar.
    expect(priceText({ amount: 45, currency: "USD" }, { countryCode: "ID", rates: RATES })).toBe("≈ Rp 809,370");
    // 45 euros at 0.89166 to the dollar, and 0.74925 pounds.
    expect(priceText({ amount: 45, currency: "EUR" }, { countryCode: "GB", rates: RATES })).toBe("≈ £38");
  });

  it("is rounded to the nearest whole unit, whatever the currency's usual fraction digits", () => {
    expect(priceText({ amount: 59.9, currency: "EUR" }, { countryCode: "FR", rates: RATES })).toBe("€60");
    expect(priceText({ amount: 44.49, currency: "EUR" }, { countryCode: "FR", rates: RATES })).toBe("€44");
    // 45 euros is 907,711.46 rupiah, whose usual fraction digits have changed between ICU versions.
    expect(priceText({ amount: 45, currency: "EUR" }, { countryCode: "ID", rates: RATES })).toBe("≈ Rp 907,711");
    // 45 dollars is 7,115.85 yen.
    expect(priceText({ amount: 45, currency: "USD" }, { countryCode: "JP", rates: RATES })).toBe("≈ ¥7,116");
  });

  it("is written in English for the viewer's Country: its symbol for the currency, and digits grouped by commas", () => {
    expect(priceText({ amount: 1250, currency: "USD" }, { countryCode: "US", rates: RATES })).toBe("$1,250");
    expect(priceText({ amount: 1250, currency: "GBP" }, { countryCode: "GB", rates: RATES })).toBe("£1,250");
    // A foreign dollar says whose it is.
    expect(priceText({ amount: 1250, currency: "USD" }, { countryCode: "CA", rates: new Map([["CAD", 1.4051]]) })).toBe("≈ $1,756");
    expect(priceText({ amount: 1250, currency: "JPY" }, { countryCode: "JP", rates: RATES })).toBe("¥1,250");
  });

  it("stays in its own currency, unmarked, when no rate is stored for either currency, so it's never silently wrong", () => {
    expect(priceText({ amount: 45, currency: "USD" }, { countryCode: "ID", rates: new Map() })).toBe("US$45");
    expect(priceText({ amount: 45, currency: "SEK" }, { countryCode: "FR", rates: RATES })).toBe("SEK 45");
  });

  it("keeps a currency it can't read after the amount, as a seller gave it", () => {
    expect(priceText({ amount: 1250, currency: "US$" }, { countryCode: "US", rates: RATES })).toBe("1,250 US$");
  });
});

describe("an older Piece's Brand price range, in US dollars", () => {
  it("is shown as it is for a viewer whose Country's currency is the US dollar", () => {
    expect(priceText({ min: 20, max: 120 }, { countryCode: "US", rates: RATES })).toBe("$20–$120");
  });

  it('is converted end by end into any other viewer\'s Country\'s currency, and marked "≈"', () => {
    expect(priceText({ min: 20, max: 120 }, { countryCode: "ID", rates: RATES })).toBe("≈ Rp 359,720–Rp 2,158,320");
    // 14.985 to 89.91 pounds.
    expect(priceText({ min: 20, max: 120 }, { countryCode: "GB", rates: RATES })).toBe("≈ £15–£90");
  });

  it("is one price when both ends are the same in whole units", () => {
    expect(priceText({ min: 60, max: 60 }, { countryCode: "US", rates: RATES })).toBe("$60");
    expect(priceText({ min: 60.2, max: 59.8 }, { countryCode: "US", rates: RATES })).toBe("$60");
  });

  it("stays in US dollars, unmarked, when no rate is stored for the viewer's Country's currency", () => {
    expect(priceText({ min: 20, max: 120 }, { countryCode: "ID", rates: new Map() })).toBe("US$20–US$120");
  });
});

describe("a whole Outfit's total", () => {
  it("adds up its Products' prices, in whole units", () => {
    expect(outfitTotalText([price(45, "USD"), price(50.4, "USD"), price(59.9, "USD")], { countryCode: "US", rates: RATES })).toBe("$155");
  });

  it('adds them up converted into the viewer\'s Country\'s currency, marked "≈"', () => {
    expect(outfitTotalText([price(45, "USD"), price(50, "USD"), price(60, "USD")], { countryCode: "ID", rates: RATES })).toBe("≈ Rp 2,787,830");
    // 45 and 50 euros are 79.83 pounds.
    expect(outfitTotalText([price(45, "EUR"), price(50, "EUR")], { countryCode: "GB", rates: RATES })).toBe("≈ £80");
  });

  it("is a range when a Piece is priced only by its Brand's range, which it adds", () => {
    expect(outfitTotalText([price(45, "USD"), { min: 20, max: 120 }], { countryCode: "US", rates: RATES })).toBe("$65–$165");
    // 45 euros and 20–120 dollars are 52.80–127.72 pounds.
    expect(outfitTotalText([price(45, "EUR"), { min: 20, max: 120 }], { countryCode: "GB", rates: RATES })).toBe("≈ £53–£128");
    // Stride 60–180, Bolt 20–120 and Jeanery 50–110.
    expect(outfitTotalText([{ min: 60, max: 180 }, { min: 20, max: 120 }, { min: 50, max: 110 }], { countryCode: "US", rates: RATES })).toBe("$130–$410");
  });

  it("adds up in the prices' own currency when it can't convert them, and is nothing when that leaves them in different currencies", () => {
    expect(outfitTotalText([price(45, "USD"), { min: 20, max: 120 }], { countryCode: "ID", rates: new Map() })).toBe("US$65–US$165");
    expect(outfitTotalText([price(45, "SEK"), price(40, "EUR")], { countryCode: "FR", rates: RATES })).toBeNull();
  });

  it("is nothing with nothing priced, as for a Hairstyle-only Outfit", () => {
    expect(outfitTotalText([], { countryCode: "US", rates: RATES })).toBeNull();
  });
});

function price(amount: number, currency: string) {
  return { amount, currency };
}
