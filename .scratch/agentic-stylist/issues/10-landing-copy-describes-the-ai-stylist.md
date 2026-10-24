# 10: Landing copy describes the AI Stylist

**What to build:** Wherever the landing page says what Qloo and the AI do, it now says that Qloo finds the candidates, and the AI Stylist chooses among them, picks real Products and checks each Preview. It replaces lines like "Qloo decides what to recommend. The AI picks real Products and shows them on you." The frozen landing sample stays as it is, and the landing page shows no Stylist's Notes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Consent, legal and landing copy". Story 70.

- [x] The opening chapter's line, and any other chapter that says what Qloo and the AI do, describe the AI Stylist as above.
- [x] The photo-check chapter keeps its wording: that's the photo check, not the Stylist.
- [x] The first mention says "AI Stylist".
- [x] The frozen landing sample isn't remade, and no notes appear on the landing page.
- [x] The landing end-to-end tests still pass. Check the copy by eye in the running app.

## Comments

- 2026-10-24: The landing copy now describes the AI Stylist. The app calls it "your AI Stylist", so the landing page does too.
  - **The opening chapter's line** (`chapters/opening.tsx`) now reads "Qloo finds the candidates. Your AI Stylist chooses among them, picks real Products and checks each Preview." It's the page's first mention of AI.
  - **Style Icons** (`chapters/style-icons.tsx`): "Each one inspires one Outfit." is now "Each inspires one Outfit, unless your AI Stylist passes it over." The Stylist takes Style Icons in Qloo's order (ADR-0010), so it doesn't say the Stylist picks freely.
  - **Brands** (`chapters/brands.tsx`): "Qloo picks the Brands…" is now "Qloo finds the Brands…", followed by "Your AI Stylist chooses among them to suit the photo and the rest of the Outfit."
  - **Ready to shop** (`chapters/ready-to-shop.tsx`): "Change the Budget Tier or Photo Style and Qloo picks again." is now "…, and Qloo finds new candidates for your AI Stylist to choose from."
  - **Unchanged:** the photo-check chapter, the frozen sample and its data, and "Hidden from Qloo". The page reads no notes: `LandingSample` has no field for them.
  - **The comments** in `page.tsx`, `opening.tsx`, `ready-to-shop.tsx` and `format.ts` follow the new copy. Statement's comment now cites ADR-0010 instead of ADR-0001.
  - **Results:** typecheck is clean, all 1,018 tests pass, and the 3 landing end-to-end tests pass. No test was added, since the spec says landing copy isn't tested automatically. The copy was read in the running app at desktop and phone widths. The Statement's fill still runs word by word, and nothing scrolls sideways.
- 2026-10-24: **Left for the team.**
  - **The closing chapter** (`chapters/closing.tsx`) still says "Your photos go to Google's Gemini to make your Previews." `frame.tsx` calls it the line that "says where photos go before anyone signs up". Since ticket 01, photos also go to Anthropic's Claude, but neither the spec's landing bullet nor ticket 01 covers this line. `e2e/landing.spec.ts` asserts this exact sentence and that Gemini is named once. Deciding whether to name Anthropic here is for the team.
  - **The hero caption** "Picked with Qloo's taste data, shown on you", and the site description in `src/app/layout.tsx` ("Complete Outfits picked with Qloo's taste data and shown on you."), are unchanged. They say nothing about the AI that is now untrue.
