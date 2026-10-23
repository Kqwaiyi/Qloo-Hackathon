# 03: The Stylist runs on Claude

**What to build:** With real AI switched on, the Stylist's model is Claude Haiku 5.5 at high effort, supplied by the Anthropic adapter. Real Face Photo Stylings then run end to end with real keys, and body-photo Stylings do too once ticket 04 lands. Claude's thinking never reaches us, and a failed call never puts the photo in a log. Respect [ADR-0011](../../../docs/adr/0011-claude-runs-every-model-but-the-image-model.md) and [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

**Blocked by:** 01 (Photo check on Claude Haiku, with re-consent), 02 (Face Photo Stylings run through the Stylist)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Models and providers" and "The Stylist and its tools" (the Stylist's prompt), and "Testing Decisions" (the Anthropic adapter). Stories 6, 7, 54, 57 and 67.

- [x] The Anthropic adapter supplies the Stylist's model: Claude Haiku 5.5 at high effort, with thinking display omitted, no temperature and no prefill. The Stylist is never forced to call a tool, because Haiku skips thinking when forced.
- [x] The Stylist's stable prefix (its tools, its brief and the photo) is cached, so each turn reads the photo from cache.
- [x] The model the agent calls is wrapped so that a failed call's error loses its request before it's thrown, stored as a step error or logged. An error Anthropic will give again is unretryable, as for the photo check.
- [x] A refusal part-way through breaks the Styling, keeping any earlier Outfits and offering Try again.
- [x] The Stylist's prompt carries today's tailoring rules:
  - style only the Main Person, named as the most prominent person;
  - never guess age or gender;
  - never infer ethnicity, skin tone, body measurements or health;
  - no prices;
  - prefer separates to a One-Piece;
  - today's Hairstyle rules.
- [x] The prompt also covers the notes: second person, English, short and about style. They name Qloo but not the product search provider.
- [x] The prompt covers every tool in place when this lands. Later tickets extend it for theirs.
- [x] Anthropic adapter tests against the fake Anthropic API check that:
  - one of the Stylist's calls carries the brief, tools, conversation and photo, with cache control, high effort and thinking display omitted;
  - its text and tool calls come back;
  - a failed call's error has lost its request;
  - a refusal comes back as a refusal.
- [ ] **Team step:** run one real Face Photo Styling locally with real keys, and note its turns and time in this ticket's Comments.

## Comments

- 2026-10-24: Claude runs the Stylist. `AnthropicAiProvider.stylistModel()` is Claude Haiku 5.5 (`CLAUDE_STYLIST_MODEL`, `CLAUDE_STYLIST_EFFORT` in `src/config/ai.ts`), wrapped with the AI SDK's `wrapLanguageModel`, and real AI's Stylist is now that model.
  - **Each turn** is asked for at high effort, with adaptive thinking and its display omitted, no temperature and no prefill. The tool choice is left at auto, and the Stylist never sets it. A turn may write at most 16,000 tokens, thinking included (`CLAUDE_STYLIST_MAX_OUTPUT_TOKENS`, not in the spec). Without a cap, the provider asks for 128,000 on a call that doesn't stream, and each turn must finish inside one durable step.
  - **Caching.** A cache breakpoint sits on the last part of the conversation's first message, the brief and the photo. So the tools, the prompt, the brief and the photo are read from cache on every turn. Beyond the ticket, the request also sets Anthropic's top-level automatic caching, so each turn also reads the conversation so far from cache and writes the new tail. Haiku 5.5's minimum cacheable prefix is 512 tokens, and the prompt alone is past that.
  - **Errors** lose their request inside the wrapped model, before the Workflow agent's own AI SDK retries (2) see them. So neither the model step's stored error (`terminalError` in its run data) nor a log ever holds the conversation or the photo. An error worth retrying stays an AI SDK `APICallError`, with only its message, status and response headers, so those retries still happen. A 400, 401, 403 or 413 is an `UnretryableAiError`, tried once (`withoutRequestStillRetryable` in `src/server/ai/ai-sdk.ts`).
  - **Refusals.** A turn Claude refuses comes back with finish reason `content-filter` and none of the tool calls it had written, so nothing it asked for runs. `runStylist` breaks the Styling on it, even on the 30th turn, keeping what any broken Styling keeps. The model refuses to stream a turn, since a stream couldn't take back a refused turn's tool calls.
- 2026-10-24: **The Stylist's prompt** is `src/server/stylings/stylist-prompt.ts`, given to the Workflow agent as its instructions, beside the tools it describes. It isn't in the adapter, since it's the same whichever model runs the Stylist, and later tickets extend it with their tools there.
  - It covers all five tools, `startPreviews` included, today's tailoring rules and the rules for notes. It asks for a note each turn, but nothing stores the notes until ticket 05.
  - Its tailoring rules repeat `gemini.ts`'s tailoring prompt, so the two change together until ticket 04 removes tailoring.
  - Tests read it through the fake model, which now records `instructions` and can script a refused turn (`{ refused: true }`).
- 2026-10-24: **The Privacy Policy's Anthropic bullet** said Claude "gets nothing else about you", which stopped being true here. It now says Claude runs the AI Stylist, and that with the photo the AI Stylist gets the Photo Type, the age group, the Photo Style, the Style Icons' names and each Outfit's line. Ticket 08 adds Previews and seller photos' links. Checked in the running app.
- 2026-10-24: **What to watch in the Team step and the Haiku check (ticket 11):**
  - `cache_read_input_tokens` should cover the prompt, tools, brief and photo from turn 2 on.
  - The tail caching should save more than its cache writes cost.
  - No turn should finish on `length`: a turn that hits the cap has no tool call, so its Styling breaks.
- 2026-10-24: **Results.** Typecheck is clean and all 968 tests pass. The Anthropic adapter's Stylist tests are in `src/server/ai/anthropic.test.ts`; the refusal and prompt tests are in `src/server/operations/stylist.test.ts`. The end-to-end tests weren't run, since no page the browser tests drive changed. **Not done:** the Team step, a live Face Photo Styling with real keys, which costs money and is the team's to run.
