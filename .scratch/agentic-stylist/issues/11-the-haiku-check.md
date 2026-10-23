# 11: The Haiku check

**What to build:** A team script that tells the team, before production switches, whether Claude Haiku 5.5 is good enough for the Stylist. It runs the real Stylist on fixed, AI-generated photos and reports:
- whether it built valid Outfits;
- the turns it used and the time it took;
- what it cost;
- the largest prompt it sent;
- whether its Preview check caught deliberately bad Previews.

It costs money, so it runs only with the team's go-ahead and never in CI. Running it, and acting on what it finds, is ticket 12.

**Blocked by:** 03 (The Stylist runs on Claude), 07 (The Stylist chooses among Qloo's picks), 08 (The Stylist checks each Preview)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Fakes and the check", and "Further Notes". Stories 65–67.

- [ ] A team script, like the existing check scripts, run by hand and never in CI. It needs both the Anthropic and Gemini keys, and says before it starts roughly what a run will cost.
- [ ] It runs the real Stylist inline on fixed, AI-generated photos: the landing sample's, and others like it, one for each Photo Type. For each run it reports:
  - whether the Outfits are valid;
  - the turns used;
  - the time taken;
  - the cost, from the token usage;
  - the largest prompt sent.
- [ ] The bake-off's images were never committed, so the script makes its own bad Previews: Nano Banana 2 Lite on a Body-Only Photo with no face, which invented one in the bake-off, plus Previews with known faults. It also makes good Previews from Nano Banana 2.1, which the Stylist shouldn't redraw.
- [ ] The script shows the Stylist each Preview and reports whether it redrew or kept it, and whether it rightly kept none.
- [ ] It prints a report the team can paste into ticket 12, and saves no photo or Preview to the repository.
