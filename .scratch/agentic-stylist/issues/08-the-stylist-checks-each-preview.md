# 08: The Stylist checks each Preview

**What to build:** After drawing each Preview, the Stylist looks at it beside the photo and the Products' seller photos. It catches a wrong garment, a changed face, or a face invented on a Body-Only Photo, and redraws once with a correction. It then keeps whichever image is better. When both break a hard rule, it shows the Outfit with no Preview, as a refusal does today. The user sees each redraw as a step in the Stylist's Notes, and the Privacy Policy says Anthropic now gets Previews and seller photos' links. Respect [ADR-0010](../../../docs/adr/0010-the-stylist-chooses-among-qloos-picks.md), [ADR-0008](../../../docs/adr/0008-pieces-are-real-products.md), [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md) and [ADR-0009](../../../docs/adr/0009-only-the-main-person-is-styled.md).

**Blocked by:** 04 (Body-photo Stylings run through the Stylist; the fixed pipeline goes), 05 (Stylist's Notes on the waiting screen)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Stylist and its tools", "The loop" and "Consent, legal and landing copy", and "Testing Decisions" (the operations seam). Stories 12, 28–33, 50, 63 and 69.

- [ ] After each render, the Preview goes into the conversation as its image, read from Blob by the step that rendered it. The Outfit's seller photos go in only as their public links, which the model step fetches, so the run data never holds them.
- [ ] A new tool redraws a Preview. The Stylist writes one correction sentence, which is added to the fixed Preview instruction rather than replacing it. It's allowed once per Outfit, and a second is refused.
- [ ] A new tool keeps a Preview: the first image, the redraw, or none. The Stylist keeps none only when both images break a hard rule: a changed or invented face, a removed head covering, or another person changed. Keeping none leaves the Outfit with no Preview, as a refusal does.
- [ ] "Generating Previews (1 of 2)" counts Previews kept, refused or failed, so a redraw doesn't move it.
- [ ] If the real model is in place, the Stylist's prompt says what to check and lists the hard rules. It never comments on the person's body, skin or face beyond whether the Preview changed them.
- [ ] A redraw appears in the Stylist's Notes as a step that our code writes, such as "Redrew Outfit 2's Preview".
- [ ] The Privacy Policy says Anthropic gets Previews, and each seller photo's link when a Preview is checked. Its Product-photo paragraph adds Anthropic.
- [ ] New fake scenarios, picked through the existing environment variable: a redrawn Preview, and a Preview the Stylist can't fix.
- [ ] Operations tests check that:
  - the fake model receives each checked Preview as an image and seller photos only as links;
  - a redraw is allowed once per Outfit and a second is refused;
  - keeping none leaves the Outfit with no Preview;
  - the Preview count doesn't move on a redraw.
