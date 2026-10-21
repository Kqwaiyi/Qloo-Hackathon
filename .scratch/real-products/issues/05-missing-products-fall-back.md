# 05: Missing Products fall back to the next Brand, then the next Style Icon

**What to build:** When a Piece's Brand has no Product that qualifies, the user still gets a complete Outfit: another Brand the same Style Icon's fans favour fills that Piece, and only when the Style Icon has none left does the next Style Icon take its place. A search is never loosened to fill a gap. When the product search itself is down, the Styling fails with "Try again" instead of quietly changing which Brands the user gets.

**Blocked by:** 03

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Usable Brands and picks (Outfit assembly)", and "Testing Decisions" (Seam 1, Seam 2). Stories 34–37.

- [ ] A search that finds no qualifying candidate, or still errors after its step's retries, excludes that Brand for that Category for the rest of the Styling.
- [ ] The Category then takes the Style Icon's next usable Brand in Qloo's order, under today's pick rules: Shoes never share a Brand with the Top or Bottom, and no Brand repeats within a Category across the Outfits current together. When the Style Icon has no usable Brand left for a Category, it's skipped like one that can't complete an Outfit, and the next one takes the position within today's substitute cap.
- [ ] Searches are never loosened: every retry carries the Styling's market, the Brand's own price range, in-stock and new.
- [ ] The Outfit's Brands are fixed once its searches have candidates, before tailoring, so ADR-0003's reserved Bottom Brand still holds.
- [ ] A Styling fails, so the user can Try again, when every search it sent has errored and none answered. A refused key fails it at once.
- [ ] Tests at Seam 2: Brand picks with per-Category exclusions after an empty search, under the existing pick rules.
- [ ] Tests at Seam 1: an empty search moving to the next Brand; an erroring search doing the same; a Style Icon with no Brand left skipped for the next; requests never loosened; every search erroring failing the Styling; a refused key failing at once.
