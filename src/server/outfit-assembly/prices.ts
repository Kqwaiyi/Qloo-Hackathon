import type { Price, PriceRangeUsd } from "@/config/consultations";
import { countryCurrency, isCurrencyCode } from "@/config/currencies";

// How every price a user sees reads (spec: "Prices and currencies"). Pure: the caller reads the
// stored rates.

/** How many units of each currency a US dollar buys, by its ISO 4217 code. */
export type ExchangeRates = ReadonlyMap<string, number>;

/**
 * Whom prices are shown to, by their Country: the user, or for a landing page sample, the sample's.
 * Prices are shown in the Country's currency, converted with `rates`, and written in its English.
 */
export interface PriceViewer {
  countryCode: string;
  rates: ExchangeRates;
}

/** A range of amounts: a single price runs from itself to itself. */
interface AmountRange {
  min: number;
  max: number;
}

/** A price, or a range of prices, in one currency. */
type Amounts = AmountRange & { currency: string };

/** Amounts as they're shown, and whether they were converted from another currency to be. */
type ShownAmounts = Amounts & { converted: boolean };

/**
 * A Product's price, or an older Piece's Brand price range in US dollars, as the viewer is shown it:
 * in whole units of their Country's currency, marked "≈" when it was converted from another, such
 * as "≈ Rp 809,370" or "$20–$120". With no rate stored for either currency, it stays in its own,
 * unmarked.
 */
export function priceText(price: Price | PriceRangeUsd, viewer: PriceViewer): string {
  return amountsText(inCountryCurrency(amountsOf(price), viewer), viewer.countryCode);
}

/**
 * "Whole Outfit about …": its Products' prices added up, as the viewer is shown them. A Piece priced
 * only by its Brand's range adds that range, making the total a range. Null with nothing priced, or
 * when prices that can't be converted leave them in different currencies.
 */
export function outfitTotalText(prices: readonly (Price | PriceRangeUsd)[], viewer: PriceViewer): string | null {
  const parts = prices.map((price) => inCountryCurrency(amountsOf(price), viewer));
  const [first] = parts;
  if (!first || parts.some(({ currency }) => currency !== first.currency)) return null;
  const total = parts.reduce((sum, part) => ({
    ...sum,
    min: sum.min + part.min,
    max: sum.max + part.max,
    converted: sum.converted || part.converted,
  }));
  return amountsText(total, viewer.countryCode);
}

/**
 * A range of amounts in one currency in another, end by end, through each currency's rate to the US
 * dollar, or null when either rate isn't stored. The US dollar's own rate is always 1.
 */
export function convertRange({ min, max }: AmountRange, from: string, to: string, rates: ExchangeRates): AmountRange | null {
  const fromRate = usdRate(from, rates);
  const toRate = usdRate(to, rates);
  if (fromRate === null || toRate === null) return null;
  return { min: (min / fromRate) * toRate, max: (max / fromRate) * toRate };
}

/** Amounts in the currency of the viewer's Country when they can be converted into it, or else as they are. */
function inCountryCurrency(amounts: Amounts, { countryCode, rates }: PriceViewer): ShownAmounts {
  const currency = countryCurrency(countryCode);
  const converted = amounts.currency === currency ? null : convertRange(amounts, amounts.currency, currency, rates);
  return converted ? { ...converted, currency, converted: true } : { ...amounts, converted: false };
}

function amountsOf(price: Price | PriceRangeUsd): Amounts {
  return "amount" in price ? { min: price.amount, max: price.amount, currency: price.currency } : { ...price, currency: "USD" };
}

function usdRate(currency: string, rates: ExchangeRates): number | null {
  return currency === "USD" ? 1 : (rates.get(currency) ?? null);
}

/** "≈ Rp 809,370", "€45" or "$20–$120": one price when both ends are the same in whole units. */
function amountsText({ min, max, currency, converted }: ShownAmounts, countryCode: string): string {
  const [low, high] = [Math.round(min), Math.round(max)];
  const format = (amount: number) => formatMoney(amount, currency, countryCode);
  const text = low === high ? format(low) : `${format(low)}–${format(high)}`;
  return converted ? `≈ ${text}` : text;
}

/**
 * A whole amount of a currency, written in English for the Country, as "Rp 809,370": its symbol
 * where the Country puts it, and its digits grouped by commas. The fraction digits and the
 * separators are set here, so the output doesn't depend on the ICU version's defaults for them. A
 * currency code Intl can't read is written after the amount.
 */
function formatMoney(amount: number, currency: string, countryCode: string): string {
  if (!isCurrencyCode(currency)) return `${amount.toLocaleString("en-US")} ${currency}`;
  return new Intl.NumberFormat(`en-${countryCode}`, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .formatToParts(amount)
    .map(({ type, value }) => (type === "group" ? "," : value.replace(/\s/g, " ")))
    .join("");
}
