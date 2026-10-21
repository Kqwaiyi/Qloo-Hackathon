import { describe, expect, it } from "vitest";

import { COUNTRIES } from "@/config/countries";
import { countryCurrency } from "@/config/currencies";

describe("each Country's currency", () => {
  it("is exactly one ISO 4217 code for every one of the app's Countries", () => {
    for (const { code } of COUNTRIES) expect(countryCurrency(code)).toMatch(/^[A-Z]{3}$/);
  });

  it("is the Country's current legal tender, as the Unicode CLDR data has it", () => {
    expect(countryCurrency("ID")).toBe("IDR");
    expect(countryCurrency("GB")).toBe("GBP");
    expect(countryCurrency("FR")).toBe("EUR");
    expect(countryCurrency("CH")).toBe("CHF");
    // Territories use their sovereign's currency, and some Countries share one with their neighbours.
    expect(countryCurrency("PR")).toBe("USD");
    expect(countryCurrency("GL")).toBe("DKK");
    expect(countryCurrency("CI")).toBe("XOF");
  });

  it("is the euro in Bulgaria, which joined it on 2026-01-01", () => {
    expect(countryCurrency("BG")).toBe("EUR");
  });

  it.each([
    ["Antarctica", "AQ", "USD"],
    ["Panama", "PA", "USD"],
    ["Zimbabwe", "ZW", "USD"],
    ["Bhutan", "BT", "BTN"],
    ["Haiti", "HT", "HTG"],
    ["Lesotho", "LS", "LSL"],
    ["Namibia", "NA", "NAD"],
    ["Palestine", "PS", "ILS"],
    ["South Georgia and the South Sandwich Islands", "GS", "GBP"],
  ])("is the spec's choice for %s, where CLDR gives none or several", (_, code, currency) => {
    expect(countryCurrency(code)).toBe(currency);
  });

  it("is found by a code in any case, and refused for one that isn't a Country", () => {
    expect(countryCurrency("id")).toBe("IDR");
    expect(() => countryCurrency("CN")).toThrow();
  });
});
