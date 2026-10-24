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
