# 01: Photo check on Claude Haiku, with re-consent

**What to build:** With real AI switched on, the photo check runs on Claude Haiku 5.5 instead of Gemini. Every rejection and its message stay as today, and a photo Claude refuses to look at is rejected as not appropriate, as a Google block is today. Photos now go to Anthropic, so the consent sheet names Anthropic's Claude beside Google's Gemini, and its version goes up so every user sees it again before their next Consultation. The Privacy Policy and the deletion confirmations name Anthropic too. Tailoring and Previews stay on Gemini for now, so real AI is two adapters together. Respect [ADR-0011](../../../docs/adr/0011-claude-runs-every-model-but-the-image-model.md), [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md) and [ADR-0009](../../../docs/adr/0009-only-the-main-person-is-styled.md).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "Implementation Decisions › Models and providers" and "Consent, legal and landing copy", and "Testing Decisions" (the Anthropic adapter). Stories 45–50, 52, 56 and 67.

- [x] A new Anthropic adapter implements the photo check through the AI SDK's Anthropic provider, at the version built for the app's AI SDK. It sends today's prompt and asks for today's report, as structured output. It runs on Claude Haiku 5.5 at medium effort, with thinking display omitted, no temperature and no prefill. Our code still decides every rejection, in today's order.
- [x] A refusal from Claude comes back as blocked, so the photo is rejected as not appropriate, with today's message.
- [x] The adapter strips each error of its request before it's thrown or logged, so the photo never reaches a log. An error Anthropic will give again, such as a bad request or a refused key, is unretryable. Others are retried as the Gemini adapter's are.
- [x] Switching real AI on now combines the adapters: the photo check on Anthropic, tailoring and Previews on Gemini. It needs both an Anthropic and a Gemini key, and the app refuses to start without either. The fake AI stays the default. The example environment file documents the Anthropic key.
- [x] The AI config names the Claude model and the photo check's effort. The Gemini photo-check model setting goes.
- [x] The consent sheet's photo notice, and its second tick box, say photos go to Anthropic's Claude and Google's Gemini. The photo notice version goes up by one.
- [x] The Privacy Policy names Anthropic as a processor of photos. It says what Anthropic gets, how long it keeps it (within 30 days, the longer of Anthropic's own figures, and up to 2 years for anything its trust and safety team flags), and that it doesn't train on it.
- [x] The deletion confirmations name Anthropic's retention next to Google's.
- [x] The Anthropic adapter is tested against a fake Anthropic API, as the Gemini adapter is against a fake Gemini. The tests check that:
  - the request carries the photo inline, the prompt, structured output, medium effort and thinking display omitted;
  - the report carries what the model said;
  - a refusal is blocked;
  - which errors are retryable;
  - the photo never appears in an error.
- [x] The AI environment tests cover the combined real setting and the errors for each missing key. The Gemini adapter's photo-check tests go.
- [x] The existing photo-check operation tests pass unchanged on the fake AI. The existing photo consent test covers the version bump.

## Comments

- 2026-10-24: The photo check runs on Claude Haiku 5.5 through a new Anthropic adapter (`src/server/ai/anthropic.ts`), on `@ai-sdk/anthropic` 4.0.79, the release on the same `@ai-sdk/provider` 4.0.27 and `provider-utils` 5.0.59 as `ai` 7.0.140. It sends today's prompt and reply schema unchanged, as structured output, at medium effort with thinking display omitted, and a refusal, before or part-way through the report, comes back blocked. Errors are stripped of their request in a helper both adapters now share (`src/server/ai/ai-sdk.ts`). The Gemini adapter keeps tailoring and Previews. Real AI is now `AI_PROVIDER=real`, which needs `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` and refuses `gemini`, so ticket 12 gains a step to change production's value. The consent sheet's second box is now `sendToAiProviders` in code, and the photo notice is at version 4. Typecheck is clean, all 925 tests pass, and the new-Consultation, photo-check and app-pages end-to-end tests pass. The Privacy Policy was read in the running app. Not checked: the consent sheet and deletion modal by eye (the end-to-end run ticks the new second box), and a live photo check against Anthropic, which costs money. Claude's structured output doesn't enforce the schema's `minItems`/`maxItems` (the provider moves them into the description), so a reply with three Photo Style words would fail the check as a retryable error rather than be trimmed; worth watching in the first live runs. The "Delete this Consultation?" dialog names no provider's retention, as before.
