# 03: A Preview that can't be judged falls back safely

**What to build:** Sonnet may fail to give a verdict on every retry, or refuse to look at a Preview. Then the Outfit keeps the best image already known to be safe, and the Styling still completes with its Outfits. A user never sees a Preview that wasn't checked, and one Preview that couldn't be judged never costs them the whole Styling. Respect [ADR-0012](../../../docs/adr/0012-haiku-drives-the-stylist-sonnet-judges-previews.md).

**Blocked by:** 02 (Previews are drawn and judged after the Stylist finishes)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › The Preview phase", and "Testing Decisions" (the operations seam). Stories 10, 11 and 16.

- [ ] A first draw's verdict that still fails after its retries, or that Claude refuses, leaves the Outfit with no Preview. It shows as a Preview that couldn't be made, as when the image model kept failing. The Stylist's Notes gain a step saying the Preview couldn't be checked, such as "Couldn't check Outfit 2's Preview".
- [ ] A redraw's verdict that fails or is refused keeps the first image when its verdict found only a fault, and none when it found a hard-rule break. A Notes step says which was kept, as today's keep steps do.
- [ ] The Preview phase never breaks a Styling. The other Outfits' Previews carry on, and the Styling completes with every Outfit it saved.
- [ ] Operations tests check each case:
  - a failing first verdict;
  - a refused first verdict;
  - a failing redraw verdict after a fault;
  - a failing redraw verdict after a hard-rule break;
  - the Styling completing in each.
