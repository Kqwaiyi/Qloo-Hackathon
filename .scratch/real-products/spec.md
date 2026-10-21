# Real Products

Status: ready-for-agent
Branch: `Qurator1` (never `main`)

Every decision here comes from the grilling recorded in this conversation. Use the vocabulary in [GLOSSARY.md](../../GLOSSARY.md) (**Product**, **Piece**, **Brand**, **One-Piece**, **Preview**, **Budget Tier**, **Country**) and respect [ADR-0008](../../docs/adr/0008-pieces-are-real-products.md), which refines [ADR-0001](../../docs/adr/0001-qloo-selects-ai-concretizes.md) and [ADR-0003](../../docs/adr/0003-ai-may-merge-top-and-bottom.md): Qloo still picks and orders the Style Icons and Brands, and the AI only picks among one Brand's real Products. "Line" means an Outfit's menswear or womenswear side, as in ADR-0003.

## Problem Statement

A user who likes an Outfit can't buy it. Each Top, Bottom and Shoes Piece is an item the AI invented and attached to a Brand, so "Navy relaxed cotton overshirt, Uniqlo" may be something Uniqlo has never made. The card links only to the Brand's homepage, where the user has to hunt for something similar themselves, and the Preview shows a garment drawn from a sentence, which may look like nothing any shop sells. The price is the Brand's whole range from Qloo, in US dollars, whatever the user's Country.

## Solution

Every Top, Bottom, Shoes and One-Piece Piece becomes a real Product the Brand sells. For each Piece the app searches a product database for that Brand's Products in the Piece's Category and the Outfit's line, sold and in stock in the user's Country, within the Brand's own price range, and with a photo of the garment alone. The AI picks one Product per Category from those candidates, by their titles and descriptions, so the Outfit goes together and suits the user, and writes why. The Preview then shows the user wearing those exact Products, drawn from their sellers' own photos.

- The card names each Product as its seller does and links to its page: the Brand's own store when it sells it, otherwise a new, in-stock offer from a shop in the user's Country.
- Prices are the seller's own, dated, and shown in the currency of the user's Country, marked "≈" when converted.
- Opening a Consultation later refreshes its Products' prices in the background, once a day at most. A Product that's gone shows "No longer available".
- A Brand whose Products can't be found is never used. When one Piece's search finds nothing, the Style Icon's next Brand fills it, then the next Style Icon. A search is never loosened to another country, another price range or out-of-stock items.
- The Hairstyle, Face Photo Consultations and Outfits made before this change work as they do today.

## User Stories

### Products on the card

1. As a user, I want every Top, Bottom and Shoes Piece to be a real Product its Brand sells, so that I can actually buy what I'm shown.
2. As a user, I want each Product shown by its seller's own name for it, so that I can recognise it on the shop's page.
3. As a user, I want each Product to link to its own page, so that I can see it in full and buy it.
4. As a user, I want the link to go to the Brand's own store when the Brand sells the Product there, so that I buy from the source.
5. As a user, I want the link otherwise to go to a new, in-stock offer from a shop that sells in my Country, so that I can order it.
6. As a user, I want never to be sent to a second-hand listing or an affiliate link, so that the link is honest.
7. As a user, I want each link to say which shop it goes to and open in a new tab, so that I know where I'm going and keep my results.
8. As a user, I want each Product's Brand still named, so that I know which Brand Qloo picked.
9. As a user, I want a "why it suits you" line for each Product, so that I understand the pick.
10. As a user, I want the Products in an Outfit to go together, so that the Outfit looks coordinated.
11. As a user, I want each Product to be in my Outfit's line or unisex, so that it matches my Style Preference.
12. As a user, I want each Product to be in stock when it's picked, so that I can buy it now.
13. As a user, I want each card to credit its Product photos to their sellers, so that I know whose photos the Preview used.

### The Preview

14. As a user, I want the Preview to show me wearing the real Products, drawn from their sellers' photos, so that I can see how they'd really look on me.
15. As a user, I want my face, body shape, skin tone, pose, background and anything covering my hair kept as they are today, so that the Preview is still me.
16. As a user, I want the Preview to take only the garment from each Product photo, never a model's or mannequin's face, body or other clothes, so that no stranger ends up in my photo.
17. As a user, I want a Product whose photo can't be fetched to be drawn from its name instead, with the Product itself still real on the card, so that I still get a Preview.
18. As a user, I want the "AI-generated" badge on every Preview as today, so that I know the image was edited.

### Prices and currency

19. As a user, I want each Product's price as its seller lists it, so that I know what it costs.
20. As a user, I want every price in my Country's currency, so that I don't have to convert.
21. As a user, I want a converted price marked "≈", so that I know it's approximate.
22. As a user, I want prices in whole units, so that they read cleanly.
23. As a user, I want each price dated with when it was found or last checked, so that I know how current it is.
24. As a user, I want the Outfit's total to add up its Products' prices, so that I know the whole cost.
25. As a user on a Budget Tier, I want the tier to choose Brands as it does today, so that the tier still means the same thing.
26. As a user on a Budget Tier, I want every Product within its Brand's own price range, so that a Low Brand never shows me a $450 coat.
27. As a user whose Country uses a currency the app has no rate for that day, I want the seller's own currency shown, so that a price is never silently wrong.

### Where Products come from

28. As a user in one of the product search's countries, I want Products sold in my Country, so that I can have them delivered.
29. As a user in another euro Country, I want Products from the euro-wide range, so that prices are in euros and the shops deliver nearby.
30. As a user anywhere else, I want Products from the US range, so that I still get real Products.
31. As a user who changes their Country, I want my existing Products to stay as they were found and be checked where they were found, with their prices shown in my new currency, so that changing Country doesn't wipe my history.

### One-Pieces

32. As a womenswear user, I want my Outfits still able to include a real dress, so that I don't only get separates.
33. As a user, I want a One-Piece offered only when it passes every filter a Top or Bottom would (line, Country, stock, price range, garment-only photo), so that it's as buyable as separates.

### When a Product can't be found

34. As a user, I want a Piece whose Brand has no matching Product to be filled by another Brand the same Style Icon's fans favour, so that I still get a complete Outfit.
35. As a user, I want the next Style Icon to take the place of one with no usable Brand left, so that I still get my Outfits.
36. As a user, I want gaps never filled with Products from outside my Country, outside the Brand's price range or out of stock, so that every Product shown is one I could buy.
37. As a user, I want a Styling to fail with "Try again" when the product search itself is down, so that I'm never given a quietly different set of Brands.
38. As a user, I want a Brand never matched to a different brand with a similar name, so that every Product really is the Brand's.

### Coming back later

39. As a user reopening a Consultation, I want the stored prices shown at once, so that the page isn't slowed down.
40. As a user, I want each Product checked again in the background at most once a day when I open its Consultation, so that prices and links stay current.
41. As a user, I want the card to update in place when the check finishes, so that I don't have to reload.
42. As a user, I want a Product that's no longer sold to show "No longer available", with no price or link, so that I don't chase a dead page.
43. As a user, I want that Product's name, "why" and place in the Preview kept, so that the Outfit still makes sense.
44. As a user, I want the Outfit's total to leave out a Product that's no longer available and say so, so that the total stays honest.
45. As a user, I want a Product that comes back in stock to show as available again on a later check, so that a short gap doesn't hide it for good.

### Existing Consultations and flows

46. As a user with older Consultations, I want their Outfits to keep their AI-described items, Brand price ranges and Visit links, so that my history stays as it was.
47. As a user, I want those older Brand price ranges shown in my Country's currency too, so that every price I see reads the same way.
48. As a user, I want "Show 2 more Outfits", a Budget Tier change and a Photo Style change on an older Consultation to make Product Pieces, so that new Outfits are always buyable.
49. As a user, I want the Hairstyle Piece to work exactly as today, so that haircuts are unaffected.
50. As a user with a Face Photo Consultation, I want nothing to change, so that a Hairstyle-only Consultation stays fast.
51. As a user, I want the Outfit Allowance to count Outfits exactly as before, so that my limit means the same thing.
52. As a judge on the Demo Account, I want Product Pieces too, so that I see the feature at its best.

### Privacy, rights and honesty

53. As a user, I want my photo never sent to the product search, so that my photo goes only where the Privacy Policy says.
54. As a user, I want the product search never to receive anything that identifies me, only the Brand, the Category, the line and the country searched, so that it can't build a profile of me.
55. As a user, I want the Privacy Policy to name the product search and say what it receives, so that I know every recipient.
56. As a user, I want the Privacy Policy to say Product photos are sent to Google with my photo, and that the app fetches them only while drawing the Preview and never keeps them, so that I know how my Preview is made.
57. As a user, I want the Terms to say that Products, prices and links come from their sellers, that converted prices are approximate, and that the app sells nothing and earns nothing from links, so that I know what the app promises.
58. As a brand or seller, I want a way to ask for my Product photos to be taken out of the app, and to have them taken out, so that my images aren't used against my wishes.

### Landing page

59. As a visitor, I want the landing page's sample Outfit to show real Products with their names, shops and prices, so that the walkthrough matches what the app does.
60. As a visitor, I want the opening chapter to say that the AI picks real Products and shows them on me, so that the claim is accurate.
61. As a visitor, I want the landing page to load without calling Qloo, the AI or the product search, so that it's fast and costs nothing.

### The team

62. As the team, we want the product search behind our own interface, with Channel3 as its first implementation, so that it can be swapped like the AI model.
63. As the team, we want a monthly product-search backstop that refuses new Stylings like the Qloo backstop, so that spending stays bounded.
64. As the team, we want a cap on searches per Styling, so that one Styling can't run away with the budget.
65. As the team, we want each Brand's match cached for 30 days, so that Stylings don't keep looking up the same Brands.
66. As the team, we want Product searches never cached between Stylings and each Styling's candidates deleted when it finishes, so that we keep to the provider's terms and prices stay fresh.
67. As the team, we want Product photos never stored in Blob or the database, so that we keep the copyright safeguard and stay within Blob's write limits.
68. As the team, we want a fake product search in local development and tests unless the real one is switched on, so that development costs nothing and works without a key.
69. As the team, we want an opt-in coverage check against the live product search, so that we know whether enough of Qloo's Brands are usable before building the rest.
70. As the team, we want exchange rates refreshed by the daily sweep, keeping the last good rates when the source is down, so that prices keep showing.
71. As the team, we want a fixed Country-to-currency table with explicit choices for the ambiguous Countries, so that every Country has exactly one currency.
72. As the team, we want the code that invents generic items removed on this branch, so that only one way of making Pieces remains.

## Implementation Decisions

### Product search interface ([ADR-0008](../../docs/adr/0008-pieces-are-real-products.md))

- Our own interface, as `AiProvider` is. The domain depends on it, never on Channel3. It has three operations:
  - **Find a Brand**: given a Brand's name (and its official site when Qloo has one), return the provider's Brand ID or "not found".
  - **Search a Brand's Products**: given the provider's Brand ID, a product category, the line, the market, and an optional price range in the market's currency, return candidate Products.
  - **Check a Product**: given a Product's ID and the market it was found in, return its current offers, or "gone" when it has none there.
- What a candidate Product carries: its ID, title, description, colours, gender, Brand IDs, images (URL, background-removed URL when there is one, shot type) and offers (URL, shop domain, price, currency, availability, condition).
- What the interface may receive is limited by its types, as Qloo's is: no user ID, username, email, photo, Style Icon, or anything that links two calls to one user.
- Channel3 is the first implementation, over an injectable transport like Qloo's. A fake implementation serves a small built-in catalogue for any Brand, in every Category and line, and is what local development and the browser tests use. A `PRODUCT_SEARCH` setting switches the real one on, as `AI_PROVIDER` does for Gemini; production sets it. `CHANNEL3_API_KEY` holds the key, and the real implementation refuses to start without it.

### Channel3 specifics

- Authentication is the `x-api-key` header. The market goes in the request's locale `config` (country, with the currency left to Channel3 to infer); don't put country or currency at the top of a search body, which the API schema rejects.
- Searches ask for up to 30 Products, the most one credit returns, so that enough are left after our own filters. They never page.
- Brand lookups and Product checks use Channel3's free endpoints. Each search costs one credit.
- Our Categories map to Channel3 category IDs, fetched once from its free categories endpoint and kept in config: Top, Bottom, Shoes, and for One-Pieces dresses, jumpsuits and overalls.
- Errors map as Qloo's do: "too many requests" is retried with back-off; a refused key is unretryable; other errors are retried by the step.

### Markets

- The Country searches its own market when it's one of Channel3's 20: US, CA, GB, IE, AU, DE, AT, FR, BE, IT, ES, NL, SE, FI, PT, CZ, GR, RO, CH, PL.
- Any other Country whose currency is the euro searches Channel3's euro-wide market (`EU`).
- Every other Country searches the US market.
- The market is chosen once per Styling from the user's Country at its start, and saved on each Product it finds.

### Brand matching

- Names are compared after normalising: lower case, accents removed, punctuation removed, spaces collapsed, and a leading "the" dropped. Only an exact match counts; there is no fuzzy matching.
- If several of Channel3's Brands match, the one tied to Qloo's official site through Channel3's free websites lookup wins; otherwise the Brand counts as not found. (Channel3's Brand lookup itself returns no website; check during the coverage check that the websites lookup can break ties.)
- Each Qloo Brand's result, found or not, is cached for 30 days by its Qloo entity ID.
- Matches are looked up lazily, only for Brands a pick is about to use and in Qloo's order, through the same plan-then-fetch loop that fetches each Style Icon's Brands. Lookups are their own Workflow steps.

### Usable Brands and picks (Outfit assembly)

- A Brand is usable only if it passes today's rules (the line rule, apparel or footwear, the denylists, the Budget Tier's price guard) and the product search knows it.
- A search that finds no qualifying candidate, or still errors after its step's retries, excludes that Brand for that Category for the rest of the Styling. The Category then takes the Style Icon's next usable Brand in Qloo's order, under today's pick rules (Shoes never share a Brand with the Top or Bottom; de-duplication across Outfits). When the Style Icon has no usable Brand left for a Category, it's skipped like a Style Icon that can't complete an Outfit, and the next one takes the position, within today's substitute cap.
- Searches are never loosened: no other market, no price range beyond the Brand's own, no out-of-stock or second-hand offers.
- A Styling fails, so the user can Try again, when Channel3 is down: when every search it sent has errored and none answered.
- The Outfit's Brands are fixed once its searches have candidates, before tailoring, so ADR-0003's reserved Bottom Brand still holds.

### Candidates

- One search per Piece: the Brand's Products in that Category and the Outfit's line (the line's gender plus unisex), in the Styling's market, in stock, within the Brand's Qloo price range converted into the market's currency with that day's rates. A Brand with no Qloo price range gets no price filter.
- For an Outfit with a Top and a Bottom, one more search covers the Top Brand's One-Pieces that suit the line: dresses for womenswear, jumpsuits or overalls for either.
- A Product qualifies when all of these hold:
  - one of its Brands is the matched Brand;
  - it has a garment-only photo: shot type hero or flat-lay (the background-removed version when there is one), never on-model, lifestyle or any other kind;
  - it has a new, in-stock offer within the price filter.
- Up to 8 qualifying Products per Category are kept, in Channel3's order.
- Each search is its own Workflow step, like each Qloo call. Its candidates are saved with the Outfit try for the tailoring step and deleted when the Styling finishes. Nothing is reused by a later Styling.

### Choosing the offer

- The offer whose shop domain matches the host of Qloo's official site for the Brand (ignoring `www.`, http or https) wins.
- Otherwise the first new, in-stock offer, in Channel3's order.
- Never a second-hand offer, and no affiliate parameters are ever added.
- The same rule runs again on every Product check.

### Tailoring contract (changes to the AI provider interface)

- The input for each Brand Piece carries its Brand (name, category tags) and its candidates (ID, title, description, colours), never their images. A One-Piece's candidates come alongside the Top's. The Hairstyle input is unchanged.
- The reply gives each Brand Piece the chosen candidate's ID and its "why". The Hairstyle's reply is unchanged (cut, details, why, unknown-cut flag).
- Our check: exactly one Piece per Category asked for, or one One-Piece in place of the Top and Bottom; each chosen ID is one of that Category's candidates (a One-Piece's from the One-Piece candidates); every "why" non-empty and free of prices. A bad reply is asked again once, as today.
- The prompt keeps today's rules on line, coherence with the Style Icon and Photo Style, and preferring separates with no cap. The rule against product names is dropped: the "why" may describe the Product. It never states a price.
- Each Product Piece's item label is the Product's title. It has no hidden Preview description.

### Preview contract and Product photos

- The Preview step itself fetches each Product's chosen photo by its saved URL, inside the step, so no image bytes pass between steps. The bytes go to the model inline and are never written to Blob, the database or logs.
- A fetch counts only if it answers within a short timeout with a JPEG, PNG or WebP image (checked by its first bytes, not just its content type) under a size limit. After the step's retries, a Piece whose photo still fails is drawn from its title instead.
- The input carries the user's photo, the Photo Type, and for each Piece its Category and either its Product's title and photo or, for the Hairstyle, its details as today.
- The instruction names each image by its position and Category, repeats each Product's title, tells the model to take only the garment from each Product photo and ignore any person, mannequin or other clothing in it, and keeps today's "keep everything else exactly as it is" list, Face Photo and Body-Only rules.
- All images go in one request: the user's photo first, then the Product photos. Nano Banana 2.1 takes up to 10 object reference images, so a full Outfit fits.
- Refusals and failures behave as today.

### Prices and currencies

- A Product Piece stores its offer's price in the offer's own currency, with the date it was found.
- **Country to currency:** a fixed table generated once from the current Unicode CLDR data (which has Bulgaria on the euro), with these choices: Antarctica, Panama and Zimbabwe use USD; Bhutan BTN; Haiti HTG; Lesotho LSL; Namibia NAD; Palestine ILS; South Georgia GBP.
- **Rates:** one USD-based rate per currency, stored in a table. The daily sweep refreshes it from Frankfurter, falling back to fawazahmed0's currency API; when both fail, yesterday's rates stay. Both sources are keyless and receive nothing about users.
- **Display:** converted when the page is shown, from the stored price and currency into the viewer's Country's currency, using the stored rates. Marked "≈" when the currencies differ. Whole units, set explicitly so the output doesn't depend on the server's ICU version. The locale is English for the user's Country. When no rate is stored for either currency, the offer's own currency is shown.
- Older Pieces' Qloo Brand ranges (USD) are converted and shown the same way.
- **Outfit total:** the sum of its available Products' prices, converted. A Piece priced only by its Brand's range adds that range, making the total a range. When a Product is no longer available, the total leaves it out and says so.

### Price refresh

- The Consultation page renders the stored prices at once.
- When any of its Products wasn't checked today, the page then sends one background request to a route handler (like sign-in renewal) that runs a server operation for that Consultation, for its owner only (the Demo Account's shared visibility applies).
- The operation checks each such Product through the free Product check, in the market it was found in. It re-applies the offer rule and stores the new offer, price, currency and date, or marks the Product no longer available when the check finds no offer. A later check can make it available again. A check that errors changes nothing and is tried on the next visit.
- When the request finishes, the page refreshes in place.
- Older Pieces are never checked.

### Limits and cost

- A Styling makes at most 24 product searches (a config value). Positions it can't fill within the cap are left unfilled, as when Style Icons run out.
- Every live search is counted. A Styling starts only while this UTC month's count leaves room for one Styling's cap below the backstop (5,000, a config value). The backstop's refusal, lift time and Demo Account treatment match the Qloo backstop's.
- Brand lookups and Product checks are free and not counted. Channel3's own limits are 10 requests a second and 10,000 a day, shared across endpoints. A Styling already sends at most 3 Qloo calls at once; it sends at most 3 product calls at once too.
- The Outfit Allowance and app-wide caps are unchanged.

### Data model

- **Piece** gains, for Product Pieces: the provider's Product ID, the title (as its item), the chosen photo's URL, the offer's URL and shop domain, the price and currency, the market, the date found or last checked, and whether it's available. A check constraint keeps these all set for Product Pieces and all empty for older ones. Product Pieces have no hidden Preview description. The Brand columns stay.
- **Brand matches:** Qloo entity ID, the provider's Brand ID or "not found", and when it was looked up.
- **Candidates:** per Outfit try and Category, the qualifying candidates' fields that tailoring and the Piece need. Deleted when the Styling finishes.
- **Exchange rates:** currency, rate per USD, and when it was fetched.
- **Product-search usage:** enough to count this UTC month's live searches. Purged with the other usage records.
- Each ticket adds its own migration for the tables and columns it needs.

### Removing the generic path

- On this branch, tailoring no longer invents Top, Bottom, Shoes or One-Piece items. There's no switch between old and new; `main` keeps the old behaviour.
- Older Pieces still display through the existing Brand range and Visit link view.
- The fake AI adapter's tailoring picks the first candidate in each Category and writes a "why" naming the Style Icon. Its Hairstyle is unchanged.

### Pages and copy (acceptance criteria)

- **Product Piece row:** Category, the Product's title, its Brand's name below it as today, the "why", the price ("≈ Rp 750,000 on 21 Oct" when converted, "€45 on 21 Oct" when not), and "View at <shop domain> ↗" opening in a new tab with `noopener noreferrer`.
- **No longer available:** the price and link are replaced by "No longer available".
- **Outfit total:** "Whole Outfit about <amount>", plus "(leaves out 1 Piece no longer available)" when one is.
- **Credit:** each card with Product Pieces says "Product photos © their sellers".
- **Older Pieces:** unchanged, apart from their price ranges showing in the Country's currency.
- **Landing:** the opening chapter says Qloo decides what to recommend and the AI picks real Products and shows them on you. The "ready to shop" chapter says each Piece names its Product, its shop and its price. The sample Outfit shows real Products.
- **Privacy Policy:** adds Channel3 as a recipient (it gets the Brand, Category, line and country searched, never the photo or anything about the account). It says Product photos are fetched by the app only while drawing a Preview, sent to Google with the user's photo, and never kept. Workflow run data still holds no images.
- **Terms:** Products, prices and links come from their sellers; converted prices are approximate; the app sells nothing and earns nothing from links; Product photos belong to their sellers, and the team removes any on request through the team's email.

### Landing sample

- A one-off team script runs the real pipeline once on the landing page's sample photos (live Qloo, Channel3 and Gemini, with the team's go-ahead for the cost), with the United States as the Country, and freezes the result into the landing samples.
- The frozen sample is never refreshed. The landing page makes no Qloo, AI or product-search call.

### Documents

- The outfit-recommender spec's user story 96, its Piece link and generic-item rules, and its Out of Scope line on product-level shopping each get a note pointing to this spec and ADR-0008.
- `.env.example` gains `PRODUCT_SEARCH` and `CHANNEL3_API_KEY`.

### Setup (one-off steps for the team)

- Sign up for Channel3 and put the key in `.env.local` and in Vercel's production and preview environments as `CHANNEL3_API_KEY`, with `PRODUCT_SEARCH` set to Channel3 in production.
- Run the coverage check (below) before building past the first issue.
- Regenerate the landing sample once the new path works.

## Testing Decisions

**What makes a good test here:** as in the outfit-recommender spec, a test exercises behaviour through a seam the rest of the app also uses and asserts on what a user or the team could observe: what server operations return, what ends up in the database, which requests went out to Qloo, Channel3 and the exchange-rate source, and what the AI provider was given. Tests never assert on internal call order or private helpers. No test calls Gemini or the live Channel3, and no fixture holds bulk catalogue data.

**Seam 1: server operations (most tests).** The existing setup (PGlite with the real migrations, the fake AI adapter, the fake Qloo transport, an in-memory Blob store, an injectable clock, Stylings through the inline runner) gains three fakes at the edges:
- a **fake Channel3 transport** that serves small hand-written responses and records every request, like the fake Qloo transport;
- a **fake exchange-rate transport** for the daily sweep;
- a **fake Product-photo fetch** that can answer with an image, with something that isn't an image, or fail.

Behaviours to cover:
- a body-photo Styling saving Product Pieces with title, offer, price, currency, market and date;
- Brand matching: exact matches only, the 30-day cache, several matches broken by the website or left as not found;
- an empty or erroring search moving to the Style Icon's next usable Brand, then to the next Style Icon;
- searches never loosened (requests always carry the Styling's market, the Brand's price range and in-stock);
- every search erroring failing the Styling for Try again; a refused key failing at once;
- One-Piece candidates only when they pass the filters, and a One-Piece Outfit's Pieces;
- the market chosen for a covered Country, another euro Country and any other Country;
- the price filter converted into the market's currency;
- the per-Styling search cap and the monthly backstop, including its refusal and the Demo Account;
- candidates deleted when a Styling finishes;
- the Preview getting the user's photo plus each Product's photo, and a Piece whose photo fails or isn't an image drawn from its title;
- no Product photo bytes in Blob or the database;
- the price refresh: only Products not checked today, in the market they were found in, a new offer or price stored, "no longer available" and back again, an erroring check changing nothing, only for the Consultation's owner, never older Pieces;
- prices returned in the viewer's Country's currency, with "≈" when converted, after a Country change;
- older generic Pieces still read and shown, and new Stylings on an older Consultation making Product Pieces;
- the daily sweep refreshing rates, falling back to the second source, and keeping yesterday's rates when both fail;
- the privacy commitment: a test asserts recorded Channel3 requests carry no user identifiers, and a type-level test asserts the product search's request types have no user fields;
- the landing page making no Qloo, AI or Channel3 call.

**Seam 2: pure rules (no database).** Next to the existing Outfit assembly module, with small hand-written samples in and decisions out:
- the market for a Country;
- Brand name normalisation and matching;
- which Products qualify (Brand, shot type and background-removed photo, condition, stock, price range, line or unisex);
- which offer wins;
- Brand picks with exclusions after an empty search, under the existing pick rules;
- the Country-to-currency table, including each explicit choice;
- conversion, rounding, the "≈" mark, the missing-rate fallback, and the Outfit total with unavailable Products and range-priced Pieces.

**Gemini adapter tests:** the Preview request now carries several images in order, the user's photo first. The tailoring request carries candidates as text and no images, and the reply check accepts only listed candidate IDs.

**Browser smoke test:** the existing "two Outfit cards" flow, with the fake product search, checks a Product title, a "View at" link and a dated price on a card.

**Live checks (opt-in, never in CI):**
- the **coverage check**: run the Brands Qloo returns (from the production Qloo cache, or fresh Qloo calls) through Channel3's free Brand lookup, then one search per line and Category for the matched ones, and report how many Brands are usable. It needs `CHANNEL3_API_KEY` and costs a few credits per Brand searched;
- a manual Gemini Preview smoke run with real Product photos, which costs money and needs the team's go-ahead.

**Prior art:** the fake Qloo transport and its request-recording tests, the Qloo client's trimming tests, the Styling operation tests (substitutes, caps, backstop), the Outfit assembly tests (picks, de-duplication, price ranges), and the Gemini adapter tests that inspect request parts.

## Out of Scope

- A Product thumbnail on the card. The Preview is the picture.
- Affiliate links, in-app purchase, sizes or variants. The link goes to the Product's page.
- Showing several offers for one Product, price history or price alerts.
- Storing Product photos anywhere.
- Loosening a search to fill a gap, or falling back to an invented item.
- Caching Product searches between Stylings.
- A second product provider (Exa or others) and Vertex AI Virtual Try-On.
- Swapping a single Product inside an Outfit.
- A user-chosen display currency. It's always the Country's.
- Checking older generic Pieces, or turning them into Products.
- Product search for the Hairstyle, or any image of a Style Icon.
- Refreshing the frozen landing sample.

## Further Notes

- **Go/no-go:** the submission period ends 2026-10-30. Run the coverage check first. If fewer than about 60% of the Brands that would be picked are usable, stop: `main` stays the submission. The team decides later whether to push or merge `Qurator1`.
- **Copyright:** ADR-0008 records the accepted risk of sending sellers' Product photos to Google, and its safeguards. Keep to them: fetch only while drawing a Preview, never store, always credit and link, remove on request.
- **Channel3's docs disagree with its API in places:** offers use `domain`, not `merchant`, and `price.price`, not `price.amount`. The filter field is `category_ids`. The locale goes in `config` or the `X-Channel3-*` headers. Trust the live OpenAPI document over the guides.
- **The fallback Preview model**, Nano Banana 2 Lite, isn't built for several reference images. Switching to it would cost more quality than the bake-off measured.
- **Cost:** a typical Styling makes about 8 searches. At the app-wide cap of 750 Outfits a month that's roughly 3,000–6,000 searches, about $14–$35 a month beyond Channel3's 1,000 free credits. The 5,000 backstop caps it at about $28 a month.
