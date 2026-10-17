# 28: Change the Budget Tier

**What to build:** A user who sent a body photo changes the Budget Tier from the results header and gets new Outfits from the same Style Icons at the new price point. As with a Photo Style change, the new Outfits replace the current ones only on success; otherwise the user keeps the old tier's Outfits and is told why.

**Blocked by:** [15 Budget Tiers with thin-pool widening](15-budget-tiers-widening.md), [27 Change the Photo Style](27-change-photo-style.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (the Budget Tier change row; Finishing), "Outfit assembly" (De-duplication), "Outfit Allowance, limits and backstops" (No reuse), "Pages" (Results page header; Styling step) and "User-facing copy" (Styling and results). Stories 112 and 114.

- [x] A body photo's results header has a Budget Tier dropdown, with the allowance line beside it, disabled with the time when the usage summary says no Styling can start. A Face Photo has none.
- [x] A change starts a Styling of kind "Budget Tier change" through the shared start check. It enters at Brands from the top of the current Style Icons, with de-duplication over the Outfits it builds.
- [x] On success, the new Outfits and Budget Tier switch in together, replacing the current Outfits.
- [x] On failure, the old Outfits stay, with "We couldn't build Outfits at <tier> for this photo. Your <previous tier> Outfits are still here."
- [x] The Styling step returns with Checking your photo and Finding Style Icons already ticked.
- [x] It works from a Consultation with "No Outfits".
- [x] Switching back to an earlier tier builds new Outfits; nothing is reused beyond the Qloo cache.
- [x] Tests cover a Budget Tier change switching in only on success, and a failed one keeping the old Outfits.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The operation.** `changeBudgetTier(ctx, consultationId, budgetTier)` (`src/server/operations/stylings.ts`) plugs into `startStylingOn` like the other two. Holding the Consultation's row, it refuses with:
  - `no-budget-tier` for a Face Photo;
  - `same-budget-tier` when the tier is already the Consultation's.

  Otherwise it starts a `budget_tier_change` Styling at the Consultation's Photo Style. The server action `changeBudgetTierAction` parses the tier with `z.enum(BUDGET_TIERS)`.
- **Its own copy of the current Style Icons**, as ticket 26 suggested. The Styling gets the current list from the top, all unused, through `NewStyling.copiesStyleIconList`. `createStyling` (`src/server/stylings/start.ts`) copies the rows in the same transaction, so the change starts at `brands` with them already in place.
  - It builds on that copy like any non-"more" Styling. De-duplication covers only the Outfits it builds, and it fetches Brands as needed at the new tier.
  - On success, its copy becomes current through its Outfits, so "Show 2 more Outfits" carries on down it.
  - On failure, the current list keeps its statuses. A failed "more" can't block the change, and a failed change can't use up the current list.
  - `readCurrentStyleIconList` (`src/server/stylings/current-outfits.ts`) finds the current list: the one behind the current Outfits or, with No Outfits, the latest list ranked for the Consultation's Photo Style. A failed Photo Style change's list is for words the Consultation never took on, so it's left out.
  - **With no list at all**, such as a first Styling that broke before Qloo answered, the change starts at `style_icons` and ranks its own, as a first Styling does. On that path, "Finding Style Icons" isn't ticked in advance. If Qloo found no one, it fails cheaply from the cache.
- **Where Style Icons come from.** The `ranksStyleIcons` step now goes by stage (`stage === "style_icons"`) rather than kind. This clears ticket 26's known limit: where a Styling starts is now its created stage alone.
- **The `styleIconsRankedBy` → `styleIconList` rename.** A list is named by the Styling it belongs to, ranked or copied: `BuildingBeside.styleIconList` and `readCurrentStyleIconList`.
- **Finishing** needed nothing new. Ticket 27 already switches in the Budget Tier with the Outfits.
- **Saying it failed.** `FailedRestyling` gains `{ kind: "budget_tier_change"; budgetTier }`. The page shows:
  - nothing built, with Outfits: "We couldn't build Outfits at Medium for this photo. Your Low Outfits are still here." (the spec's line);
  - nothing built, from No Outfits: "We couldn't build Outfits at Medium for this photo. Try another Budget Tier or Photo Style.";
  - broke: "Something went wrong while styling. Your Low Outfits are still here.", or just the first sentence. `COPY.photoStyleChangeBroke` became `COPY.restylingBroke`, shared by both kinds.
- **The header.**
  - `BudgetTierDropdown` (`consultations/[id]/budget-tier-dropdown.tsx`) shows for body photos only, above the Photo Style editor. The "· Budget Tier: X" in the subtitle is gone, since the dropdown shows it.
  - Picking another tier shows "Get new Outfits" and "Cancel". Picking alone starts nothing, so stepping through the tiers with the arrow keys, which fires `change` on a closed select in some browsers, can't start a Styling. Cancel puts the tier back and returns focus to the dropdown.
  - Both controls are disabled while no Styling can start, or while "Show 2 more Outfits" runs.
  - One `AllowanceLine` (`allowance-line.tsx`) sits under both controls, which it describes, and shows `LimitMessage` when no Styling can start. `MoreOutfits` uses it too. The Photo Style editor no longer draws its own line: it takes `canStart` and `allowanceLineId`.
  - `useStylingRequest` (`use-styling-request.ts`) is the send and request-failed handling the dropdown, the editor and `MoreOutfits` share. This clears ticket 27's known limit.
- **Tests.** `src/server/operations/stylings.test.ts` gains "a Budget Tier change". It covers:
  - starting at Brands with the old Outfits and tier kept meanwhile;
  - building from the top of the same Style Icons at the new tier, with the person call left out even with Qloo's answers expired and Qloo finding others. The new Outfits switch in with the tier, replacing the old ones, and count. "Show 2 more Outfits" then carries on down the copy, from a Style Icon the replaced Outfits had used;
  - building nothing: the old Outfits, tier, allowance and Style Icons kept, so "Show 2 more Outfits" carries on down the old list;
  - breaking, which says so;
  - No Outfits, failing then succeeding from the first Styling's Style Icons;
  - finding its own Style Icons when there are none;
  - going back to an earlier tier: new Outfits, with only Qloo's cache reused;
  - `same-budget-tier` and `no-budget-tier`;
  - the shared start check, `already-styling` and owner-only access.
- **Checked in the browser.** A throwaway Playwright run used local development with the fake AI, an on-disk scratch database and live Qloo, for a womenswear, United Kingdom Body-Only Photo. It showed:
  - the dropdown at No Budget with the allowance line;
  - "Get new Outfits" and "Cancel" after a pick, and Cancel putting it back with focus on the dropdown;
  - the Photo Style editor opening beside it and closing on Escape;
  - the Styling step with "Checking your photo" and "Finding Style Icons" ticked;
  - Low Outfits replacing the No Budget ones, with "Uses 2 of your 6 Outfits left today";
  - no sideways scroll at phone width.

  A second server run with `FAKE_AI_SCENARIO=tailoring-fails` showed a change to Medium failing with "We couldn't build Outfits at Medium for this photo. Your Low Outfits are still here.", with the Low Outfits and dropdown kept. There were no console errors. "Show 2 more Outfits" wasn't pressed in the browser after its switch to `useStylingRequest`; the server tests and the dropdown's run cover the same path.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - the stale "ranked by" names;
    - `BudgetTierPicker` renamed to `BudgetTierDropdown`, since New Consultation has a private `BudgetTierPicker` too;
    - the Style Icon copy moved from the read-only `current-outfits.ts` into `createStyling`;
    - the shared request hook;
    - one ternary for the broken line;
    - one constant for the header line's id.
  - **Left as known limits:**
    - `ranksStyleIcons` (by stage), `readBuildingBeside`/`finishStyling` (by `addsToCurrentOutfits`) and `copiesStyleIconList` look like one question answered three ways. They answer three different questions: does it rank, does it add, and what does it copy.
    - `canStart` and `allowanceLineId` travel together into both header controls.
    - While the Photo Style editor is open, the shared allowance line sits below its word grid, further from the dropdown it also describes.
  - **For the team to approve:**
    - ranking new Style Icons when the Consultation has none. The spec's row says Brands; the alternative is refusing and leaving the case to Try again (ticket 29);
    - the copied Style Icon rows: the spec's Data model says each row is one "the Styling that picked it" ranked;
    - "re-styling" (in the spec's copy, `FailedRestyling`, `restylingBroke` and `canRestyle`) isn't in `GLOSSARY.md`;
    - pick, then "Get new Outfits", rather than starting on pick as the prototype did;
    - copy the spec doesn't fix:
      - the No Outfits and broken failure lines;
      - "Get new Outfits" and "Starting…" beside the dropdown;
      - "We couldn't change the Budget Tier just now. Try again in a moment." when the request itself fails.
- **For ticket 29:** a broken Budget Tier change has no Try again yet: its failure line is where the button goes. A Try again of one can build on the same copy, since its list is already saved.
- **Live calls used:** 1 read-only Qloo person call and 9 Brand calls on 2026-10-17 in the browser check. The re-run after review came from the cache.
