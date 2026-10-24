# 02: Previews are drawn and judged after the Stylist finishes

**What to build:** The Stylist stops drawing and checking Previews itself. Once it calls finish, or reaches its turn cap, the Styling's Workflow takes over. For each saved Outfit it:
1. draws the Preview;
2. asks for Sonnet's verdict (01);
3. on a fault, redraws once with Sonnet's correction;
4. asks for the redraw's verdict;
5. keeps an image by the hard rules.

Our code, not either model, decides which image is kept. Users see the same checklist and the same Preview steps in the Stylist's Notes, plus a short note from the verdict when a Preview was redrawn or left out. The Stylist's conversation now holds no image but the photo. The Stylist still runs on Claude Sonnet 5.5 in this ticket. Respect [ADR-0012](../../../docs/adr/0012-haiku-drives-the-stylist-sonnet-judges-previews.md), [ADR-0008](../../../docs/adr/0008-pieces-are-real-products.md) and [ADR-0010](../../../docs/adr/0010-the-stylist-chooses-among-qloos-picks.md).

**Blocked by:** 01 (Sonnet judges a Preview, through our AI interface)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Stylist's loop", "The Preview phase" and "Fakes and the check", and "Testing Decisions" (the operations seam). Stories 1–9, 12–15, 17–22, 24, 46, 47, 49, 50 and 54.

- [ ] The Preview phase runs in the Styling's Workflow after the Stylist's loop ends, with finish or at the turn cap. It covers each Outfit saved, with at most 2 Outfits at once, as today. It doesn't run after a loop that broke the Styling.
- [ ] The stored stage moves to "Generating Previews" as the phase starts. Its count is still the Previews kept, refused or failed out of the Outfits saved, so a redraw doesn't move it.
- [ ] Each draw, redraw and verdict is a durable step with today's retries. Each verdict's step loads its own images: the photo and the Previews from Blob, and the seller photos from their links. So the run data holds only IDs and links.
- [ ] A Preview is drawn as today. A refusal, or a draw that still fails after its retries, leaves the Outfit with no Preview, as today.
- [ ] A first draw judged right is kept. One judged wrong is redrawn once, with Sonnet's correction added to the fixed Preview instruction, never in its place.
- [ ] Once a redraw is drawn, the redraw's verdict is asked, and code keeps:
  - neither image, if both break a hard rule;
  - the one that doesn't, if only one does;
  - otherwise, the one Sonnet says shows the Outfit better.
- [ ] A redraw the image model declined, or couldn't draw, keeps the first image. If the first breaks a hard rule, it keeps none.
- [ ] The Stylist's Notes get today's Preview steps: drawn or declined, redrawn, kept.
  - A verdict's note line is added when it leads to a redraw or leaves an Outfit with no Preview. It's checked like any written note, and one that fails the check is dropped silently.
  - The step for a redraw left unkept when its Styling ended goes.
- [ ] The Stylist's tools are findStyleIcons, fetchBrands, searchProducts, passOverStyleIcon, saveOutfit, writeNote and finish. startPreviews, renderPreview, redrawPreview and keepPreview go. finish is never refused, and a Styling that saved no Outfit fails as today.
- [ ] The prompt loses its Preview steps and its "Checking each Preview" section. Its steps end at saving every Outfit the Stylist will make, then calling finish.
- [ ] The Stylist's conversation holds no image but the photo, and its model step no longer fetches seller photos.
- [ ] The fake Stylist plays today's pipeline without the Preview tools: it saves its Outfits and calls finish. The scenarios "preview-redrawn" and "preview-unfixable" move to the fake verdict, keeping their names, so the existing environment variable picks them as today:
  - "redrawn": the first image is wrong but breaks no hard rule, and the redraw is better;
  - "unfixable": both images break a hard rule.
- [ ] Operations tests check that:
  - a first draw judged right is kept, with no redraw and no verdict note;
  - one judged wrong is redrawn once with the verdict's correction, and the image the redraw's verdict picks is kept;
  - both images breaking a hard rule leave no Preview;
  - when only the first breaks one, the redraw is kept, even if the verdict calls the first better;
  - a declined or failed redraw keeps the first, or none when the first breaks a hard rule;
  - the phase runs after finish and at the turn cap, and never after a turn that broke the Styling;
  - the stage, count and steps are stored as today;
  - a verdict's note is stored, and dropped when it states a price;
  - the Stylist is offered no Preview tool, and its requests hold no image but the photo;
  - finish called in the same turn as saveOutfit goes through.
- [ ] Today's tests of the single redraw and of keeping none move to the Preview phase. The tests of rendering before every Outfit is saved, and of finish refused while a redraw waits, go with their tools.
- [ ] The end-to-end tests pass on the fake AI, with their scenarios picked through the existing environment variable.

## Comments

- 2026-10-24: Previews are drawn and judged by our code once the Stylist's loop ends.
  - **The Preview phase** (`src/server/stylings/preview-phase.ts`). `runStylist` runs it only when the loop ended with finish or at the turn cap, then finishes the Styling. `startPreviews` moves the stage to "previews" and gives the saved Outfits' IDs. Each Outfit, at most `PREVIEWS_AT_ONCE` at once, goes through these durable steps:
    1. `renderPreview` draws the Preview.
    2. `judgeFirstDraw` asks for its verdict.
    3. `redrawPreview` opens the one redraw, adding the verdict's note, then redraws with its correction.
    4. `judgeRedraw` asks for the redraw's verdict.
    5. `keepPreview` keeps an image.

    `kept()` decides which: none if both images break a hard rule, the one that doesn't if only one does, and otherwise the image the verdict calls better. A declined or failed redraw keeps the first, or none when the first breaks a hard rule. Each step returns only a state or a verdict, and each verdict step reads the photo and the Previews from Blob and fetches the seller photos itself. Verdict steps get `PREVIEW_STEP_MAX_RETRIES`, and seller photos follow the draw's last-try rule.
  - **The Stylist** (`stylist.ts`). Its tools are findStyleIcons, fetchBrands, searchProducts, passOverStyleIcon, saveOutfit, writeNote and finish. finish is never refused.
    - The prompt's steps end at finish, and its "Checking each Preview" section is gone.
    - The conversation holds no image but the photo. `stylistModelOn`, which fetched seller photos for the model step, is deleted. `PHOTO_LINKS` and the link plumbing in the fakes go with it.
  - **The Stylist's Notes.** A verdict's note is added, checked by `checkedNote`, as the redraw opens, or before "Left Outfit N without a Preview" when both images break a hard rule. `STEPS.previewLeftUnkept` is gone.
  - **The fakes.** The fake Stylist saves its Outfits, then calls finish, its note now "That's every Outfit for this Styling, so next come the Previews." The fake verdict plays "preview-redrawn" and "preview-unfixable".
- 2026-10-24: Choices the ticket left open:
  - **A verdict's note has no Stylist turn.** The `stylist_note` check required a turn on every note. Migration `0024_preview_verdict_notes` relaxes it: steps never have a turn, and a note may have none.
  - **The scenarios play on every Outfit's Preview,** not only the first Outfit's as the fake Stylist's did. A verdict isn't told which Outfit it's judging. So "preview-unfixable" leaves every Outfit without a Preview.
  - **The finish still fails a redraw left unkept,** deleting both images, but adds no step. That covers a Styling finished as stuck mid-phase. Until 03, it also covers a redraw's verdict that fails.
  - **Verdict text is in the run data:** the first verdict passes between steps, and each verdict comes back from its step. No image or seller photo does.
  - **The Stylist check** (`stylist-check.ts`) took the correction from the Stylist's redrawPreview calls. It now takes it from the redraws its AI is asked for, matched to an Outfit by their Pieces, as its drawer is. So an Outfit whose Pieces are like another's gets none. Ticket 06 may replace this.
- 2026-10-24: **Results.** Typecheck is clean and all 1,071 tests pass.
  - Operations tests in `stylist.test.ts` ("the Preview phase" and "the fake verdict's scenarios") cover:
    - every case on the ticket's list;
    - what each verdict call was sent;
    - a redraw left unkept when the Styling is finished as stuck.
  - The tests of the Preview tools are removed. Notes, counts and fetch counts elsewhere follow the new order: the verdict fetches each seller photo once more.
  - **Left for 03:** a verdict that fails or is refused is logged, and the other Outfits carry on. A first draw whose verdict failed stays as drawn, unchecked, and so does one whose Styling is finished as stuck before its verdict. 03 needs a fallback and probably a marker for "not yet judged".
