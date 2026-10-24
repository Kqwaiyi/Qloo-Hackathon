# 08: The Stylist checks each Preview

**What to build:** After drawing each Preview, the Stylist looks at it beside the photo and the Products' seller photos. It catches a wrong garment, a changed face, or a face invented on a Body-Only Photo, and redraws once with a correction. It then keeps whichever image is better. When both break a hard rule, it shows the Outfit with no Preview, as a refusal does today. The user sees each redraw as a step in the Stylist's Notes, and the Privacy Policy says Anthropic now gets Previews and seller photos' links. Respect [ADR-0010](../../../docs/adr/0010-the-stylist-chooses-among-qloos-picks.md), [ADR-0008](../../../docs/adr/0008-pieces-are-real-products.md), [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md) and [ADR-0009](../../../docs/adr/0009-only-the-main-person-is-styled.md).

**Blocked by:** 04 (Body-photo Stylings run through the Stylist; the fixed pipeline goes), 05 (Stylist's Notes on the waiting screen)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Stylist and its tools", "The loop" and "Consent, legal and landing copy", and "Testing Decisions" (the operations seam). Stories 12, 28–33, 50, 63 and 69.

- [x] After each render, the Preview goes into the conversation as its image, read from Blob by the step that rendered it. The Outfit's seller photos go in only as their public links, which the model step fetches, so the run data never holds them.
- [x] A new tool redraws a Preview. The Stylist writes one correction sentence, which is added to the fixed Preview instruction rather than replacing it. It's allowed once per Outfit, and a second is refused.
- [x] A new tool keeps a Preview: the first image, the redraw, or none. The Stylist keeps none only when both images break a hard rule: a changed or invented face, a removed head covering, or another person changed. Keeping none leaves the Outfit with no Preview, as a refusal does.
- [x] "Generating Previews (1 of 2)" counts Previews kept, refused or failed, so a redraw doesn't move it.
- [x] If the real model is in place, the Stylist's prompt says what to check and lists the hard rules. It never comments on the person's body, skin or face beyond whether the Preview changed them.
- [x] A redraw appears in the Stylist's Notes as a step that our code writes, such as "Redrew Outfit 2's Preview".
- [x] The Privacy Policy says Anthropic gets Previews, and each seller photo's link when a Preview is checked. Its Product-photo paragraph adds Anthropic.
- [x] New fake scenarios, picked through the existing environment variable: a redrawn Preview, and a Preview the Stylist can't fix.
- [x] Operations tests check that:
  - the fake model receives each checked Preview as an image and seller photos only as links;
  - a redraw is allowed once per Outfit and a second is refused;
  - keeping none leaves the Outfit with no Preview;
  - the Preview count doesn't move on a redraw.

## Comments

- 2026-10-24: The Stylist checks each Preview, redraws one that's wrong once, and keeps the better image, or neither.
  - **The check.** `renderPreview`'s step reads the Preview back from Blob and gives it, with a link to each Product's seller photo (`SellerPhotoLink`), to the tool. The tool's `toModelOutput` puts them into the conversation: the JSON result, then the Preview inline, then each seller photo by its link. `PHOTO_LINKS` in `stylist.ts` marks image links as read by link, so the agent leaves them in place. `stylistModelOn` (`src/server/stylings/stylist-model.ts`) is the model that both the Workflow's model steps and the inline runner hand the agent. When the app's model can't read a link, it fetches the photo through `ProductPhotos` inside the model step and sends it inline. A photo that can't be fetched becomes a line saying so, and the turn goes on. Claude's adapter now reads no links (`overrideSupportedUrls: () => ({})`). The fake reads them, unless `stylistReadsLinks` is false.
  - **The tools.** `redrawPreview` takes the Outfit and one correction sentence, checked like a note but up to `PREVIEW_CORRECTION_MAX_LENGTH`. Gemini adds it after the whole fixed instruction (`PreviewInput.correction`). The first redraw marks `outfit.preview_redraw`; the tool refuses a second for the rest of the run, and the step opens a pending one again, so a retry is safe. `keepPreview` takes `first`, `redraw` or `none`. `none` and `redraw` are refused before a redraw, and `redraw` is refused when the image model didn't draw one. Keeping the redraw makes it the Preview (`…/previews/<outfit>-redraw.webp`). Keeping none makes the Preview refused, with the new reason `not_kept`. Either way the image not kept is deleted. `finish` is refused while a redraw waits to be kept, and the agent now stops only on a finish that goes through. Redraws share the 2-at-once Preview limit.
  - **The count** is unchanged: Previews not pending. A redraw leaves the first `ready` until it's kept, so "Generating Previews (1 of 2)" never moves for one.
  - **Notes steps:** "Redrew Outfit 2's Preview" (or "declined to redraw", or "Couldn't redraw"), then "Kept Outfit 2's redrawn Preview", "Kept … first Preview" or "Left Outfit 2 without a Preview".
  - **The prompt** gains "Checking each Preview": what to check, beside the photo and the seller photos; the three hard rules; one redraw, then keep the better image, or none only when both break a hard rule. It never comments on the person's body, skin or face beyond whether the Preview changed them, and never says what covers their hair (ADR-0005).
  - **The fake.** `FAKE_AI_SCENARIO=preview-redrawn` redraws the first Outfit's Preview and keeps the redraw, whose banner says "Fake Preview, redrawn". `preview-unfixable` redraws it and keeps neither. Tests can set either per Style Icon in `styleIconScenarios`.
  - **Legal copy.** The Privacy Policy's Anthropic bullet adds the Preview, any redraw, and each seller photo, fetched by its link. The Product-photo paragraph adds Anthropic, and the run-data line says it holds seller photos only as links. A short paragraph explains the check, the Gemini bullet adds the redraw's correction, and Anthropic's schedule row adds Previews.
- 2026-10-24: Choices the ticket left open:
  - **Anthropic gets the seller photos themselves, not their links.** The model step fetches each one and sends it inline, as the spec's loop says. The Policy says Anthropic gets the photo, "fetched by the photo's link". Letting Claude fetch the links itself would match "gets each seller photo's link" word for word. It would also mean a seller that blocks Claude breaks the turn with a 400. The photos are fetched again on every later turn of the Styling, since the run data can't keep them, and the Policy says so.
  - **A redraw nobody kept** (the turn cap, or a turn that breaks after the redraw) leaves its Outfit with no Preview (`failed`). Both images go, and a Notes step says why. That's the safe side of story 31, since nobody chose an image.
  - **Keeping none after a declined or failed redraw** is allowed, though there is only one image. The hard rules still keep it from the user, and the prompt says to keep the first unless it breaks one.
  - **No Preview kept** shows its own line, "your AI Stylist couldn't get one that showed you as you are". It isn't the image model's "declined" line, which would blame the wrong thing, and it doesn't count towards "every Preview refused". `PreviewView`'s refused state now says `by: "image-model" | "stylist"`.
- 2026-10-24: **Results.** Typecheck is clean, all 1,015 tests pass, and all 12 end-to-end tests pass. A one-off end-to-end run of `preview-unfixable` also went through the real Workflow, and wasn't committed: Outfit 1 showed the AI Stylist's no-Preview line, Outfit 2 its Preview, and the Notes showed the redraw and the keep.
  - **New operations tests** are in `stylist.test.ts` under "checking each Preview":
    - the fake model receives each checked Preview as an image and seller photos only as links;
    - a model that can't read links is sent the photos themselves, and goes on without one that can't be fetched;
    - a redraw is allowed once, and a second is refused;
    - keeping the redraw makes it the Preview and deletes the first;
    - keeping none leaves no Preview, and only after a redraw;
    - the redraw and keep refusals;
    - the count doesn't move on a redraw;
    - finish is refused while a redraw waits to be kept;
    - a Styling that ends first leaves no Preview, saying so.
  - **Other new tests:** the prompt's check, hard rules and head-covering rule; and both fake scenarios.
  - **Adapters:** Gemini adds the correction after the whole instruction, and Claude takes every image inline.
  - **Not done:** the prompt on the real Stylist, and its catching bad Previews. That costs money, and is the Haiku check's (11) to run.
