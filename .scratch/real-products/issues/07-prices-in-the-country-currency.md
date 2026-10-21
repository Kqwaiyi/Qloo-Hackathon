# 07: Prices in the Country's currency

**What to build:** Every price a user sees is in their Country's currency: each Product's price, older Pieces' Brand ranges and the Outfit's total, marked "≈" when converted. Exchange rates come from a free source refreshed once a day. The Brand's price range now filters searches in every market, converted into the market's currency.

**Blocked by:** 03

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Prices and currencies", "Candidates" (the converted price filter), "Data model" (exchange rates), "Pages and copy" (the Product Piece row, older Pieces), and "Testing Decisions" (Seam 1, Seam 2). Stories 20–22, 25–27, 31, 47, 70 and 71.

- [ ] A fixed Country-to-currency table, generated once from the current Unicode CLDR data (with Bulgaria on the euro), with these choices: Antarctica, Panama and Zimbabwe use USD; Bhutan BTN; Haiti HTG; Lesotho LSL; Namibia NAD; Palestine ILS; South Georgia GBP. Every one of the app's Countries has exactly one currency.
- [ ] One USD-based rate per currency is stored, with when it was fetched. A new migration adds the table. The daily sweep refreshes it from Frankfurter, falls back to fawazahmed0's currency API, and keeps yesterday's rates when both fail.
- [ ] Prices are converted when the page is shown, from the stored price and currency into the viewer's Country's currency, with "≈" when the currencies differ ("≈ Rp 750,000 on 21 Oct"). Whole units, set explicitly so the output doesn't depend on the server's ICU version, in English for the user's Country. With no stored rate for either currency, the offer's own currency is shown.
- [ ] Older Pieces' Qloo Brand ranges (USD) are converted and shown the same way.
- [ ] The Outfit total sums its Products' prices, converted. A Piece priced only by its Brand's range adds that range, making the total a range.
- [ ] Every search's price filter is the Brand's Qloo range converted into the market's currency with that day's rates. A Brand with no Qloo range gets no price filter.
- [ ] A user who changes Country sees their existing Products, unchanged, with prices in the new Country's currency.
- [ ] The test harness gains a fake exchange-rate transport.
- [ ] Tests at Seam 2: the Country-to-currency table and each explicit choice; conversion, rounding, the "≈" mark, the missing-rate fallback, and the total with range-priced Pieces.
- [ ] Tests at Seam 1: the daily sweep refreshing rates, falling back to the second source, and keeping yesterday's rates when both fail; prices returned in the viewer's Country's currency, including after a Country change; the price filter converted for a non-USD market. The rate sources receive nothing about users.
