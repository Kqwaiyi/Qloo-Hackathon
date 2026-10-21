# The AI may turn an Outfit's Top and Bottom into one One-Piece

Qloo has no garment-level data, so it can't tell which Brands make dresses, jumpsuits or overalls, yet an Outfit of separates only would never give womenswear a dress. So the AI model that tailors an Outfit may make it a One-Piece built on the Top Brand (Qloo's higher-affinity apparel pick), when that Brand plausibly makes one and the garment fits the Outfit's line, and the Bottom Brand Qloo picked is then left out of that Outfit. This refines [ADR-0001](0001-qloo-selects-ai-concretizes.md): the AI still never adds, ranks or swaps Brands, but it may drop one. Refined by [ADR-0008](0008-pieces-are-real-products.md): the One-Piece is a real Product of the Top Brand, offered only when it passes every filter the separates do.

## Considered Options

- **Separates only**: keeps one Piece per Category and every Qloo pick on the card, but womenswear Outfits never include a dress.
- **The AI builds the One-Piece from either Brand**: more freedom, but it hands the AI a choice between two of Qloo's picks.

## Consequences

- Brand picks are fixed before tailoring, so a left-out Bottom Brand stays reserved for de-duplication and isn't offered to a later Outfit.
