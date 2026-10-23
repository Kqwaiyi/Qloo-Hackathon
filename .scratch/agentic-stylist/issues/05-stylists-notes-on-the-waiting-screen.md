# 05: Stylist's Notes on the waiting screen

**What to build:** While a Styling runs, the user can open "See what your AI Stylist is doing" under the unchanged checklist, and watch the Stylist's Notes arrive. These are the short notes the Stylist writes to them, and a step for each search it makes and Preview it draws. Each appears about a second after it happens, through the waiting page's existing once-a-second poll. The same control sits on the in-place "Show 2 more Outfits" progress. Respect [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md): the notes never describe the user's body, skin, ethnicity or age.

**Blocked by:** 02 (Face Photo Stylings run through the Stylist)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Storage", "The loop" (notes reach our database) and "What users see", and "Testing Decisions". Stories 2–11, 13, 14 and 69.

- [ ] A new table holds each Styling's Stylist's Notes, in order. Each entry is either a note the Stylist wrote, or a step our code wrote for a tool call and its result.
- [ ] Our code writes each step from the data: Qloo's names, the Brand, the Category and counts. It describes the product search without naming its provider, so names never come from the model.
- [ ] A step after each model call saves that turn's text as notes, from the agent's step-end callback. Tool steps write their own entries.
- [ ] Each note is checked like a "why" line: not empty, no price, and a short length cap. A note that fails is dropped silently.
- [ ] Notes are deleted with their Consultation and with the account.
- [ ] The Styling status the waiting page polls also returns the notes after the index the page sends, so each poll carries only new entries.
- [ ] The waiting screen keeps its checklist unchanged. Under it is a "See what your AI Stylist is doing" control:
  - collapsed by default;
  - when open, it shows the notes in order, filling as polls bring new ones;
  - the list isn't announced to screen readers as it grows, since the checklist already announces progress;
  - leaving and coming back shows the notes so far.
- [ ] The in-place "Show 2 more Outfits" progress gets the same control.
- [ ] "Taking longer than usual" waits 3 minutes on "Building Outfits". Every other item keeps 60 seconds.
- [ ] The fake model writes deterministic notes.
- [ ] Operations tests check that:
  - notes are stored in order;
  - tool steps are written from the data;
  - a note with a price is dropped;
  - the status returns only notes after the index asked for.
- [ ] A Playwright test on the fake AI checks that the control opens and fills with notes. Prior art: the new-Consultation end-to-end tests.
