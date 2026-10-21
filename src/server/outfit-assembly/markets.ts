import { countryCurrency } from "@/config/currencies";
import { EURO_MARKET, FALLBACK_MARKET, PRODUCT_SEARCH_COUNTRY_MARKETS, type ProductSearchMarket } from "@/config/product-search";

// Which market a Country's Products come from (spec: "Markets"). Pure: a Styling chooses it once,
// from the user's Country at its start.

/**
 * The market a Country searches: its own when the product search sells there, the euro-wide market
 * for any other Country on the euro, and the US market for every other Country.
 */
export function productSearchMarket(countryCode: string): ProductSearchMarket {
  const code = countryCode.toUpperCase();
  if ((PRODUCT_SEARCH_COUNTRY_MARKETS as readonly string[]).includes(code)) return code as ProductSearchMarket;
  return countryCurrency(code) === "EUR" ? EURO_MARKET : FALLBACK_MARKET;
}
