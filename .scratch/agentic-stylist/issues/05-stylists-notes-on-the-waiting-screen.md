# 05: Stylist's Notes on the waiting screen

**What to build:** While a Styling runs, the user can open "See what your AI Stylist is doing" under the unchanged checklist, and watch the Stylist's Notes arrive. These are the short notes the Stylist writes to them, and a step for each search it makes and Preview it draws. Each appears about a second after it happens, through the waiting page's existing once-a-second poll. The same control sits on the in-place "Show 2 more Outfits" progress. Respect [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md): the notes never describe the user's body, skin, ethnicity or age.

**Blocked by:** 02 (Face Photo Stylings run through the Stylist)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Storage", "The loop" (notes reach our database) and "What users see", and "Testing Decisions". Stories 2–11, 13, 14 and 69.

- [x] A new table holds each Styling's Stylist's Notes, in order. Each entry is either a note the Stylist wrote, or a step our code wrote for a tool call and its result.
- [x] Our code writes each step from the data: Qloo's names, the Brand, the Category and counts. It describes the product search without naming its provider, so names never come from the model.
- [x] A step after each model call saves that turn's text as notes, from the agent's step-end callback. Tool steps write their own entries.
- [x] Each note is checked like a "why" line: not empty, no price, and a short length cap. A note that fails is dropped silently.
- [x] Notes are deleted with their Consultation and with the account.
- [x] The Styling status the waiting page polls also returns the notes after the index the page sends, so each poll carries only new entries.
- [x] The waiting screen keeps its checklist unchanged. Under it is a "See what your AI Stylist is doing" control:
  - collapsed by default;
  - when open, it shows the notes in order, filling as polls bring new ones;
  - the list isn't announced to screen readers as it grows, since the checklist already announces progress;
  - leaving and coming back shows the notes so far.
- [x] The in-place "Show 2 more Outfits" progress gets the same control.
- [x] "Taking longer than usual" waits 3 minutes on "Building Outfits". Every other item keeps 60 seconds.
- [x] The fake model writes deterministic notes.
- [x] Operations tests check that:
  - notes are stored in order;
  - tool steps are written from the data;
  - a note with a price is dropped;
  - the status returns only notes after the index asked for.
- [x] A Playwright test on the fake AI checks that the control opens and fills with notes. Prior art: the new-Consultation end-to-end tests.

## Comments

- 2026-10-24: The Stylist's Notes are stored and shown while a Styling runs.
  - **Storage** (migration 0022): `stylist_note`, one row per entry by `(styling_id, position)`: its kind (`note` the Stylist wrote, `step` our code wrote), its text, and for a note the turn it came from, so a retried save adds it once. Entries are numbered as they're added, inside the transaction that holds the running Styling's row, so a page that has seen one has seen every one before it. They cascade from the Styling, so they go with the Consultation and the account. Nothing deletes them when a Styling finishes: which notes are kept is ticket 06's.
  - **Steps**, in `src/server/stylings/stylist-notes.ts` (`STEPS`), each written in the same transaction as what its tool saved, so a retry writes none twice: Style Icons found ("Asked Qloo for Style Icons popular in the United States with a casual Photo Style: 3 found"), a Style Icon's Brands fetched, a Style Icon passed over (by `fetchBrands` or `saveOutfit`), each search that answered or never did ("Searched Bolt's tops: 2 in stock"), each Outfit saved, and each Preview drawn, declined, or still failing on its step's last try. Every name is Qloo's, and neither the product search nor the image model is named by its provider. `countryInSentence` in `src/config/countries.ts` gives "the United States".
  - **Notes**: each line of a turn's text is a note, dropped silently if it's empty, states a price (`statesAPrice`, as for a "why"), or runs past `STYLIST_NOTE_MAX_LENGTH` (300 characters). Only text parts are read, never thinking.
  - **When a turn's text is saved.** The ticket says "from the agent's step-end callback", but the Workflow agent calls `onStepEnd` only once the turn's tools have run (`model-call-iterator.ts`). Saved only there, a Preview turn's "I'm drawing the Preview of Outfit 1" would land after "Drew Outfit 1's Preview", tens of seconds late. So `runStylist`'s `turnNoteSaver` saves a turn's text as its first tool starts, from the turn's own message, which the agent hands each tool's `execute` as the last of the conversation, and the tools called at once share that one save. `onStepEnd` stays as the backstop, for a turn with no tool call. This relies on the agent's current behaviour (its own callbacks strip that message; `execute` gets it); the first notes test expects each note before its steps, so an SDK bump that changes it fails loudly. The spec's "The loop" line now says so.
  - **Status**: `readStylingStatus(ctx, id, { notesAfter })` returns `progress.notes`, the entries after the first `notesAfter`; the poll sends `?notesAfter=<count>`. "Taking longer than usual" waits `SLOW_BUILDING_OUTFITS_MS` (3 minutes) on Building Outfits, its Brands stage included (`BUILDING_OUTFITS_STAGES`, which the checklist shares).
  - **UI**: `StylistNotes` (`src/app/(app)/consultations/stylist-notes.tsx`), a closed `<details>` under the checklist, outside its live region, on the Styling step and in the "Show 2 more Outfits" card. The page renders with every note so far, then each poll appends the new ones. Before the first note it says "Your AI Stylist is getting started."
  - **Fake**: `fakeStylistTurn` writes a line before its calls for each kind of tool it calls. A scripted turn may give `{ calls, text }`.
  - `fetchBrands` now saves a Style Icon's Brands only while they're still unsaved (`isNull`), which changes nothing a Styling does, but writes its step once.
- 2026-10-24: **Results.** Typecheck is clean and all unit tests pass. New tests: the Stylist's Notes in `src/server/operations/stylist.test.ts` (in order through the status, steps from the data, declined and failed Previews, dropped notes, only after the index, a last turn with no tool call, deletion) and the 3-minute and 60-second waits in `stylings.test.ts`. The new end-to-end test in `e2e/new-consultation.spec.ts` opens the control on "Show 2 more Outfits", after a reload mid-Styling, and on a Budget Tier change's Styling step, through the Workflow's Local World with live Qloo. **Not done:** a Styling on real Claude, which costs money and is the team's to run.
