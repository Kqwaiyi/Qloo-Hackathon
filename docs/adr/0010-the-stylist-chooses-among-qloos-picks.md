# The Stylist chooses among Qloo's picks

Each Styling used to be a fixed pipeline in which the AI made one choice, the Product for each Piece. Now it is carried out by the Stylist, one AI per Styling, that works through tools in a loop and builds all of that Styling's Outfits, for every kind of Styling. So that it has real choices to make and explain, the Stylist may pick any of a Style Icon's top few Qloo Brands for a Category rather than only the first, and may pass over a Style Icon that doesn't suit the photo, saying why. It never uses a Style Icon or Brand Qloo didn't return. Qloo's queries are built as before, and its tools, not its judgment, still enforce the Budget Tier, the Country, each Brand's price range, stock, the denylists and the rule that a Brand isn't repeated. It also looks at each Preview it renders and redraws it once when it is wrong: the wrong garment, a changed face, or a face invented on a Body-Only Photo. This replaces [ADR-0001](0001-qloo-selects-ai-concretizes.md)'s rule that the AI never ranks Qloo's picks, and the same rule as [ADR-0003](0003-ai-may-merge-top-and-bottom.md) and [ADR-0008](0008-pieces-are-real-products.md) restate it. Qloo still decides which Style Icons and Brands are candidates, and in what order they are offered.

## Considered Options

- **Same rules, the Stylist only drives**: Qloo's order stays binding and no ADR changes, but the Stylist would have so little to decide that its notes would only narrate the pipeline.
- **The Stylist drives Qloo**: it writes its own Qloo queries and signals, which makes Qloo one tool among several rather than the source of what is recommended.
- **One Stylist per Outfit, in parallel**: faster, but two interleaved streams of notes for the user, and no one sees both Outfits to keep their Brands apart.
- **No Preview check, or a check with no redraw**: cheaper, but leaves the failures the Preview bake-off saw, such as invented faces and changed poses, for the user to find.

## Consequences

- Qloo's Brand queries still never carry the Photo Style ([ADR-0002](0002-photo-style-steers-style-icons.md) holds for Qloo), but the Stylist may weigh the photo and the Photo Style when choosing among the Brands Qloo returned.
- A redraw costs at most one more image per Outfit.
- Users see the Stylist's own notes and its tool calls, never its thinking: thinking can't be held to [ADR-0005](0005-photos-edited-never-analysed.md), and might guess an age or describe a body.
