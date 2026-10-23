# 04: Body-photo Stylings run through the Stylist; the fixed pipeline goes

**What to build:** Full-Body and Body-Only Photos' Stylings, of every kind, also run through the Stylist, which gains tools for Brands and Products. The default fake model plays today's body-photo pipeline, so users see the same Outfits as today, One-Pieces included. This ticket only moves the work to the Stylist: it keeps today's choices. The Stylist takes each Category's first usable Brand still in play, and ticket 07 widens that. Once everything runs through the Stylist, the fixed pipeline goes. So do the tailoring method, the Gemini tailoring model, and the tailoring attempts and substitutes. Respect [ADR-0003](../../../docs/adr/0003-ai-may-merge-top-and-bottom.md), [ADR-0008](../../../docs/adr/0008-pieces-are-real-products.md) and [ADR-0011](../../../docs/adr/0011-claude-runs-every-model-but-the-image-model.md).

**Blocked by:** 02 (Face Photo Stylings run through the Stylist)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Stylist and its tools", "The loop" and "Fakes and the check", and "Testing Decisions" (the operations seam). Stories 19–25, 34–37, 68 and 71.

- [ ] **Fetch a Style Icon's Brands:** today's Brand call, widening included. For each Category, it returns the usable Brands the product search knows, looking Brands up as today. It's capped at 6 Style Icons per Styling.
- [ ] **Search a Piece's Products:** today's search with today's filters, for one Brand in one Category, plus the Top Brand's One-Pieces.
  - It returns the qualifying candidates by their words alone, kept with the Styling as today.
  - It's capped at 24 searches per Styling, each counted once towards the monthly backstop.
  - A Brand whose search finds nothing, or never answers, drops out of that Category for the rest of the Styling, as today. Every search failing breaks the Styling.
- [ ] **Save an Outfit** gains Product Pieces:
  - each Category's first usable Brand still in play;
  - for each Piece, a Product by ID among that Brand's searched candidates, or a One-Piece in place of the Top and Bottom.
- [ ] Save applies every rule today's tailoring check applies, plus that no Brand repeats within a Category, across the Consultation's current Outfits and this Styling's.
- [ ] A Budget Tier change's brief gets the current Style Icons and the new tier. "Show 2 more Outfits" also gets the current Outfits' Brands.
- [ ] The default fake model plays today's body-photo pipeline, and the One-Piece scenario maps onto it.
- [ ] If the real model is in place (ticket 03), the Stylist's prompt covers these tools.
- [ ] Today's body-photo Styling tests pass at the operations seam on the default fake model. That covers thin pools, widening, price ranges, markets and currencies, the denylists, the Brand-fetch and search caps, unknown Brands, failed searches, One-Pieces and the Outfit Allowance.
- [ ] Tests that were about tailoring replies move to the save tool's refusals. The tailoring substitute tests go, replaced by the turn-cap tests.
- [ ] The fixed "build Outfits" pipeline, the tailoring method, the Gemini tailoring model setting, and the tailoring attempts and substitute limits all go. The Gemini adapter keeps only the Preview, and its tailoring tests go.
- [ ] The team's landing sample script still runs, on the Stylist.
- [ ] The outfit-recommender and real-products specs get a note on their tailoring sections, pointing to this spec.
