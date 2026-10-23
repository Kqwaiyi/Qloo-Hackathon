# 04: Body-photo Stylings run through the Stylist; the fixed pipeline goes

**What to build:** Full-Body and Body-Only Photos' Stylings, of every kind, also run through the Stylist, which gains tools for Brands and Products. The default fake model plays today's body-photo pipeline, so users see the same Outfits as today, One-Pieces included. This ticket only moves the work to the Stylist: it keeps today's choices. The Stylist takes each Category's first usable Brand still in play, and ticket 07 widens that. Once everything runs through the Stylist, the fixed pipeline goes. So do the tailoring method, the Gemini tailoring model, and the tailoring attempts and substitutes. Respect [ADR-0003](../../../docs/adr/0003-ai-may-merge-top-and-bottom.md), [ADR-0008](../../../docs/adr/0008-pieces-are-real-products.md) and [ADR-0011](../../../docs/adr/0011-claude-runs-every-model-but-the-image-model.md).

**Blocked by:** 02 (Face Photo Stylings run through the Stylist)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Stylist and its tools", "The loop" and "Fakes and the check", and "Testing Decisions" (the operations seam). Stories 19–25, 34–37, 68 and 71.

- [x] **Fetch a Style Icon's Brands:** today's Brand call, widening included. For each Category, it returns the usable Brands the product search knows, looking Brands up as today. It's capped at 6 Style Icons per Styling.
- [x] **Search a Piece's Products:** today's search with today's filters, for one Brand in one Category, plus the Top Brand's One-Pieces.
  - It returns the qualifying candidates by their words alone, kept with the Styling as today.
  - It's capped at 24 searches per Styling, each counted once towards the monthly backstop.
  - A Brand whose search finds nothing, or never answers, drops out of that Category for the rest of the Styling, as today. Every search failing breaks the Styling.
- [x] **Save an Outfit** gains Product Pieces:
  - each Category's first usable Brand still in play;
  - for each Piece, a Product by ID among that Brand's searched candidates, or a One-Piece in place of the Top and Bottom.
- [x] Save applies every rule today's tailoring check applies, plus that no Brand repeats within a Category, across the Consultation's current Outfits and this Styling's.
- [x] A Budget Tier change's brief gets the current Style Icons and the new tier. "Show 2 more Outfits" also gets the current Outfits' Brands.
- [x] The default fake model plays today's body-photo pipeline, and the One-Piece scenario maps onto it.
- [x] If the real model is in place (ticket 03), the Stylist's prompt covers these tools.
- [x] Today's body-photo Styling tests pass at the operations seam on the default fake model. That covers thin pools, widening, price ranges, markets and currencies, the denylists, the Brand-fetch and search caps, unknown Brands, failed searches, One-Pieces and the Outfit Allowance.
- [x] Tests that were about tailoring replies move to the save tool's refusals. The tailoring substitute tests go, replaced by the turn-cap tests.
- [x] The fixed "build Outfits" pipeline, the tailoring method, the Gemini tailoring model setting, and the tailoring attempts and substitute limits all go. The Gemini adapter keeps only the Preview, and its tailoring tests go.
- [x] The team's landing sample script still runs, on the Stylist.
- [x] The outfit-recommender and real-products specs get a note on their tailoring sections, pointing to this spec.

## Comments

- 2026-10-24: Body-photo Stylings run through the Stylist, and the fixed pipeline is gone: `build-outfits.ts`, `run-styling.ts`, `tailoring.ts`, `AiProvider.tailorPieces` and Gemini's tailoring (its prompt, `GEMINI_TAILORING_MODEL` and its tests), `TAILORING_ATTEMPTS`, `MAX_TAILORING_SUBSTITUTES` and `styling.tailoring_failures`. The Gemini adapter keeps only the Preview.
  - **Tools.** `fetchBrands` (steps `fetchBrands`, `readBrandsInPlay` and `lookUpBrand`) and `searchProducts`, in `src/server/stylings/brand-steps.ts`. `saveOutfit` in `stylist-steps.ts` takes each Category's Brand by name and each Piece's Product by its id, or a One-Piece in place of the Top and Bottom, and refuses as tailoring's check did, plus no Brand repeated within a Category and each Category's Brand the first still in play (`firstBrandsInPlay` in `outfit-assembly/brands.ts`, which `pickBrands` now runs on too).
  - **Storage** (migration 0021): a Styling's fetched Brands in `style_icon_brands`, deleted as it finishes with its searches' candidates; `piece_candidates.state` (`searching`, `answered`, `unanswered`), so a search counts once as it's set going and a retry carries it on; and each Outfit's Brand names beside their IDs.
  - **The fake Stylist** (`bodyPhotoCalls` in `fake-stylist.ts`) replays the old planner: 3 Style Icons fetched up front on a first Styling, at most 3 searches a turn, the One-Pieces last, and a Brand out of a Category moving the plan. `styleIconScenarios` now play the Stylist's scenarios; their names, `tailoring-fails` included, are unchanged.
- 2026-10-24: Choices the ticket left open, which ticket 07 should know about:
  - **Lookups.** `fetchBrands` looks up only the Brands a Style Icon's first Brands in play would be, as the pipeline did. Its lists include Brands not yet looked up, as the pipeline's picks did, so "the Brands the product search knows" means less those it's known not to know. `searchProducts` looks a Brand up before its first search; one the product search doesn't know comes back `out: "every Category"`, with no search spent.
  - **Passing over.** `fetchBrands` passes over (skips) a Style Icon whose Brands can't complete an Outfit, and says so. `saveOutfit` passes over an earlier Style Icon whose Brands no longer can. So a first Styling's spare that can't complete one is now skipped, where the pipeline left it unused: in the "Show 2 more Outfits" fetch-cap test, the 6 Style Icons fetched moved down by one.
  - **What's searched.** `searchProducts` accepts any of the Style Icon's Brands still in play for the Piece, any of its Top Brands for `onePiece`; only `saveOutfit` holds to the first. Each result says `searchesLeft`, each fetch `fetchesLeft`.
  - **Every search failing** is checked as each search ends, among those the Styling has set going: a Stylist that searches once a turn breaks on its first search that never answers, as the pipeline did with a batch of one.
  - **Stages.** A body photo stays at Brands until its first save moves it to Building Outfits; both show as Building Outfits.
  - **Briefs.** `budgetTier` on a Budget Tier change; `brandsInUse` on a body photo's "Show 2 more Outfits", from the Outfits' new Brand names, or their Pieces' Brands for Outfits saved before.
  - **The Workflow** is now `stylingWorkflow` in `src/workflows/styling.ts`, since its "build Outfits" order is gone. Its Workflow ID changes with it: harmless on this unreleased branch, but ticket 12 should switch production while no Styling runs.
  - **The Privacy Policy's** Claude bullet now names the Brands and Products the AI Stylist gets, and the Budget Tier for a Budget Tier change; Gemini's says it gets only what a Preview needs. Not checked in the running app. The photo notice version isn't raised, as in ticket 02.
- 2026-10-24: **Results.** Typecheck is clean, all 962 tests pass, and all 9 end-to-end tests pass, the new Consultation's Full-Body Styling running through the Workflow's Local World. `next build` compiles the new Workflow. New tests: the body-photo save refusals, the repeated-Brand refusal, the fetch and search caps, the out-of-play search refusals, the turn cap and both new briefs in `src/server/operations/stylist.test.ts`; Brands unknown at search time and a body photo's stages in `stylings.test.ts`. **Not done:** a Styling, or the landing sample script, on real keys, which costs money and is the team's to run.
