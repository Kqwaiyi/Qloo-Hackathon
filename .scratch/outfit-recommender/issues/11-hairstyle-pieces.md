# 11: Hairstyle Pieces tailored to the photo

**What to build:** Each Outfit gets its Hairstyle Piece, tailored by the AI to the user's photo: the cut, the Style Icon who inspired it and one line on why it suits the user, with no price or link. If tailoring fails for a Style Icon, the next one quietly takes its place. With this, a Face Photo Consultation is complete apart from its Previews. Ticket 14 adds the Brand Pieces and the covered-hair rule for body photos.

**Blocked by:** [10 First Styling: Outfits inspired by ranked Style Icons](10-first-styling-style-icons.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (2. Tailor one Outfit's Pieces: In, Out, Hairstyle, Bad output; Fake adapter), "Stylings" (Stages; Tailoring failures), "Outfit assembly" (Categories by photo) and "Data model" (Pieces). Stories 94, 97, 98, 115 and 118.

- [x] The AI provider interface gains its tailoring operation, with structured output. In: the photo itself (never a stored text description of the person), the Photo Type, the age group, the Photo Style, the Outfit's line, the Style Icon's name, and each Piece's Category. Ticket 14 adds the Brand details. It never receives the Country or the Budget Tier.
- [x] Out, per Piece: `item`, a card label of about 6 words (for the Hairstyle, the cut); `details`, one sentence on colour, fabric, fit and cut, used for the Preview and not shown; and `why`, one line of about 20 words in English and second person. The Hairstyle also carries an "unknown cut" flag.
- [x] Output is checked against the schema and our rules (the expected Categories, no prices, no empty fields), retried once, then reported as "tailoring failed".
- [x] Building Outfits is its own Workflow stage, and each AI call is its own step.
- [x] A Style Icon whose tailoring fails after its retry is marked skipped and the next unused Style Icon is tried. A Styling makes at most 2 such substitutes, so a broken model can't burn through the Style Icons.
- [x] A Face Photo's Outfits are Hairstyle-only, each one the next Style Icon's Hairstyle. A Full-Body Photo's Outfits also get a Hairstyle Piece.
- [x] Pieces are stored per Outfit with their Category, `item`, `details`, `why` and, for the Hairstyle, the unknown-cut flag.
- [x] The fake adapter's tailoring is deterministic and built from its inputs: generic items in the right Categories, a `why` naming the Style Icon, and the cut marked as known. New scenarios: an unknown signature cut, and tailoring failure.
- [x] The Outfit card's Hairstyle row shows the cut, its Style Icon and why it suits, with no price and no link.
- [x] Tests cover Face Photo Outfits being Hairstyle-only, unknown-cut Hairstyles, and tailoring substitutes stopping at 2.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The interface.** `AiProvider.tailorPieces(input)` (`src/server/ai/provider.ts`) returns the model's reply unchecked, as `unknown`. `tailoredPiecesSchema` in the same file is the structured-output schema.
  - **For ticket 34:** the Gemini adapter should pass that schema as structured output, but a reply that doesn't match must come back rather than throw. For example, catch the AI SDK's "no object generated" error and return what the model sent. If it throws instead, bad output becomes a retried step and then "something broke", never a substitute.
  - `TailoringInput` has no field for the Country or the Budget Tier. A test checks what the fake was asked, with the photo compared by SHA-256.
- **The check.** `checkTailoredPieces` (`src/server/ai/tailoring.ts`) passes a reply only when:
  - it matches the schema;
  - it has exactly one Piece per Category asked for;
  - no field is empty after trimming;
  - there is no price anywhere (a currency sign or code beside a number, or a number of dollars, euros, pounds or bucks);
  - the Hairstyle says whether its cut is unknown.

  It returns the Pieces trimmed.
- **The steps.** `makeOutfits` is gone. In its place are `planOutfits`, a database read, and `tailorOutfit(stylingId, { position, styleIconId }, attempt)`: one step and one AI call each.
  - A bad reply returns `"ask-again"`, and the Workflow calls the step again with the next attempt, up to `TAILORING_ATTEMPTS` (2). A bad last attempt skips the Style Icon.
  - Errors the AI throws get the Workflow's default step retries. If they still fail, the Styling breaks, keeping any Outfit saved beside them (`waitForAll` in `build-outfits.ts`).
- **Substitutes.** Each round, `planOutfits` gives each open position the next unused Style Icon, so a substitute takes the failed one's position. A Styling tries at most Outfits wanted + `MAX_TAILORING_SUBSTITUTES` (2) Style Icons.
  - The count of failures is the new `styling.tailoring_failures` column, which the spec's data model doesn't list. It can't come from Style Icon statuses, because ticket 14 also skips Style Icons that can't complete an Outfit, and those don't count against the cap.
  - `finishStyling` closes any gap a position left when all its Style Icons failed, so the cards always read Outfit 1, 2….
  - Like `makeOutfits` before it, `planOutfits` only uses the Style Icons this Styling picked (`style_icon.styling_id`). Ticket 26's "Show 2 more Outfits" needs the Consultation's current list instead. `tailorOutfit` already checks the Style Icon by Consultation, not by Styling.
- **Categories.** `outfitCategories` (`src/server/outfit-assembly/categories.ts`) is the spec's Categories by photo, covered-hair rule included, with pure tests.
  - `tailorOutfit` keeps only the Hairstyle until ticket 14, which should remove its `.filter((category) => category === "hairstyle")`.
  - Until then, Body-Only Outfits and covered-hair Full-Body Outfits are saved with no Pieces and no AI call.
  - Ticket 14's server test for covered hair is still to write.
- **Data.**
  - The new `piece` table holds the Outfit, `category` (an enum of the four Categories; ticket 16 adds One-Piece), `item`, `details`, `why` and `unknown_cut`. A CHECK makes `unknown_cut` set exactly for the Hairstyle, and each Outfit has one Piece per Category. Ticket 14 adds the Brand columns.
  - Migration 0004 backfills `tailoring_failures` as 0.
  - `BlobStore.get(pathname)` is new. The tailoring step reads the photo by its pathname, never through step arguments.
- **The fake adapter.**
  - Tailoring builds generic items for all four Categories (Top, Bottom and Shoes are ready for ticket 14, without Brands), and each `why` names the Style Icon.
  - `unknown-cut` marks the cut unknown, with a `why` that doesn't name the Style Icon.
  - `tailoring-fails` breaks a different rule on each reply: a price, an empty field, a missing Category, a Category twice, or not the schema at all.
  - Tests can fail particular Style Icons with `styleIconScenarios`. `tailoringRequests` records each request, with only the photo's SHA-256.
- **The card.** `OutfitView.pieces` holds each Piece's Category, item and `why`, never its `details`. The Hairstyle row shows the Category, the cut, "Style Icon: <name>" and `why` in italics, with no price and no link.
- **Checked in the browser.** Two throwaway Playwright runs against local development went through the Workflow Local World. The `pass` scenario gave two Hairstyle cards. `tailoring-fails` gave "No Outfits" after the asks-again and both substitutes. They made 2 live Qloo calls on 2026-10-16.
