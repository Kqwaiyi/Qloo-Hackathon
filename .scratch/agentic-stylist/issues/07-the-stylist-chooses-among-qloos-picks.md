# 07: The Stylist chooses among Qloo's picks

**What to build:** For each Category, the Stylist may now choose whichever of a Style Icon's top 3 usable Brands best suits the photo, the Photo Style and the rest of the Outfit, rather than only the first. It may also pass over a Style Icon that doesn't suit the photo, and the user reads why in the Stylist's Notes. Qloo still decides which Style Icons and Brands are candidates, and the tools still enforce everything else. This is [ADR-0010](../../../docs/adr/0010-the-stylist-chooses-among-qloos-picks.md); [ADR-0002](../../../docs/adr/0002-photo-style-steers-style-icons.md) still holds for Qloo's queries.

**Blocked by:** 04 (Body-photo Stylings run through the Stylist; the fixed pipeline goes), 05 (Stylist's Notes on the waiting screen)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › The Stylist and its tools", and "Testing Decisions" (the operations seam). Stories 15–18 and 69.

- [ ] For each Category, the save tool accepts any of the Style Icon's top 3 usable Brands still in play. The top 3 slide: a Brand whose search found nothing drops out, and the next one moves in.
- [ ] Save refuses a 4th Brand, and any Brand Qloo didn't return. The rule that no Brand repeats within a Category is unchanged.
- [ ] A new tool passes over a Style Icon, with a reason in style terms. It marks the Style Icon skipped, as today, and adds the reason to the Stylist's Notes.
- [ ] If the real model is in place, the Stylist's prompt explains the choice:
  - weigh the photo, the Photo Style and the rest of the Outfit;
  - give reasons about style ("her shoe Brand only sells heels, which don't fit sporty"), never about the user or the Style Icon as a person.
- [ ] Qloo's queries are unchanged, and the Brand query never carries the Photo Style.
- [ ] New fake scenarios, picked through the existing environment variable: passing over the first Style Icon, and picking a second Brand. The default fake model still plays today's pipeline.
- [ ] Operations tests check that:
  - a second or third Brand saves;
  - a 4th Brand is refused;
  - a Brand Qloo didn't return is refused;
  - once the first Brand's search finds nothing, the 4th Brand moves into the top 3 and is accepted;
  - passing over a Style Icon marks it skipped and adds its reason to the notes.
