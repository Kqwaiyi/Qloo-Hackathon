# 04: On a Face Photo, the Stylist may pass over Style Icons for hair length

**What to build:** On a Face Photo the Hairstyle is the whole Outfit. So the Stylist may pass over a Style Icon whose signature cut needs much more length than the user's hair has, telling them why in plain styling terms about the cut's length. It does this at most twice in a Styling. After that, and on every other Photo Type, it adapts the cut to what the user's hair can do, as today. Hair texture is never a reason, and never written about, since a note about it can read as a remark about ethnicity. This works whichever model runs the Stylist. Respect [ADR-0010](../../../docs/adr/0010-the-stylist-chooses-among-qloos-picks.md) and [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › The Stylist's loop", and "Testing Decisions" (the operations seam). Stories 27–34 and 48.

- [ ] passOverStyleIcon takes a kind of reason: style or hair length.
- [ ] Hair length is accepted only on a Face Photo, and at most twice in a Styling.
  - A third is refused, with a reason that says to adapt the cut instead.
  - A hair-length pass-over on any other Photo Type is refused the same way.
  - Each Styling counts its own, so "Show 2 more Outfits" and Try again each allow two more.
- [ ] A style reason works as today. Either kind of reason is shown to the user as a note, as today.
- [ ] The prompt gains the Face Photo rule: pass over a Style Icon whose signature cut needs much more length than the person's hair has, giving a reason about the cut's length. Never pass over a Style Icon for the hair's texture, and never write about it: adapt the cut instead. The rest of the Hairstyle rules are unchanged.
- [ ] Operations tests check that:
  - on a Face Photo, two hair-length pass-overs are accepted and a third is refused;
  - a hair-length pass-over on a body photo is refused;
  - a style pass-over works as today.
- [ ] The prompt's tests check the new rule, as they check its other rules today.
