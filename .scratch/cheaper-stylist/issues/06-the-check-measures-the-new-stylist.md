# 06: The Stylist check measures the new Stylist

**What to build:** The Stylist check (`npm run check:stylist`) reports what the new Stylist costs and does, so the team can compare a run with run 05-59-33. It reports:
- Claude's cost across both models;
- what the Preview phase did with each Outfit's Preview;
- which Style Icons were passed over for hair length.

**Blocked by:** 02 (Previews are drawn and judged after the Stylist finishes), 04 (On a Face Photo, the Stylist may pass over Style Icons for hair length)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › Fakes and the check", and "Testing Decisions" (the check). Stories 56–59.

- [ ] Cost is reported across both models. The Stylist's turns are priced as its model, and each verdict call as the verdict's model, each with its own total and the sum. The Stylist's cache figures and largest prompt are reported as today.
- [ ] Each Outfit's Preview is reported from the Preview phase: whether it was redrawn, with what correction, and which image was kept. The deliberately bad Previews, and serving Previews from an earlier run, still work at the image model, as today.
- [ ] Style Icons passed over for hair length are reported for each Styling.
- [ ] Turns and time are reported as today.
- [ ] The estimate the check prints before it starts covers both models.
- [ ] The check's tests cover:
  - cost across both models, each priced by its own rate card;
  - the Preview report built from the Preview phase;
  - the hair-length pass-overs.
