# 04: On a Face Photo, the Stylist may pass over Style Icons for hair length

**What to build:** On a Face Photo the Hairstyle is the whole Outfit. So the Stylist may pass over a Style Icon whose signature cut needs much more length than the user's hair has, telling them why in plain styling terms about the cut's length. It does this at most twice in a Styling. After that, and on every other Photo Type, it adapts the cut to what the user's hair can do, as today. Hair texture is never a reason, and never written about, since a note about it can read as a remark about ethnicity. This works whichever model runs the Stylist. Respect [ADR-0010](../../../docs/adr/0010-the-stylist-chooses-among-qloos-picks.md) and [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) section "Implementation Decisions › The Stylist's loop", and "Testing Decisions" (the operations seam). Stories 27–34 and 48.

- [ ] passOverStyleIcon takes a kind of reason: style or hair length.
- [ ] Hair length is accepted only on a Face Photo, and at most twice in a Styling.
  - A third is refused, with a reason that says to adapt the cut instead.
  - A hair-length pass-over on any other Photo Type is refused the same way.
  - Each Styling counts its own, so "Show 2 more Outfits" and Try again each allow two more.
- [ ] A style reason works as today. Either kind of reason is shown to the user as a note, as today.
- [ ] The prompt gains the Face Photo rule: pass over a Style Icon whose signature cut needs much more length than the person's hair has, giving a reason about the cut's length. Never pass over a Style Icon for the hair's texture, and never write about it: adapt the cut instead. The rest of the Hairstyle rules are unchanged.
- [ ] Operations tests check that:
  - on a Face Photo, two hair-length pass-overs are accepted and a third is refused;
  - a hair-length pass-over on a body photo is refused;
  - a style pass-over works as today.
- [ ] The prompt's tests check the new rule, as they check its other rules today.

## Comments

- 2026-10-24: The pass-over tool now enforces the hair-length rule.
  - **The kind of reason.** passOverStyleIcon takes a required `reasonKind`, either `style` or `hairLength`.
  - **Its checks.** In the `passOverStyleIcon` step, a `hairLength` pass-over is refused off a Face Photo. On a Face Photo, it's refused once the Styling has used `HAIR_LENGTH_PASS_OVERS_PER_STYLING` (2, in `src/config/stylings.ts`). Both refusals end "adapt <name>'s signature cut to what the person's hair can do instead."
  - **The count.** Migration `0026_hair_length_pass_overs` adds `styling.hair_length_pass_overs`. It goes up in the same transaction that marks the Style Icon skipped, so a retry never counts twice. Each Styling has its own row, so "Show 2 more Outfits" and Try again each start from 0.
  - **What's unchanged.** Either kind adds the "Passed over <name>" step, then the reason as a note, as today.
  - **The prompt.**
    - It gains a "Hair length, on a Face Photo" bullet under "Choosing among Qloo's picks".
    - Step 3 asks for the kind of reason, and the Style Icons bullet names `style`.
    - The Hairstyle rules are unchanged.
- 2026-10-24: Choices the ticket left open:
  - **`reasonKind` is required, not defaulted to `style`.** The Stylist has to say which kind every time, so a hair-length pass-over can't slip past the limit unlabelled. A call without it is refused by the AI SDK's input check, whose message names `reasonKind`, before the tool runs. Ticket 05 should watch whether Haiku ever leaves it out.
  - **Only a count is stored,** never which Style Icons were passed over for hair length. Ticket 06 can find them in the check's recorded calls: each `StylistCall` has its input, with its `reasonKind`, and `refusedBefore` says which calls were refused.
  - **The Reasons rule changed to fit.** It now says "Reasons are about style, or for hairLength the length a cut needs, never about the user or the Style Icon as a person". Otherwise it would contradict the hair-length example, "a cut from yours can reach".
  - **An empty hair-length reason** is refused asking for one "about the length their signature cut needs", where a style one asks "about style".
  - **The prompt writes the limit as "at most 2",** since it imports nothing. That follows "top 3". The tool's description and its input schema use the config constant.
  - **Hair texture is held back by the prompt and the tool's descriptions only.** No code checks a reason for texture words.
  - **The Demo Account has the same limit of 2.**
  - **The fake Stylist gained no hair-length scenario.** Its pass-overs now name `reasonKind: "style"`.
  - **For /domain-modeling: the glossary.** GLOSSARY has no entry for passing over a Style Icon, and that now has two kinds.
- 2026-10-24: **Results.** Typecheck is clean and all 1,088 tests pass. The end-to-end tests weren't run.
  - New operations tests in `stylist.test.ts` ("passing over a Style Icon for hair length") cover:
    - two accepted on a Face Photo, a third refused, and both reasons shown as notes;
    - a style pass-over still going through once both are used;
    - an empty hair-length reason;
    - a hair-length pass-over refused on a Full-Body and a Body-Only Photo;
    - "Show 2 more Outfits" and Try again each allowing two more.
  - A pass-over with no `reasonKind` is refused.
  - The existing style pass-over tests now name `reasonKind: "style"` and pass as before.
  - A new prompt test checks the Face Photo rule, and the Reasons rule's test follows its new wording.
