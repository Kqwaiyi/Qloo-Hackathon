# 02: Face Photo Stylings run through the Stylist

**What to build:** A Face Photo's Stylings, of every kind it can have (first, "Show 2 more Outfits", Photo Style change and Try again), are carried out by the Stylist: the AI SDK's Workflow agent, working through tools. It runs on the fake AI's scripted fake model, which by default plays today's pipeline, so users see the same Outfits and the same checklist as today. Body photos keep today's pipeline until ticket 04. From here on, the photo goes into the agent's conversation, which Vercel keeps as Workflow run data while the Styling runs. So the Privacy Policy and the deletion copy say so. Respect [ADR-0010](../../../docs/adr/0010-the-stylist-chooses-among-qloos-picks.md) and [ADR-0011](../../../docs/adr/0011-claude-runs-every-model-but-the-image-model.md).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Stylist and its tools", "The loop", "Storage" and "Fakes and the check", and "Testing Decisions" (the operations seam). Stories 1, 12, 26, 27, 34, 35, 37, 38, 53, 55, 57–60, 62, 63 and 68.

- [x] **Confirm first:** check that the inline Styling runner can run the agent by calling the Stylist's Workflow function directly, with the Workflow directives doing nothing outside the compiler. If it can't, the inline runner moves to the Workflow SDK's Vitest plugin. Record which in this ticket's Comments.
- [x] The AI SDK's Workflow agent package is added, pinned to the release built for the app's AI SDK version.
- [x] Our AI interface supplies the Stylist's model. On the fake AI, that's a scripted fake model. Body photos keep the tailoring method until ticket 04.
- [x] The Stylist's tools for a Face Photo:
  - **Find Style Icons:** today's person calls, ranked and saved as today.
  - **Save an Outfit:** the Style Icon, and the Hairstyle's cut, details, whether the cut is known, and its "why". It applies today's checks: the fields are present and there are no prices.
  - **Render a Preview:** opens only once the Stylist says it has saved every Outfit.
  - **Finish.**
- [x] A tool that refuses returns an error the Stylist can read and correct on its next turn.
- [x] Each tool's work is a durable step with today's retries and today's at-once limits.
- [x] Each kind of Styling gets its brief:
  - **A first Styling** finds its own Style Icons.
  - **"Show 2 more Outfits"** gets the next unused Style Icons.
  - **A Photo Style change** finds new Style Icons for the new Photo Style.
  - **Try again** gets the Style Icons the broken Styling used or passed over, and never checks the photo again.

  How many Outfits each Styling may make is decided as today.
- [x] The photo goes into the conversation once, read from Blob in a step. Styling runs keep starting with zero retention.
- [x] A stop condition caps the agent at 30 turns. A Styling that reaches it finishes with the Outfits it saved. A model call that still fails after its retries breaks the Styling, keeping what today's finish keeps.
- [x] For Face Photos, the turn cap replaces the tailoring attempts and substitutes. Body photos keep them until ticket 04.
- [x] The stored stage follows the tools ("Finding Style Icons", "Building Outfits", "Generating Previews"), so the checklist and its Preview count work as today.
- [x] The fake model, by default, takes Qloo's order and makes today's Hairstyle. The unknown-cut scenario maps onto it. The bad-replies scenario keeps saving Outfits that break a rule until the turn cap, so the Styling fails as nothing could be built.
- [x] The Privacy Policy's Workflow run data line, and the matching row of the photo schedule, now say what run data holds. That's the photo, its Previews and the Stylist's conversation, encrypted, while a Styling runs. It's unreadable the moment the Styling ends, and every copy is gone within 36 days.
- [x] The deletion confirmations say "within 36 days" where they said "within a day".
- [x] Today's Face Photo Styling tests pass at the operations seam on the default fake model.
- [x] New operations tests:
  - the turn cap;
  - a refused save corrected on the next turn;
  - a render asked for before every Outfit is saved is refused;
  - each kind's brief;
  - the fake model receives the photo once.

## Comments

- 2026-10-24: **Confirmed first:** the inline runner runs the agent with no Workflow plugin. Outside the compiler, `"use workflow"` and `"use step"` do nothing, so `WorkflowAgent` and its own model step (`doGenerateStep`) run as plain functions on the test's fake model. As before, the runner calls the Workflow's body (`runStyling`, which routes a Face Photo to `runStylist`), not the `"use workflow"` function itself, whose step wrappers load the app's own services. The real Workflow path was checked separately: a throwaway Playwright run on local development (the Local World, not committed) took a Face Photo Styling to two Outfits through `doGenerateStep` and every tool step. No automated test covers the Workflow-only glue: `WorkflowStylistModel`'s serialization and its `"use step"` calls, `appStylistModel`, and the new step wrappers.
- 2026-10-24: Face Photo Stylings run through the Stylist, on `@ai-sdk/workflow` 2.0.72, the release built on `ai` 7.0.140. `@ai-sdk/provider` 4.0.27 (types) and `@workflow/serde` 5.0.0 are now direct dependencies at the versions already installed.
  - `AiProvider.stylistModel()` supplies the model. The fake's is a scripted model (`src/server/ai/fake-stylist.ts`) that reads the conversation each turn and makes the fixed pipeline's choices. `unknown-cut` maps onto it, and `tailoring-fails` makes every save break a rule until the turn cap. Tests script turns with `harness.ai.stylistTurn` and read what each turn was sent in `harness.ai.stylistRequests`.
  - In the Workflow, the agent's model is `WorkflowStylistModel` (`src/workflows/stylist-model.ts`). It serializes to nothing and, inside the model step, calls the app's own Stylist's model.
  - With `AI_PROVIDER=real`, the Stylist's model refuses every turn (`UnretryableAiError`, which neither the AI SDK nor the Workflow retries), so a real Face Photo Styling breaks until ticket 03 brings Claude. So does the team's landing sample script for a Face Photo.
- 2026-10-24: Two choices the ticket left open, which tickets 03 and 07 must know about:
  - **A fifth tool, `startPreviews`,** is how the Stylist "says it has saved every Outfit". It closes saving, moves the stage to Generating Previews and opens `renderPreview`. Saves after it are refused, and so are renders before it. Ticket 03's prompt must cover it.
  - **`saveOutfit` takes each Outfit's Style Icon in Qloo's order:** it must be the next unused one on the list. Until ticket 07 adds passing over, the Stylist can't skip a Style Icon silently. Ticket 07 should keep or relax this knowingly.
- 2026-10-24: More decisions, and what to watch:
  - **Tool order and limits.** `findStyleIcons`, `saveOutfit`, `startPreviews` and opening a Preview run one at a time, in the order the Stylist called them, so Outfits are numbered in that order. At most 2 Previews render at once.
  - **Failures.** A tool step that still fails after its retries breaks the Styling once that turn's tools are done. So do a model call that fails and the Stylist stopping without `finish`. A Preview that fails is left to the finish to mark failed, as before.
  - **Briefs.** The brief is a heading and JSON beside the photo, in the first message. "Show 2 more Outfits" also lists the Style Icons already used, and Try again lists the passed-over ones.
  - **The checklist** now shows "Generating Previews (2 of 2)" through the Stylist's last turn, the one that calls `finish`.
  - **The photo notice version** isn't raised again for the deletion promise's "within 36 days". Ticket 01 raised it to 4 on this unreleased branch, and the spec asks for one bump.
  - **The Privacy Policy** says run data "never holds the Product photos themselves". Ticket 08 should revisit this when seller photos' links enter the conversation.
- 2026-10-24: **Results.** Typecheck is clean and all 942 tests pass. The new operations tests are in `src/server/operations/stylist.test.ts`. The Face Photo tailoring-substitute tests are gone, replaced by the turn-cap tests. The new-Consultation, My Consultations and app-pages end-to-end tests pass, and the Privacy Policy's new run data line and schedule row were checked in the running app.
