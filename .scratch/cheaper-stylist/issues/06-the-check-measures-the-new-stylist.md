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

## Comments

- 2026-10-24: The Stylist check now measures the new Stylist.
  - **Cost across both models.**
    - `AnthropicAiOptions` gains an optional `verdictMiddleware`, which wraps the model each verdict is asked of. `realAiFromEnvironment` is now exported and passes it through.
    - `StylistCheckAi` is built with `(verdictMiddleware) => AiProvider`. It keeps each verdict call Claude answered (`verdictCalls`: its model and tokens), as it keeps the Stylist's turns.
    - Each result has:
      - `stylistCostUsd` and `uncachedStylistCostUsd`, which were `costUsd` and `uncachedCostUsd`;
      - `verdictCostUsd`, each call priced by its own model's rate card;
      - `costUsd`, which is now the sum.

      The cache figures and largest prompt are the Stylist's, as before.
  - **The Preview report comes from the Preview phase.**
    - `InlineStylingRunner.runPending` takes an optional function that wraps the steps it runs. The check uses it to watch the Preview phase's steps, keyed by Outfit ID: the draw, the first verdict, the redraw, the redraw's verdict and the keep.
    - Each `CheckedOutfit` has `preview`, which gains `"unchecked"`, and `redrawn`. `redrawn` replaces `correction`. It holds the correction, whether the first image broke a hard rule, and how the redraw came out: declined, couldn't be drawn, or judged (whether it broke a hard rule, which image was better) or left with no verdict.
    - The old matching of redraws to Outfits by their Pieces is gone, so an Outfit whose Pieces are like another's now gets its correction. The drawer still finds its Outfit by Pieces.
  - **Hair-length pass-overs.** The check also watches `passOverStyleIcon`. Each result has `hairLengthPassOvers` (each Style Icon by name, with the reason the user read) and `hairLengthPassOversRefused`.
  - **The script.**
    - The estimate covers both models: about $0.16 of Haiku turns and $0.37 for about 22 Sonnet verdicts, $1.33 in all.
    - The report names both models. It gives each Styling's and the totals' cost split by model, each Outfit's Preview line from the Preview phase, and a line of hair-length pass-overs for each Styling. It says how many Previews had no verdict.
    - Each case's folder gains `verdicts.json`.
    - Bad Previews and `--previews-from` still work at the image model.
  - The README's account of the check is updated.
- 2026-10-24: Choices the ticket left open:
  - **How verdict calls are seen.** `judgePreview` returns no token usage, so the adapter gained an option rather than the interface gaining usage. That keeps cost out of the domain, and it also counts a call whose reply was in the wrong form, which is still billed.
  - **How the Preview phase is seen.** The check watches its steps, not the AI calls, because a verdict isn't told which Outfit it's judging.
  - **Which hair-length pass-overs count.** A pass-over of a Style Icon passed over already goes through with nothing done (`stylist-steps.ts`). So only the first to go through for each Style Icon counts, and never more than the Styling's own `hair_length_pass_overs`. That makes a body photo's always none.
  - **Extras for ticket 07.** These weren't asked for:
    - the hard-rule flags on both verdicts;
    - which image the redraw's verdict called better;
    - the refused count;
    - `verdicts.json`, which shows whether later verdicts read the rules and photo from cache.
  - **For /domain-modeling: the glossary.** "Preview phase" and "verdict" are the check's main nouns now, but GLOSSARY has neither. Its **Stylist** and **Outfit** entries are still out of date, as ticket 05 noted.
- 2026-10-24: **Results.** Typecheck is clean and all 1,097 tests pass. The end-to-end tests weren't run, since nothing they use changed.
  - New and changed tests in `stylist-check.test.ts` cover:
    - cost across both models, with verdicts through the real Anthropic adapter against a faked Anthropic API, each priced by its own rate card;
    - the Preview report: kept, unchecked, declined, failed, redraw kept, neither kept, a redraw declined or failed, a redraw with no verdict or judged worse, and corrections for Outfits whose Pieces are alike;
    - hair-length pass-overs: two reported and a third refused, a style pass-over left out, and none reported for a Style Icon passed over already, on a Face Photo and on a body photo.
  - The plan the script prints without `--go-ahead` was checked by eye. The check on real Claude wasn't run, since that costs money; ticket 07 runs it.
