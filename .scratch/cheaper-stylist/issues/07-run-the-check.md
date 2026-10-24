# 07: Run the check and compare it with 05-59-33

**What to build:** The team runs the Stylist check once on the finished work and reads it against run 05-59-33, the last run on Sonnet 5.5. The aim is to see whether the new Stylist is cheaper while keeping the quality floor: it still catches every hard-rule break, and Haiku's choices hold up. The check costs money, so it runs only with the team's go-ahead.

**Blocked by:** 03 (A Preview that can't be judged falls back safely), 05 (Haiku 5.5 at high effort drives the Stylist), 06 (The Stylist check measures the new Stylist)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Fakes and the check" and "Further Notes". Stories 44 and 56–59.

- [ ] With the team's go-ahead, run the check once on saved Previews, as run 05-59-33 was: the cheaper image model, with Previews served from the earlier run's. Paste its report into this ticket's Comments.
- [ ] Compare it with run 05-59-33:
  - Claude's cost per Styling and in all, split between the Stylist's turns and the verdicts;
  - turns and notes;
  - the Preview verdicts on the deliberately bad Previews, above all the face added to the Body-Only Photo;
  - the Face Photo pass-overs for hair length.
- [ ] Note any choice Haiku got wrong that Sonnet got right: an invalid Outfit, or a Style Icon it should have passed over. If Haiku falls short, the fallback is [ADR-0012](../../../docs/adr/0012-haiku-drives-the-stylist-sonnet-judges-previews.md)'s option of Sonnet driving, with Haiku shortlisting Products.
