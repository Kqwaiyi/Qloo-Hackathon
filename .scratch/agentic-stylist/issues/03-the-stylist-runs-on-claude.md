# 03: The Stylist runs on Claude

**What to build:** With real AI switched on, the Stylist's model is Claude Haiku 5.5 at high effort, supplied by the Anthropic adapter. Real Face Photo Stylings then run end to end with real keys, and body-photo Stylings do too once ticket 04 lands. Claude's thinking never reaches us, and a failed call never puts the photo in a log. Respect [ADR-0011](../../../docs/adr/0011-claude-runs-every-model-but-the-image-model.md) and [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

**Blocked by:** 01 (Photo check on Claude Haiku, with re-consent), 02 (Face Photo Stylings run through the Stylist)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Models and providers" and "The Stylist and its tools" (the Stylist's prompt), and "Testing Decisions" (the Anthropic adapter). Stories 6, 7, 54, 57 and 67.

- [ ] The Anthropic adapter supplies the Stylist's model: Claude Haiku 5.5 at high effort, with thinking display omitted, no temperature and no prefill. The Stylist is never forced to call a tool, because Haiku skips thinking when forced.
- [ ] The Stylist's stable prefix (its tools, its brief and the photo) is cached, so each turn reads the photo from cache.
- [ ] The model the agent calls is wrapped so that a failed call's error loses its request before it's thrown, stored as a step error or logged. An error Anthropic will give again is unretryable, as for the photo check.
- [ ] A refusal part-way through breaks the Styling, keeping any earlier Outfits and offering Try again.
- [ ] The Stylist's prompt carries today's tailoring rules:
  - style only the Main Person, named as the most prominent person;
  - never guess age or gender;
  - never infer ethnicity, skin tone, body measurements or health;
  - no prices;
  - prefer separates to a One-Piece;
  - today's Hairstyle rules.
- [ ] The prompt also covers the notes: second person, English, short and about style. They name Qloo but not the product search provider.
- [ ] The prompt covers every tool in place when this lands. Later tickets extend it for theirs.
- [ ] Anthropic adapter tests against the fake Anthropic API check that:
  - one of the Stylist's calls carries the brief, tools, conversation and photo, with cache control, high effort and thinking display omitted;
  - its text and tool calls come back;
  - a failed call's error has lost its request;
  - a refusal comes back as a refusal.
- [ ] **Team step:** run one real Face Photo Styling locally with real keys, and note its turns and time in this ticket's Comments.
