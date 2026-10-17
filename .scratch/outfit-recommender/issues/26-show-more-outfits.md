# 26: Show 2 more Outfits

**What to build:** On the results page, "Show 2 more Outfits" builds two new Outfits from the next unused Style Icons and adds them below the current ones, which stay visible meanwhile. Each new Outfit is different: no Brand repeats in a Category across the current Outfits. When the Style Icons run out, the user is told and pointed to another Budget Tier or Photo Style.

**Blocked by:** [13 Styling progress checklist](13-styling-checklist.md), [14 Body-photo Outfits: Brands become Pieces](14-body-photo-brands.md), [22 Outfit Allowance, photo-check limit and the usage summary](22-outfit-allowance-usage-summary.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (the "Show 2 more Outfits" row; How many Outfits; Finishing), "Outfit assembly" (De-duplication), "Pages" (Results page: "Show 2 more Outfits") and "User-facing copy" (Styling and results). Stories 107–111 and 115.

- [x] "Show 2 more Outfits" starts a Styling of kind "more" through the shared start check. It enters at Brands for the next unused Style Icons, fetching Brands as needed within the limit of 6 Style Icons per Styling. For a Face Photo, each new Outfit is the next Style Icon's Hairstyle.
- [x] The current Outfits stay visible while it runs. The button becomes a compact progress checklist, and the new Outfits appear together, below the current ones, once both are ready.
- [x] No Brand repeats within a Category across the existing current Outfits and the new ones.
- [x] With one Outfit left in the allowance, it makes one.
- [x] The allowance line "Uses <n> of your <left> Outfits left today" sits beside the button, and the button is disabled with the time when the usage summary says no Styling can start.
- [x] When the Style Icons run out, the button is replaced by "That's every Outfit we can build for this photo. Try another Budget Tier or Photo Style for more." A Face Photo suggests only the Photo Style. A failed "Show 2 more Outfits" keeps the current Outfits and shows the same line in place of the button.
- [x] Tests cover de-duplication against the current Outfits, the one-left case, and running out.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The operation.** `showMoreOutfits(ctx, consultationId)` (`src/server/operations/stylings.ts`) runs the shared start check. Then, holding the Consultation's row, it refuses with `not-found` (someone else's), `already-styling` (a Styling runs on it) or `every-outfit-built`. Otherwise it creates a `more` Styling and launches it.
  - The server action `showMoreOutfitsAction` (`consultations/[id]/actions.ts`) refreshes the page whatever the result, except `signed-out`, which goes to sign-in.
  - It doesn't check email verification. The spec gates only New Consultation, and only a verified user can have Outfits.
  - **For ticket 30:** `already-styling` is its own refusal, outside `checkStylingStart`, so it comes after the limits. The per-Consultation lock should replace it, after the region gate and before the limits.
- **The current Style Icons.** A "more" Styling carries on down the Consultation's current Style Icons, found through its current Outfits: each one's Style Icon names the Styling that ranked the list.
  - `readBuildingBeside` (`src/server/stylings/current-outfits.ts`) gives a Styling what it builds beside: that list, the current Outfits' Brand picks for de-duplication, and the number after theirs. Other kinds build on their own list, beside nothing.
  - `addsToCurrentOutfits(kind)` (`src/config/stylings.ts`) is the one rule for "more", used by the steps, finishing and the page.
  - **For ticket 27:** a Photo Style change's new list becomes current through its Outfits, with nothing more to do here.
- **Where it starts.** `createStyling` now takes the stage. A first Styling starts at `style_icons`. "More" starts at `brands` for a body photo, or at `building_outfits` for a Face Photo (`outfitsStage`).
  - A new first step, `ranksStyleIcons`, skips the Style Icons stage for "more".
  - Brands are fetched as needed, 2 at a time, for at most 6 Style Icons. Style Icons fetched by an earlier Styling come from the Qloo cache.
- **Numbering.** The new Outfits are planned and switched in after the current ones, as Outfit 3 and 4.
- **Running out.** `ConsultationView.everyOutfitBuilt` is true once no current Style Icon is left unused.
  - A failed "Show 2 more Outfits", for either reason, marks the rest `skipped` in `finishStyling`. So the run-out line shows and the operation refuses, as the spec asks.
  - A Consultation with no current Outfits (No Outfits, or its first Styling still running) also reads true, though the page shows no button there.
  - **For ticket 28:** a Budget Tier change "from the top of the current Style Icons" can't reuse those rows' statuses. After a failed "more" they're all skipped, and the run-out line would outlast the very tier change it suggests. Giving the tier change its own copy of the list, ranked by its own Styling, keeps the statuses apart and keeps the old ones if it fails. `readBuildingBeside` already follows whichever list the current Outfits came from.
- **The status and the page.** `StylingProgressView` gains `kind`. The results page shows the full Styling step only for a Styling that doesn't add to the current Outfits. Otherwise it shows the results, with `MoreOutfits` (`consultations/[id]/more-outfits.tsx`) below the Outfits:
  - the "Show 2 more Outfits" button with the allowance line under it, or disabled with `LimitMessage` when the usage summary says no Styling can start (with no line for `unverified`, who can't have Outfits);
  - once pressed, the compact checklist, "Styling more Outfits": Building Outfits, then Generating Previews (n of N), with the slow note. It polls like the full one (`useStylingProgress`), until the page refreshes with the new Outfits;
  - the run-out line in its place once every Outfit is built. A Face Photo's suggests only the Photo Style.
  - The checklist itself is now `StylingChecklist` in `styling-step.tsx`, shared by the full step and the compact one. Its `from` leaves out the items a Styling never goes through.
  - Focus moves to the "More Outfits" region when the button is pressed, and stays there as the checklist and then the new Outfits arrive.
- **Tests.** `src/server/operations/stylings.test.ts` gains a "Show 2 more Outfits" block. It covers:
  - a Face Photo's next Hairstyles added below, with no new person call;
  - a body photo's Brands repeating none in a Category across all four Outfits (checked to fail without the current Outfits in de-duplication);
  - the status's kind and starting stage;
  - running out, then refusing;
  - a failed one keeping the Outfits after Brand calls for at most 6 Style Icons, then the run-out line;
  - one Outfit left making one;
  - two presses at once starting one;
  - the shared start check (the allowance and the region) and owner-only access.

  The file now clears usage records before each test, since the app-wide caps count every user's Outfits.
- **Checked in the browser.** A throwaway Playwright run against local development (fake AI, in-memory database, live Qloo) showed:
  - for a Face Photo: the button and allowance line; the compact checklist with Outfits 1–2 still shown; Outfits 3–4 below; a reload mid-Styling keeping both; and, after 10 Outfits, the button disabled with "You've made today's 10 Outfits. More from <time>.";
  - no sideways scroll at phone width, and no console or server errors;
  - for a Body-Only Photo (womenswear, United Kingdom, 35–44): four Outfits with no Brand repeated in a Category. The Tops were Primark, Topshop, Chanel and Free People; the Bottoms ASOS, Topshop, Mango and Chanel; the Shoes Topshop, Jimmy Choo Ltd, Zara and ASOS.
  - The run-out line wasn't reached live, since Qloo gave far more Style Icons than the allowance lets one user use. The server tests cover it.
- **Code review.** It was a two-axis review: standards and spec.
  - **Fixed:**
    - one `addsToCurrentOutfits` rule in place of four `kind === "more"` checks;
    - the current Outfits' Brand picks typed as `brandsUsedBy` takes them;
    - a doc comment that restated a config number, a missing doc comment and a garbled comment;
    - clearer names: `hasCurrentStyleIconLeft`, and `sending` for the button's transition, as elsewhere.
  - **Left as known limits:**
    - Where a Styling starts is both its created stage and the kind check in `ranksStyleIcons`.
    - The unused-Style-Icon filter and the Brand-picks select are spelled out more than once.
    - `already-styling` comes after the limits (ticket 30).
  - **For the team to approve:**
    - a failed "Show 2 more Outfits", including one whose Workflow couldn't start, ends "more" for that photo until a re-styling;
    - copy the spec doesn't fix: the compact checklist's heading "Styling more Outfits", the Face Photo's run-out line, and "We couldn't start more Outfits just now. Try again in a moment." when the request itself fails.
- **Live calls used:** a handful of read-only calls on 2026-10-17 in the browser check: 1 person call (both users shared a profile, so the second came from the cache), and Brand calls for 5 Style Icons.
