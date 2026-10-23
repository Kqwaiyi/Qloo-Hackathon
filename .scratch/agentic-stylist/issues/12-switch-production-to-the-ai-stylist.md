# 12: Switch production to the AI Stylist

**What to build:** Production runs the AI Stylist. The team checks that Haiku is good enough, caps Anthropic's spend, sets the keys, merges the branch and tries every Photo Type live, the Demo Account included.

**Blocked by:** 01–11 (every other ticket)

**Status:** ready-for-human

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Models and providers" and "Fakes and the check". Stories 61, 64 and 65.

- [ ] Run the Haiku check (ticket 11) with the team's go-ahead, and paste its report into this ticket's Comments. If Haiku falls short, move the Stylist to Sonnet 5.5 in the AI config, a one-line change, and run the check again.
- [ ] Set a $50 monthly spend limit on the Anthropic workspace, as on the Gemini project.
- [ ] Add the Anthropic key on Vercel for Production and Preview, as `ANTHROPIC_API_KEY`.
- [ ] Change Production's `AI_PROVIDER` from `gemini` to `real`: ticket 01 renamed the setting, and `gemini` is now refused, so every request fails until it's changed.
- [ ] Merge `agentic-stylist` into `main`, with real AI switched on in production and both keys set.
- [ ] On production, run one real Styling for each Photo Type, and one on the Demo Account. Check that:
  - the consent sheet comes back for an existing user;
  - the Stylist's Notes fill while each Styling runs and stay under its Outfits;
  - the Privacy Policy reads as the spec says.
