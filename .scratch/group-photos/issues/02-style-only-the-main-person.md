# 02: Style only the Main Person in tailoring and Previews

**What to build:** When a photo shows other people besides its Main Person, tailoring fits each Outfit's Pieces to the Main Person alone, and each Preview dresses only the Main Person, keeping everyone else exactly as they are. The Main Person is named only in the prompts, as "the most prominent person in the photo". Nothing else picks them out: no bounding box, no description, no crop. One-person photos behave exactly as before. See [the spec](../spec.md) and [ADR-0009](../../../docs/adr/0009-only-the-main-person-is-styled.md).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] The tailoring prompt makes the Outfit concrete for the most prominent person in the photo, and matches colours to what they're wearing, not anyone else.
- [x] The Preview instruction edits only the most prominent person in the photo, for every Photo Type: a Face Photo's hair, and a Full-Body or Body-Only Photo's Outfit.
- [x] The Preview instruction's keep list includes "every other person in the photo, exactly as they are", for every Photo Type.
- [x] The existing rules still hold: no age, ethnicity, skin tone, body measurements or health (ADR-0005), and the Body-Only Photo's rule against adding a face.
- [x] Gemini adapter tests, against the fake fetch, check that the tailoring request and the Preview instruction name the most prominent person, and that the Preview keeps every other person. Prior art: the Gemini tests that read a request's text, such as the one about taking only the garment from each Product photo.
- [x] Nothing new is passed to tailoring or the Preview, and nothing new is stored.

## Comments

- 2026-10-22: Tailoring and the Preview instruction name the Main Person only as "the most prominent person in the photo"; the Preview keeps "every other person in the photo, exactly as they are" for every Photo Type, and its keep list names the most prominent person's face and identity. No inputs or stored data change. Typecheck is clean and all 912 tests pass (Gemini adapter tests: 53). Not checked against real Gemini: whether the Preview model reliably picks the same person as the photo check needs a live run on a group photo.
