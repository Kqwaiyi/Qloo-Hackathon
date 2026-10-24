# 09: The Demo Account's Stylist gets more room

**What to build:** So that the judges' Stylings complete, each Styling on the Demo Account gets more room: 60 turns, 10 Brand fetches and 40 product searches. Every other account keeps 30, 6 and 24. Redraws stay at 1 per Outfit, and the monthly product-search backstop and the Anthropic spend limit still apply.

**Blocked by:** 04 (Body-photo Stylings run through the Stylist; the fixed pipeline goes)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Stylist and its tools" and "The loop" (the turn cap). Story 61.

- [x] The Styling config holds both sets of per-Styling limits: everyone's (30 turns, 6 Brand fetches, 24 product searches), and the Demo Account's (60, 10, 40).
- [x] A Styling on the Demo Account uses the Demo Account's limits, and every other Styling uses everyone's.
- [ ] The product-search backstop's check, that a new Styling has a Styling's worth of searches left this month, uses 40 for a Demo Account Styling.
- [x] Operations tests check that:
  - the Demo Account's 61st turn finishes the Styling, and its 11th Brand fetch and 41st search are refused;
  - another account's 31st turn, 7th Brand fetch and 25th search are, as before.

  Prior art: the Demo Account Consultations tests.

## Comments

- 2026-10-24: Each Styling's limits now come from the account it runs on.
  - **The config.** `src/config/stylings.ts` replaces `MAX_STYLIST_TURNS`, `MAX_BRAND_FETCHES_PER_STYLING` and `MAX_PRODUCT_SEARCHES_PER_STYLING` with `StylingLimits` (`turns`, `brandFetches`, `productSearches`). It holds two sets: `EVERYONES_STYLING_LIMITS` (30, 6, 24) and `DEMO_ACCOUNT_STYLING_LIMITS` (60, 10, 40). `stylingLimitsFor(onDemoAccount)` picks one.
  - **Picking the set.** The choice comes from `styling.on_demo_account`. `readRunningStyling` and `readBuilding` now return the Styling's `limits` in place of that flag.
  - **The turn cap.** A new step, `readTurnCap`, is a `"use step"` in `src/workflows/styling.ts`, like `readBrief`. It gives `runStylist` the cap, which feeds `isStepCount` and the check for "finished at the turn cap". The cap isn't in the brief, so the Stylist's prompt and brief are unchanged.
  - **Brand fetches and searches.** `fetchBrands`, `readBrandsInPlay` (`fetchesLeft`) and `searchProducts` (its refusal and `searchesLeft`) all read the Styling's own limits. The refusal messages name the Styling's own number ("fetched the Brands of 10 Style Icons", "made all 40 of its product searches").
  - **Unchanged.** Redraws stay at once per Outfit: they were never a number in the config. The `StylingLimits` doc says so.
  - **The fake Stylist** no longer starts from the per-Styling caps. Until a tool says how many searches or fetches are left, it assumes some are, and it's still capped by the calls it may make at once. So it now plays the same on either account.
  - **Docs.** README's Demo Account section lists the Demo Account's room. The ADR-0011 consequence line now reads "30 turns (60 on the Demo Account)". The schema and `limits.ts` comments name the new config.
- 2026-10-24: **Checkbox 3 (the backstop's check uses 40) is left undone.** As written, the ticket conflicts with the spec:
  - `checkStylingStart` returns early for the Demo Account, before the product-search backstop is read.
  - The existing tests pin that: "the Demo Account's exemptions … while the product-search backstop stops everyone else's", and "still ok at 4,977 searches".
  - The README says no usage limit applies to it, "not … the product-search backstop", and real-products/spec.md says the backstop's "Demo Account treatment match[es] the Qloo backstop's".
  - This spec's Out of Scope list rules out "any change to … the Qloo and product-search backstops".

  So no Demo Account Styling runs the check, and making it use 40 would mean ending the exemption. The check now reads `EVERYONES_STYLING_LIMITS.productSearches` (24), and a comment says it only ever holds everyone else's Stylings. The Demo Account's searches still count towards the monthly backstop, as before. If the team does want the Demo Account held by the backstop, that's a new decision, and this checkbox should be reworded.
- 2026-10-24: **Results.** Typecheck is clean, all 1,018 tests pass, and all 12 end-to-end tests pass, through the real Workflow and its new `readTurnCap` step.
  - **New operations tests** are in `demo-account-consultations.test.ts` under "the Demo Account's Stylist":
    - its 60 turns are used up and the Styling finishes with the Outfit it saved, so there's no 61st turn;
    - an 11th Brand fetch is refused, with only 10 Style Icons' Brands asked of Qloo;
    - a 41st search is refused, and 40 are sent and counted towards the Styling and the month.
  - **Other accounts' 31st turn, 7th fetch and 25th search** keep their existing tests in `stylist.test.ts`: "the turn cap", "refuses the Brands of a 7th Style Icon" and "refuses a 25th search".
  - **Worth knowing:** ADR-0011 keeps the Stylist's conversation under Haiku's 100,000-token price step. Nothing caps tokens directly, and 60 turns roughly doubles the longest conversation the Demo Account can have. The Haiku check (11) reports the largest prompt, so it should run one long Demo Account Styling.
