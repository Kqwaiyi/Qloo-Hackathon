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

## Comments

- 2026-10-24: A Preview that can't be judged falls back in the Preview phase, as a redraw that couldn't be drawn already did.
  - **No verdict.** `previewOf` reads each verdict step's result through `verdictOf`. It gives none when Claude refused, or when the step still failed after its retries.
  - **A first draw with no verdict** goes to a new durable step, `dropUncheckedPreview`. It marks the Preview failed, adds "Couldn't check Outfit N's Preview" and deletes the image. So the Outfit shows as a Preview that couldn't be made.
  - **A redraw with no verdict** goes to `keepPreview`, as a declined or failed redraw does. It keeps the first image, or none after a hard-rule break, and its step says which.
  - **A marker for "checked".** Migration `0025_preview_checked` adds `outfit.preview_checked`.
    - `judgeFirstDraw` sets it when the verdict judges the Preview right. A retry then finds it set and doesn't ask Claude again.
    - `keepPreview` sets it when it keeps the first image or the redraw.
    - `finishStyling` marks failed every ready Preview not checked. This replaces its rule for unkept redraws, so no unchecked Preview is ever shown. That covers a Styling finished as stuck before a verdict, and a fallback step that itself fails.
    - The finish step deletes the images of every failed Preview.
- 2026-10-24: Choices the ticket left open:
  - **A redraw with no verdict gets only the keep step,** as the ticket says. There's no "couldn't check" step for it.
  - **A Styling finished as stuck before a first draw's verdict gets no "Couldn't check" step.** Likewise, one finished before its Preview was drawn gets no "Couldn't draw".
  - **No backfill.** Previews of Stylings that finished before the column was added read as unchecked. Only a running Styling's are ever read.
  - **For the team: the copy.** An unchecked Preview shows `COPY.previewFailed`, "No Preview for this Outfit: the image model couldn't make one", as the ticket asks. That isn't quite true here, since the image model did make one. The spec rules out changing what users see, so the copy is unchanged.
  - **For /domain-modeling: the glossary.** GLOSSARY's **Outfit** entry doesn't list a Preview that couldn't be checked as a reason for none.
- 2026-10-24: **Results.** Typecheck is clean and all 1,079 tests pass. The end-to-end tests weren't run: they need live Qloo and Cloudflare Turnstile.
  - New operations tests in `stylist.test.ts` ("the Preview phase") cover:
    - a first draw's verdict that still fails after its retries, and one that's refused;
    - a redraw's verdict that still fails or is refused, after a fault and after a hard-rule break;
    - one Outfit whose verdict fails while the other's Preview carries on;
    - a Styling finished as stuck while its first draw is judged.
  - Each case where a verdict fails or is refused checks that the Styling completes with every Outfit it saved.
