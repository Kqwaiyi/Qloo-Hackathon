# 27: Change the Photo Style

**What to build:** A user who wants a different style picks 1–2 words from the Photo Style list in the results header. Qloo picks new Style Icons for that style and new Outfits replace the current ones, but only if the new Styling builds at least one; otherwise the old Outfits stay, with a message saying so. It works for every Photo Type, including a Consultation that ended with no Outfits.

**Blocked by:** [13 Styling progress checklist](13-styling-checklist.md), [14 Body-photo Outfits: Brands become Pieces](14-body-photo-brands.md), [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (the Photo Style change row; Finishing), "Outfit assembly" (De-duplication), "Data model" (Style Icons), "Pages" (Results page header; Styling step) and "User-facing copy" (Styling and results). Stories 113–115. [ADR-0002](../../../docs/adr/0002-photo-style-steers-style-icons.md).

- [x] The results header has a Photo Style editor that takes 1–2 words from the configured list, with the allowance line beside it. It is disabled with the time when the usage summary says no Styling can start.
- [x] A change starts a Styling of kind "Photo Style change" through the shared start check. It enters at Style Icons with the new Photo Style, and its Style Icon list becomes current only if the Styling succeeds.
- [x] De-duplication covers the Outfits it is building.
- [x] On success, the new Outfits, Style Icons and Photo Style switch in together, replacing the current Outfits.
- [x] On failure, the old Outfits and Photo Style stay, with the Photo Style version of "We couldn't build Outfits at <tier> for this photo. Your <previous tier> Outfits are still here."
- [x] The Styling step returns with Checking your photo already ticked.
- [x] It works from a Consultation with "No Outfits".
- [x] Tests cover a Photo Style change switching in only on success, and a failed one keeping the old Outfits.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The operation.** `changePhotoStyle(ctx, consultationId, photoStyle)` (`src/server/operations/stylings.ts`) runs the shared start check, then, holding the Consultation's row, refuses with `not-found`, `already-styling` or `same-photo-style`, or creates a `photo_style_change` Styling at `style_icons` and launches it.
  - **Shared with "Show 2 more Outfits".** Both now go through `startStylingOn`, which does the sign-in, the start check, the row lock, `already-styling` and the launch. Each operation passes only its own `plan`: what the Styling builds, or its own refusal. **For tickets 28 and 29:** the Budget Tier change and Try again should plug in the same way. **For ticket 30:** `already-styling` now lives in `startStylingOn`, one place to swap for the lock.
  - `same-photo-style` compares words in any order (`isSamePhotoStyle`). Qloo hears ["edgy", "chic"] and ["chic", "edgy"] as the same tags, so a reorder would rebuild from the same Style Icons, which is the "regenerate" the spec rules out.
  - The server action `changePhotoStyleAction` parses the words with `photoStyleWordsSchema` (1 or 2 different words from `PHOTO_STYLES`) and refreshes the page whatever the result, except `signed-out`.
- **Nothing new in the steps.** `readBuildingBeside` already treats every kind but "more" as building on its own ranked list, beside nothing, from Outfit 1. So the Styling ranks Style Icons for its own Photo Style (`fetchStyleIcons` reads the Styling's), fetches Brands as needed (only a first Styling fetches 3 up front), and de-duplicates over the Outfits it builds only.
- **Finishing.** `finishStyling`, for a Styling that made Outfits and doesn't add to the current ones, now un-currents the old Outfits, switches in the new ones, and sets the Consultation's Photo Style **and Budget Tier** from the Styling's, in one transaction. **For ticket 28:** the Budget Tier half is already there.
  - Its Style Icon list becomes current through its Outfits, as ticket 26 planned: a failed change's list is never followed by "Show 2 more Outfits". Replaced Outfits stay in the database, not current, and their Previews stay in Blob until the Consultation is deleted.
  - A failed change keeps everything: the Consultation goes back to ready, or No Outfits.
- **Saying it failed.** `ConsultationView.failedRestyling` is set while the Consultation's latest Styling (by start time) is a failed Photo Style change: its Photo Style and failure reason. A later Styling clears it. The page shows, under the header:
  - nothing built, with Outfits: "We couldn't build edgy and chic Outfits for this photo. Your casual Outfits are still here.";
  - nothing built, from No Outfits: "We couldn't build sporty Outfits for this photo. Try another Budget Tier or Photo Style." (only "Photo Style" for a Face Photo);
  - broke: "Something went wrong while styling. Your casual Outfits are still here.", or just the first sentence from No Outfits.
  - **For ticket 28:** add `{ kind: "budget_tier_change"; budgetTier }` to `FailedRestyling` and its wording in `failedRestylingLine` (`consultations/[id]/page.tsx`). **For ticket 29:** a broken change has no Try again yet; its line is where the button goes.
- **The editor** (`consultations/[id]/photo-style-editor.tsx`), in the header:
  - At rest: the Photo Style's words, "Change", and the allowance line under them. "Change" is disabled with `LimitMessage` in the line's place when the usage summary says no Styling can start, and while "Show 2 more Outfits" runs.
  - Open: the 11 words as toggles, in pick order (the first picked is the strongest). Once 2 are picked the rest are disabled. "Get new Outfits" stays disabled until the pick differs from the current Photo Style. Cancel or Escape closes it, and focus returns to "Change".
  - Sent, the page refreshes into the Styling step, whose checklist starts with "Checking your photo" ticked, since the Styling starts at `style_icons`.
  - The header is now top-aligned, so the photo stays put as the editor opens.
- **Tests.** `src/server/operations/stylings.test.ts` gains "a Photo Style change". It covers:
  - starting at Style Icons with the old Outfits and Photo Style kept meanwhile;
  - the person call in tune with the new words, then the new Outfits and Photo Style switched in together, replacing the old, and counted;
  - building nothing: the old Outfits, Photo Style and allowance kept, with what it tried;
  - breaking: the same, saying so;
  - its Style Icons followed by "Show 2 more Outfits" only after it succeeds (checked to fail without replacing the old Outfits);
  - a body photo's Brands repeating none across the Outfits it builds, whatever the replaced ones used, at the Consultation's Budget Tier;
  - No Outfits, failing then succeeding;
  - going back to an earlier Photo Style building new Outfits, with only Qloo's answer reused;
  - the words schema, `same-photo-style`, one Outfit left, `already-styling` (also against "Show 2 more Outfits" at once), the shared start check and owner-only access.

  `moreStylingsOf` became `stylingsOfKind`.
- **Checked in the browser.** A throwaway run against local development (fake AI, in-memory database, live Qloo) showed, for a Face Photo:
  - the header's "Change" and allowance line;
  - the editor's states, including Escape;
  - the Styling step returning with the photo check ticked;
  - edgy and chic Outfits replacing the casual ones;
  - "Show 2 more Outfits" carrying on down the new list;
  - "Change" disabled while that ran and, after 10 Outfits, "You've made today's 10 Outfits. More from <time>.";
  - no sideways scroll at phone width;
  - with the `tailoring-fails` scenario, a No Outfits Consultation whose change to sporty failed, with its line.

  There were no console or server errors.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - the failure line now follows the failure reason, so a broken change doesn't claim nothing could be built;
    - the allowance line shows beside the editor at rest too;
    - a test for going back to an earlier Photo Style;
    - one `tryAnother` for the "Try another…" wording;
    - clearer names (`stylingRunning`, `allowanceLine`);
    - `CurrentConsultation` built on `PhotoCategoryFacts`;
    - a stale doc comment on `NewStyling.stage`;
    - one `stylingsOfKind` test helper.
  - **Left as known limits:**
    - the editor's send and request-failed handling repeat `MoreOutfits`';
    - the two server actions are alike;
    - `readFailedRestyling` reads Styling rows from the Consultation operations;
    - the editor's "2" comes from the `PhotoStyleWords` type rather than a config number.
  - **For the team to approve:**
    - refusing a reordered Photo Style as unchanged;
    - copy the spec doesn't fix:
      - the Photo Style failure lines above (the spec asks only for "the equivalent wording");
      - the No Outfits and broken versions;
      - the editor's hint "Pick 1 or 2 words. Qloo finds new Style Icons in that style for your new Outfits.";
      - "Get new Outfits" and "Starting…";
      - "We couldn't change the Photo Style just now. Try again in a moment." when the request itself fails.
- **Live calls used:** 5 read-only Qloo person calls on 2026-10-17 in the browser check, no Brand calls.
