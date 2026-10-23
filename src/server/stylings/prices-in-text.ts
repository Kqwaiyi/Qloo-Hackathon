// Whether something the Stylist writes states a price, which nothing it writes may (spec: "The
// Stylist and its tools"): its Pieces' "why" lines and its Hairstyles' cuts and details.

// A price: a currency sign or code beside a number, or a number of dollars, euros, pounds…
const PRICE = /[$€£¥₹]\s?\d|\b(?:usd|eur|gbp)\s?\d|\d\s?(?:[$€£¥₹]|(?:usd|eur|gbp|dollars?|euros?|pounds?|bucks)\b)/i;

/** Whether `text` states a price. */
export function statesAPrice(text: string): boolean {
  return PRICE.test(text);
}
