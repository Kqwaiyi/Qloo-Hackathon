# Pieces are real Products the AI picks from a Brand's range

ADR-0001 had the AI invent a generic item for each Brand, because Qloo has no products, so a card could name a garment nobody sells and its Preview showed a guess. Now every Top, Bottom, Shoes and One-Piece Piece is a real Product. For each one we search a product database for the Outfit's Brand in that Category and line, in stock in the user's Country's market, within the Brand's own Qloo price range, and with a garment-only image. The AI reads those candidates' titles and descriptions, never their images, picks one Product per Category (or a One-Piece in place of the Top and Bottom), and writes why it suits the user. The Preview model then gets the chosen Products' own images with the photo. Qloo still picks and orders the Style Icons and Brands: the AI never adds, ranks or swaps a Brand, it only picks among one Brand's Products. A Brand the product database doesn't know is unusable when Brands are picked, like a retailer on the denylist. When a Piece's search finds nothing, or keeps failing, the Style Icon's next usable Brand for that Category is tried, then the next Style Icon; the search itself is never loosened beyond the user's Country, the Brand's price range or what's in stock. The search sits behind our own interface, as the AI model does; Channel3 is the first implementation, because one call filters by brand, gender, category, price, stock and country and returns prices and garment-only images.

Product photos are their sellers' copyright, and Google's API terms ask us to be able to license every image we send. For a non-commercial hackathon demo we accept that risk, with safeguards: each Product image is fetched only while its Preview is drawn and never stored, every Product is named and linked to its own page, and anything is taken down on request.

## Considered Options

- **Describe, then search**: the AI writes the item as before and a search finds the closest Product. A hit that doesn't match leaves the card, the Preview and the link describing different things.
- **Real Products on the card, Preview drawn from text**: no third-party image goes to Google, but the Preview shows a guess at a garment the card names.
- **An invented item when no Product is found**: keeps more Brands, but brings back items that may not exist.
- **Skip the Style Icon when a Brand has no Products**: an Outfit needs all three of its Brands, so misses compound; at 80% coverage only about half of Outfits would complete.
- **Loosen a search that finds nothing** (another country, outside the price range, out of stock): finds more, but shows Products the user can't buy where they live, or at the price their Brand was picked for.
- **Other sources**: Gemini's Google Search grounding returns no images or prices, Google Custom Search is closed to new customers, Brave's and Shopify's terms ban derivative works or downloading images, and Vertex AI Virtual Try-On is deprecated and takes one garment per call.

## Consequences

- Refines [ADR-0001](0001-qloo-selects-ai-concretizes.md) (the AI picks real Products instead of inventing items) and [ADR-0003](0003-ai-may-merge-top-and-bottom.md) (a One-Piece is a real Product of the Top Brand, offered only when it passes every filter the separates do).
- The spec's rules that items are generic and that Pieces link only to the Brand's site no longer hold. A Piece links to its Product's page: at the Brand's own store when we can tell, otherwise the first new, in-stock offer sold in the user's Country; never second-hand, never an affiliate link.
- The Budget Tier still filters Brands. Keeping each Product within its Brand's price range is what stops a Low Brand's $450 coat appearing.
- Prices are the offer's own, kept with the date they were found and shown in the currency of the user's Country, marked as approximate where they were converted. Opening a Consultation refreshes each of its Products in the background, at most once a day and in the country it was found for; one no longer offered there shows as no longer available, with no price or link.
- Channel3 being down fails the Styling, so the user can try again; it never quietly changes which Brands they get.
- Product searches are never cached between Stylings, since prices and stock change and the provider's terms forbid caching much of its catalogue; a monthly search backstop works like Qloo's. Whether the provider knows a Brand is cached for 30 days.
- The product provider is a new recipient: it gets the Brand, Category, line and Country, never the photo or anything about the account. Product images now go to Google with the photo.
- A Product image that can't be fetched is drawn from the Product's title instead; the Product stays real.
- Outfits made before this keep their AI-described items.
- Refined by [ADR-0010](0010-the-stylist-chooses-among-qloos-picks.md): the Stylist may now choose among a Style Icon's top few Brands, not only among one Brand's Products. And by [ADR-0011](0011-claude-runs-every-model-but-the-image-model.md): Product images also go to Anthropic when the Stylist checks a Preview, as their public URLs, so they're still never stored.
- The fallback Preview model, Nano Banana 2 Lite, isn't built for several reference images, so falling back to it now costs more quality than the bake-off measured.
