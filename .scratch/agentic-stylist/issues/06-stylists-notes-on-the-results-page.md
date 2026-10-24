# 06: Stylist's Notes on the results page

**What to build:** Once Outfits appear, the user can open a collapsed "Your AI Stylist's notes" section below them, with one entry for each Styling behind the Outfits on screen. A failed Styling's notes sit under its failure line, so the user can see what went wrong. Notes last as long as the Outfits they explain: a re-styling that replaces those Outfits deletes their notes. The Privacy Policy and the Terms say so.

**Blocked by:** 05 (Stylist's Notes on the waiting screen)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Storage" (which notes are kept), "What users see" and "Consent, legal and landing copy", and "Testing Decisions". Stories 8 and 39–44, and 51.

- [x] The results page has a collapsed "Your AI Stylist's notes" section below the Outfits, above "Show 2 more Outfits":
  - one entry per Styling behind the current Outfits, oldest first;
  - each labelled by its kind: "First Styling", "Show 2 more Outfits", "Budget Tier changed to Medium", "Photo Style changed to edgy".
- [x] A failed Styling's notes sit collapsed under its failure line.
- [x] The first mention on each screen says "AI Stylist".
- [x] Which notes are kept:
  - a Styling's notes stay while any of its Outfits is current, or while it is the failed Styling whose line the Consultation shows;
  - a Styling that switches in and replaces the current Outfits deletes the notes of the Stylings it replaced;
  - everything goes with the Consultation and the account.
- [x] A Consultation made before this change shows no notes section.
- [x] The Privacy Policy lists the Stylist's Notes among what's stored about a Consultation, and says when they're deleted.
- [x] The Terms' list of what Outfits and Previews are gains a line: the AI Stylist's notes are written by AI and may not always be right.
- [x] Operations tests check that:
  - notes stay while their Outfits are current;
  - a Budget Tier or Photo Style change that switches in deletes the replaced Stylings' notes;
  - "Show 2 more Outfits" keeps both Stylings' notes;
  - a failed Styling's notes stay under its line;
  - deleting the Consultation or the account deletes them.
- [x] Playwright tests on the fake AI check that the results page shows the section with one entry per Styling, and that a failed Styling shows its notes under its line. Prior art: the app-pages and new-Consultation end-to-end tests.

## Comments

- 2026-10-24: The Stylist's Notes stay on the results page as long as the Outfits they explain.
  - **Which notes are kept.** `finishStyling` (`src/server/stylings/steps.ts`) calls `deleteStylistNotesNoLongerShown` (`src/server/stylings/stylist-notes.ts`) in the transaction that finishes a Styling, once its Outfits, if any, have switched in. It deletes the notes of each finished Styling of the Consultation except those with a current Outfit and the latest Styling if it failed (`readLatestFailedStyling`). So a re-styling or Try again whose Outfits switch in deletes the replaced Stylings' notes, and any Styling that finishes after a failed one deletes that one's, since its line is gone. A failed "Show 2 more Outfits" has no line of its own (the run-out line takes its place), so its notes go as it finishes. Deleting the Consultation, withdrawing photo consent or deleting the account cascades, as in ticket 05.
  - **The view.** `readConsultation` returns `stylistNotes`: an entry per Styling behind the current Outfits, in the order their Outfits are shown, which is oldest first, each `{ styling: { kind, budgetTier | photoStyle }, notes }`. A Styling with no notes, made before ticket 05, has no entry, so an older Consultation has none and the page shows no section. `failedStyling` gains `notes`. A Try again's entry is labelled as the kind it tried again, as its failure line already was (`readShownStylingKind` in `src/server/stylings/failed.ts`, which `readLatestFailedStyling` now shares, now reading the latest non-Try-again Styling started by the Try again's own start).
  - **UI** (`src/app/(app)/consultations/stylist-notes.tsx`): `StylistNotesByStyling`, a closed `<details>` "Your AI Stylist's notes" between the Outfits and "Show 2 more Outfits", each entry's list named by its label from `COPY`; and `FailedStylingNotes`, the same control at the foot of the failure box, after Try again. The waiting screen's `StylistNotes` shares their disclosure and list. Both controls say "AI Stylist", so whichever comes first on the page does.
  - **Legal copy.** The Privacy Policy lists the notes under "What we collect", gives their retention under "How long we keep it", and names them in the photo schedule's database row. The Terms' "Your Outfits" list gains the line that the AI Stylist's notes are written by AI and may not always be right.
  - **The fake AI's cookie now reaches Stylings.** The failed-Styling end-to-end test needs a Styling that fails on the dev server, and Stylings run in the Workflow on the app's own fake, which the browser's `fake_ai_scenario` cookie never reached (`.env.example` said so). In local development the fakes now share, on `globalThis`, the scenario each photo was checked under, by the photo's fingerprint, and a Styling's Stylist and Previews play its photo's (`photoScenarios` in `src/server/ai/fake.ts`). Tests' fake has none, so nothing changes there. `.env.example` says so.
- 2026-10-24: **Results.** Typecheck is clean, and all 980 unit tests pass. New tests in `src/server/operations/stylist.test.ts` ("the Stylist's Notes once Outfits appear"): notes kept below their Outfits, both entries after "Show 2 more Outfits", deleted by a Photo Style or Budget Tier change that switches in, kept under a failed Styling's line, gone from under it once a later Styling takes its place (with a Try again's entry labelled as the Photo Style change it tried again), a failed "Show 2 more Outfits" leaving nothing, and none on a Consultation made before them. Ticket 05's test still covers deletion with the Consultation and the account. `src/server/ai/environment.test.ts` checks that a browser's scenario plays in its photo's Previews. Two end-to-end tests in `e2e/new-consultation.spec.ts`, on the fake AI and live Qloo: the section's entries through a first Styling, "Show 2 more Outfits" and a Photo Style change, and a `tailoring-fails` Styling's notes under its line. All 12 end-to-end tests pass. Checked by eye in screenshots, desktop and phone.
  - **Open question for the team:** a failed "Show 2 more Outfits" keeps no notes, since it has no failure line of its own (the run-out line takes its place), so story 42's "so that I can see what went wrong" doesn't reach it. That follows the spec's rule ("while it is the failed Styling whose line the Consultation shows"), and the Privacy Policy says so. Keeping them under the run-out line would need that rule changed.
  - **Not done:** notes for an older Styling (no notes) beside newer ones on the same Consultation: it simply has no entry.
