# 29: Failed Stylings and Try again

**What to build:** When a new Consultation's first Styling can't build any Outfit, the Consultation is kept with a message suggesting another Budget Tier or Photo Style, so the user can try again from the same photo. When a Styling breaks, the user sees "Something went wrong while styling." with Try again, which picks up where it broke without re-checking the photo, so a passing outage doesn't force a retake.

**Blocked by:** [13 Styling progress checklist](13-styling-checklist.md), [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (the Try again row; Finishing), "Server operations" (try again) and "User-facing copy" (Styling and results). Stories 116 and 117.

- [x] A first Styling that failed with "nothing could be built" keeps the Consultation ("No Outfits") and shows "We couldn't build Outfits for this photo at <tier>. Try another Budget Tier or Photo Style." A Face Photo, which has no tier, gets a version that suggests only the Photo Style.
- [x] A Styling that failed with "something broke" shows "Something went wrong while styling." with a Try again button.
- [x] Try again starts a Styling of kind "try again" through the shared start check. It resumes from the stage that broke, or from Style Icons if there are none yet, makes Outfits as the kind that failed would have, and never re-runs the photo check.
- [x] Try again is disabled with the time when the usage summary says no Styling can start.
- [x] The Styling step returns with the finished stages already ticked.
- [x] Tests cover a failed new Consultation, and Try again resuming without a photo check.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **Which failures Try again picks up.** A Styling that broke, of any kind but "Show 2 more Outfits". Ticket 26 already decided that a failed "more", for either reason, ends "more" for that photo with the run-out line, and the spec's copy says the same. So a broken "more" gets the run-out line, not Try again. A Styling that built nothing gets no Try again either: its line suggests another Budget Tier or Photo Style, from the header's controls.
- **Reading the failure.** `readLatestFailedStyling` (`src/server/stylings/failed.ts`) is the one reader of "the Consultation's latest Styling, if it failed". It returns what it built for, why it failed and where it stopped. This clears ticket 27's known limit: `readFailedRestyling` no longer reads Styling rows from the Consultation operations.
  - **A Try again counts as the kind it tried again**, so its failure line, and any Try again after it, follow that kind. No column records it. Try again starts only when the latest Styling broke, so a run of Try agains all try again the Styling just before them: the latest that isn't a Try again (`readFailedStylingKind`).
  - `ConsultationView.failedRestyling` became `failedStyling`, and `FailedRestyling` became `FailedStyling`. It gains `{ kind: "first"; budgetTier }`, with `null` for a Face Photo. `COPY.restylingBroke` became `COPY.stylingBroke`.
- **The operation.** `tryAgain(ctx, consultationId)` (`src/server/operations/stylings.ts`) plugs into `startStylingOn` like the other three. Holding the Consultation's row, it refuses with `nothing-to-try-again` unless the latest Styling broke. Otherwise it starts a `try_again` Styling for the broken one's Budget Tier and Photo Style:
  - **It broke at Style Icons**, so it saved none: it starts at `style_icons` and ranks its own, as the broken one would have.
  - **Further in**, it starts at Brands, or at Building Outfits for a Face Photo, on its own copy of the broken one's list, **statuses kept** (`copiesStyleIconList: { from, statuses: "kept" }`). It passes over the Style Icons that one skipped, and the broken list stays as it was. A Budget Tier change's copy now says `statuses: "unused"`.
  - A body photo that broke while tailoring starts again at Brands, since Brands aren't saved. Its Brand calls come from Qloo's cache, and both stages are the checklist's Building Outfits.
  - **Finishing** needed nothing new. A `try_again` doesn't add to the current Outfits, so its Outfits replace them, with its Budget Tier and Photo Style, as a first Styling's or a re-styling's would. A first Styling has none to replace.
  - The photo check runs only in `startConsultation`, so no Styling re-runs it.
- **The page.**
  - Under the header, the failure line now covers a first Styling too:
    - built nothing: "We couldn't build Outfits for this photo at No Budget. Try another Budget Tier or Photo Style."; a Face Photo's: "We couldn't build Outfits for this photo. Try another Photo Style." (`COPY.firstStylingBuiltNothing`);
    - broke: "Something went wrong while styling.", with "Your <previous> Outfits are still here." after a re-styling that kept some.
  - When it broke, `TryAgain` (`consultations/[id]/try-again.tsx`) sits under the line, with its own allowance line. It's disabled, with `LimitMessage` in the line's place, when the usage summary says no Styling can start. Sent, it shows "Starting…" and the page refreshes into the Styling step. The checklist is ticked up to the stage it starts at: the photo check at Style Icons, and the Style Icons too from Brands or Building Outfits.
  - The server action `tryAgainAction` refreshes the page whatever the result, except `signed-out`.
- **Tests.** `src/server/operations/stylings.test.ts`:
  - "a first Styling that can't build anything" now checks the failure the page shows, for a body photo and a Face Photo, built nothing or broken.
  - A new "Try again" block covers:
    - a first Styling broken at Style Icons, picked up there with no photo check (the fake's count and the usage records) and only its own Outfits counted;
    - a Face Photo broken mid-tailoring, carrying on down the same Style Icons with no Qloo call, passing over the one it had skipped, and leaving the broken list as it was (checked to fail with the statuses reset);
    - a broken Photo Style change, tried again into new Outfits, Style Icons and Photo Style, which "Show 2 more Outfits" then carries on down;
    - a broken Budget Tier change, tried again from Brands, keeping the old Outfits and tier meanwhile, then replacing them with Brand calls at the new tier only;
    - a Try again that breaks, then builds nothing, each failure line read as the Photo Style change it tried again;
    - `nothing-to-try-again` after a success, after building nothing, and after a broken "Show 2 more Outfits";
    - the shared start check, with the usage summary agreeing, plus `already-styling` and owner-only access.
  - `styleIconStatuses` takes an optional kind.
- **Checked in the browser.** A throwaway Playwright run against local development used the fake AI, an on-disk scratch database and live Qloo. Qloo was "broken" by pointing `QLOO_API_URL` at the dev server itself: its 404 is fatal, so a Styling breaks at once. Across four server runs it showed:
  - a first Styling broken: the line, Try again with "Uses 2 of your 10 Outfits left today", and No Outfits, at desktop and phone width with no sideways scroll;
  - Try again, still broken: the Styling step with "Checking your photo" ticked, then the line again;
  - with Qloo back, Try again: the step, then two Outfits, with 8 Outfits left;
  - a Budget Tier change to Low, broken: "Something went wrong while styling. Your No Budget Outfits are still here.", with the Outfits and Try again;
  - with `FAKE_AI_SCENARIO=tailoring-fails`:
    - Try again on that: the step with the photo check and Style Icons ticked, then "We couldn't build Outfits at Low for this photo. Your No Budget Outfits are still here." with no Try again;
    - new Full-Body and Face Photo Consultations: both first-Styling lines.

  The disabled state wasn't reached live; the server test and the shared `AllowanceLine` cover it.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - a test for a Photo Style change's Try again succeeding;
    - a comment on why a body photo starts again at Brands;
    - one `styleIconStatuses` helper;
    - the `tryingAgain` name;
    - a clearer `readFailedStylingKind` comment;
    - an unexported type.
  - **Left as known limits:**
    - A Try again of a first Styling fetches Brands as needed, not 3 up front. The spec's "as for the kind that failed" is its Outfits column, and the up-front fetch is "the first Styling's".
    - Each Try again makes its own copy of the list, rather than building on the broken one's as ticket 28 suggested, so every list stays named by its own Styling. Each Try again also gets its own 2 tailoring substitutes. The spec's cap is per Styling, and each Try again is the user's press.
    - `LatestFailedStyling` (flat, for the operation) and `FailedStyling` (a union, for the page) are two shapes of one failure. The same switch on kind appears in the reader, the view and the line.
    - `tryAgainAction` is the fourth server action of the same shape. `TryAgain` repeats `MoreOutfits`' button, line and alert, and `stylingStart` and `outfitsLeft` travel together into both.
  - **For the team to approve:**
    - Try again for every broken kind but "Show 2 more Outfits", not only a first Styling (story 117);
    - Try again's own allowance line. Story 123 asks for one beside every action that uses Outfits, but the header's identical line sits just above, so a broken re-styling's page shows three;
    - copy the spec doesn't fix: "Starting…", and "We couldn't start styling again just now. Try again in a moment." when the request itself fails;
    - "…for this photo at No Budget.", which is the spec's `<tier>` taken literally;
    - copied Style Icon rows (ticket 28's question), now for a second kind, with statuses kept;
    - `GLOSSARY.md`'s Styling entry doesn't list Try again, and "re-styling" still isn't in it. Both are for `/domain-modeling`.
- **Live calls used:** 1 read-only Qloo person call and 8 Brand calls on 2026-10-17 in the browser check.
