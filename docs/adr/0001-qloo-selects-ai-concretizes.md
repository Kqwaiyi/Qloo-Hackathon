# Qloo selects what to recommend; a swappable generative AI model makes it concrete

Qloo's API has no garment, product or hairstyle entities: fashion exists only as brands (tagged by product category, target age group, target gender and target income level, with a USD price range), and hair is reachable only through well-known people. So Qloo decides _what_ is recommended and in what order (the Brands and Style Icons, ranked for the user's age, Style Preference and Budget Tier), and a generative AI model only turns each pick into a concrete item or haircut tailored to the user's photo and renders the Preview. The AI model sits behind our own interface as a swappable provider: Gemini is the first implementation, never a dependency of the domain.

Refined by [ADR-0002](0002-photo-style-steers-style-icons.md): the AI also reads a Photo Style from the photo, which Qloo uses as a signal when picking Style Icons. Refined by [ADR-0003](0003-ai-may-merge-top-and-bottom.md): the AI may turn an Outfit's Top and Bottom into one One-Piece, leaving out the Bottom Brand. Refined by [ADR-0008](0008-pieces-are-real-products.md): every Top, Bottom and Shoes Piece is now a real Product the AI picks from its Brand's range, not an item it invents. Partly superseded by [ADR-0010](0010-the-stylist-chooses-among-qloos-picks.md): the Stylist may now choose among a Style Icon's top few Brands and pass over a Style Icon, though Qloo still decides which are candidates. Refined by [ADR-0011](0011-claude-runs-every-model-but-the-image-model.md): Claude now runs every model behind the interface but the image model, which stays on Gemini.

## Considered Options

- **Recommend items directly from Qloo**: impossible, Qloo has no item-level entities.
- **AI-led styles with Qloo brand names attached afterwards**: makes Qloo decorative and leaves Budget Tier and age filtering without a data source.
- **AI re-ranks Qloo's candidates using the photo**: rejected to keep Qloo the single source of ranking and keep results predictable.
