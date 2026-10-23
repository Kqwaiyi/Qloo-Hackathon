# 02: Face Photo Stylings run through the Stylist

**What to build:** A Face Photo's Stylings, of every kind it can have (first, "Show 2 more Outfits", Photo Style change and Try again), are carried out by the Stylist: the AI SDK's Workflow agent, working through tools. It runs on the fake AI's scripted fake model, which by default plays today's pipeline, so users see the same Outfits and the same checklist as today. Body photos keep today's pipeline until ticket 04. From here on, the photo goes into the agent's conversation, which Vercel keeps as Workflow run data while the Styling runs. So the Privacy Policy and the deletion copy say so. Respect [ADR-0010](../../../docs/adr/0010-the-stylist-chooses-among-qloos-picks.md) and [ADR-0011](../../../docs/adr/0011-claude-runs-every-model-but-the-image-model.md).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › The Stylist and its tools", "The loop", "Storage" and "Fakes and the check", and "Testing Decisions" (the operations seam). Stories 1, 12, 26, 27, 34, 35, 37, 38, 53, 55, 57–60, 62, 63 and 68.

- [ ] **Confirm first:** check that the inline Styling runner can run the agent by calling the Stylist's Workflow function directly, with the Workflow directives doing nothing outside the compiler. If it can't, the inline runner moves to the Workflow SDK's Vitest plugin. Record which in this ticket's Comments.
- [ ] The AI SDK's Workflow agent package is added, pinned to the release built for the app's AI SDK version.
- [ ] Our AI interface supplies the Stylist's model. On the fake AI, that's a scripted fake model. Body photos keep the tailoring method until ticket 04.
- [ ] The Stylist's tools for a Face Photo:
  - **Find Style Icons:** today's person calls, ranked and saved as today.
  - **Save an Outfit:** the Style Icon, and the Hairstyle's cut, details, whether the cut is known, and its "why". It applies today's checks: the fields are present and there are no prices.
  - **Render a Preview:** opens only once the Stylist says it has saved every Outfit.
  - **Finish.**
- [ ] A tool that refuses returns an error the Stylist can read and correct on its next turn.
- [ ] Each tool's work is a durable step with today's retries and today's at-once limits.
- [ ] Each kind of Styling gets its brief:
  - **A first Styling** finds its own Style Icons.
  - **"Show 2 more Outfits"** gets the next unused Style Icons.
  - **A Photo Style change** finds new Style Icons for the new Photo Style.
  - **Try again** gets the Style Icons the broken Styling used or passed over, and never checks the photo again.

  How many Outfits each Styling may make is decided as today.
- [ ] The photo goes into the conversation once, read from Blob in a step. Styling runs keep starting with zero retention.
- [ ] A stop condition caps the agent at 30 turns. A Styling that reaches it finishes with the Outfits it saved. A model call that still fails after its retries breaks the Styling, keeping what today's finish keeps.
- [ ] For Face Photos, the turn cap replaces the tailoring attempts and substitutes. Body photos keep them until ticket 04.
- [ ] The stored stage follows the tools ("Finding Style Icons", "Building Outfits", "Generating Previews"), so the checklist and its Preview count work as today.
- [ ] The fake model, by default, takes Qloo's order and makes today's Hairstyle. The unknown-cut scenario maps onto it. The bad-replies scenario keeps saving Outfits that break a rule until the turn cap, so the Styling fails as nothing could be built.
- [ ] The Privacy Policy's Workflow run data line, and the matching row of the photo schedule, now say what run data holds. That's the photo, its Previews and the Stylist's conversation, encrypted, while a Styling runs. It's unreadable the moment the Styling ends, and every copy is gone within 36 days.
- [ ] The deletion confirmations say "within 36 days" where they said "within a day".
- [ ] Today's Face Photo Styling tests pass at the operations seam on the default fake model.
- [ ] New operations tests:
  - the turn cap;
  - a refused save corrected on the next turn;
  - a render asked for before every Outfit is saved is refused;
  - each kind's brief;
  - the fake model receives the photo once.
