# 13: Styling progress checklist

**What to build:** While Outfits are built, the user watches a checklist tick through Checking your photo, Finding Style Icons, Building Outfits and Generating Previews (n of N), with a note if a step is slow. They can leave and come back: reopening the Consultation mid-Styling shows the checklist again.

**Blocked by:** [12 Previews of the user wearing each Outfit](12-previews.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Stylings" (Progress) and "Pages" (Styling step), plus "Testing Decisions" (browser smoke flow 2). Stories 86–89.

- [x] The Styling step shows the checklist: Checking your photo, Finding Style Icons, Building Outfits, Generating Previews (n of N), where N is the number of Outfits the Styling will make.
- [x] The checklist follows the stored stage, polled from the Styling status route about once a second. Workflow's own progress stream isn't used.
- [x] If one step has taken over 60 s, the checklist adds "This is taking longer than usual."
- [x] The Outfits appear all at once when the Styling finishes; half-finished cards are never shown.
- [x] Opening a Consultation whose Styling is still running shows the checklist again.
- [x] The checklist can start with its earlier items already ticked, so re-stylings can reuse it (tickets 27, 28 and 29).
- [x] A Playwright smoke test goes New Consultation → Styling checklist → two Outfit cards against local development with the fake adapter. Ticket 25 adds the consent sheet to this flow.

## Comments

Implemented. Decisions made along the way that later tickets should know:

- **The status.** `readStylingStatus` (`src/server/operations/stylings.ts`), behind the poll route, returns `{ state, progress }`. `progress` is null unless a Styling runs, and otherwise `{ stage, previews: { done, of }, slow }`. One statement reads it with the state, so the two always agree.
  - `previews.done` counts the Styling's Outfits whose Preview isn't pending, so a refused one counts. `previews.of` is `outfits_wanted` until the Previews stage, then `outfits_made`, since every Outfit is built by then.
  - **For ticket 22:** N follows `outfits_wanted`, so it shows the allowance's limit once `createStyling` sets it.
  - `slow` compares the server's clock with `stage_moved_at`, against `SLOW_STEP_MS` (60 s). Both were already stored, so there's no migration.
  - **For ticket 14:** `brands` and `building_outfits` are both "Building Outfits", and moving between them restarts the 60 s. That item can run past 60 s in all without the note.
- **The checklist.** `StylingStep` (`src/app/(app)/consultations/styling-step.tsx`) is the stepper at Styling, the photo and the checklist. It takes a stage: `photo_check`, or a `StylingStage`. Every item before it is ticked, so a re-styling passes its stage and gets the photo check ticked, plus the Style Icons from `brands`.
  - **For tickets 27, 28 and 29:** the Consultation page already shows the Styling step whenever any Styling runs.
  - **For ticket 26:** that includes "Show 2 more Outfits", which should keep the results and show a compact checklist instead. `page.tsx` will need to tell that kind apart; the status doesn't carry the kind yet.
- **Checking your photo.** The photo check runs inside "Get my Outfits", before any Styling exists, so the wizard shows the Styling step itself while the server action runs. It shows Checking your photo, then Finding Style Icons once the photo passes and the Consultation page is loading.
  - A rejection returns to the photo step with the photo kept, and focus goes back to "Get my Outfits".
  - The wizard times the photo check itself for the slow note.
  - It shows no "(n of N)", since N is known only once the Styling exists. The Consultation page shows it.
- **The Consultation page.** It reads the status first, then the Consultation, so a Styling that finishes between the two shows its Outfits. While a Styling runs, it shows "Your Outfits", then `StylingProgress`, which polls once a second and refreshes the page when the Styling has finished. The results page now has the stepper at Outfits, as in the prototype.
- **Tests.** The fake AI adapter gains `duringCall`, which runs while each call "works", so server tests can read the status part-way through a Styling.
  - `e2e/new-consultation.spec.ts` is smoke flow 2 without the consent sheet, which ticket 25 adds. It starts a Consultation, so like local development it makes a live Qloo call or two.
  - The photo-check smoke test now checks the Face Photo by its image, since the results header only shows once the Styling finishes.
  - Playwright now runs one worker. With three spec files running side by side, the dev server's first-visit compiles raced and timed out, failing a different test each run.
- **Checked in the browser.** Throwaway Playwright runs against local development used the fake adapter slowed to 5 s and then 65 s per call, at desktop and phone widths.
  - Each item ticked in turn.
  - A reload mid-Styling showed the checklist again at the same item.
  - The slow note showed after 60 s on Checking your photo, Building Outfits and Generating Previews, and cleared as each stage moved on.
  - On a dev server's first visit, compiling the status route can hide a short stage.
