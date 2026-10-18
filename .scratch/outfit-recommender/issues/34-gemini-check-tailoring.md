# 34: Gemini adapter: photo check and tailoring

**What to build:** The real AI provider behind our interface for checking photos and tailoring Pieces, running on Gemini through the Vercel AI SDK. It stays off unless explicitly switched on, so the fake adapter remains the default in development and tests. The prompts carry the AI contract's rules: report only what's visible, never guess age or sensitive traits, and tailor generic, plausible Pieces with respectful "why" lines.

**Blocked by:** [07 Photo check rejections and the one-tap Photo Type switch](07-photo-check-rejections.md), [16 One-Piece Outfits](16-one-piece-outfits.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (1. Check a photo; 2. Tailor one Outfit's Pieces; Gemini adapter) and "Testing Decisions" (Live checks). Stories 85 and 96–99. [ADR-0001](../../../docs/adr/0001-qloo-selects-ai-concretizes.md), [ADR-0003](../../../docs/adr/0003-ai-may-merge-top-and-bottom.md), [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

- [x] The adapter implements the interface's photo-check and tailoring operations with the AI SDK (`ai@7`, `@ai-sdk/google@4`), which appears nowhere else in the code. It owns its prompts.
- [x] Both operations use `gemini-3.5-flash-lite`, named in config. Images are always sent inline, never through the Files API.
- [x] It runs only when explicitly switched on by configuration.
- [x] The photo-check prompt asks only for what the interface returns. It may name hijabs, turbans and caps as examples of covered hair, but only yes or no comes back. No age guessing, and no inference of ethnicity, skin tone, body measurements or health. A plain photo reads as casual.
- [x] Google blocking the photo maps to "not appropriate". The check relies on the AI SDK's own retries, and an error that remains is the "check errored" outcome.
- [x] The tailoring prompt sets the rules: generic items, never product or model names; never a price; only an item the Brand plausibly makes; the Top is one garment, the main visible upper layer. `why` is in English and second person, about 20 words; it may mention the garment, the Style Icon, the Photo Style, the user's hair and what they're already wearing, and never body size or shape, weight, skin colour, ethnicity, gender or age.
- [x] One-Piece: only on the Top Brand, only when that Brand plausibly makes one and it fits the line (dresses for womenswear, jumpsuits and overalls for either). The prompt prefers separates, with no cap.
- [x] Hairstyle: built from the Style Icon's name alone, never from Qloo's image of them. The cut must be achievable from the user's current hair (shorter or restyled, without adding much length or changing the texture), in the user's own hair colour. When the model doesn't know the signature cut, it sets the unknown-cut flag, bases the cut on the Outfit and Photo Style, and `why` doesn't claim it's the Style Icon's cut.
- [x] Tests run the adapter against a mocked model, never Gemini, and cover mapping responses, blocks and errors to the interface's outcomes.
- [ ] A manual smoke run against real Gemini happens only with the user's go-ahead, since it costs money, and only after ticket 04 is done.

## Comments

Implemented, except the smoke run, which waits for the user's go-ahead. Decisions made along the way that later tickets should know:

- **The adapter.** `GeminiAiProvider` in `src/server/ai/gemini.ts` holds both prompts and is the only code that imports `ai@7.0.140` or `@ai-sdk/google@4.0.95`, which are pinned like every other dependency. The model names live in `src/config/ai.ts`.
  - Each operation is one `generateText` call with `Output.object`, so Gemini answers in structured output. The photo goes as a file part made from its bytes, which the Google provider sends as `inlineData`, and a test checks that.
  - Each call keeps the AI SDK's default of 2 retries.
- **The switch.** `AI_PROVIDER=gemini` turns Gemini on, through `aiFromEnvironment()` in `src/server/ai/environment.ts`, which `services.ts` now calls. Unset or `fake`, the fake adapter runs, even with `GEMINI_API_KEY` set. Any other value is refused, and so is `gemini` without a key. The fake-scenario cookie only ever swaps a fake adapter, so it can't override Gemini.
- **The photo check.**
  - The model isn't told which Photo Type was chosen, so it can't lean towards it. Our code judges the report against the Photo Type, as before.
  - The Photo Style comes back as a list of 1–2 words. A word repeated is kept once.
  - Either kind of block is `{ blocked: true }`: Google blocking the request (`promptFeedback.blockReason`), or stopping the reply part-way for safety (any finish the AI SDK maps to `content-filter`). That also takes in `RECITATION`, which shouldn't happen for this reply; if it did, the photo would read as not appropriate.
  - A reply that isn't a report, or an error that outlasts the retries, throws, which is the "check errored" outcome.
- **Tailoring.**
  - The reply comes back as it came: the parsed JSON when it's JSON, whether or not it fits the schema, otherwise its text. A blocked request comes back as `null`, so it's asked again once and then skipped, never retried as a step.
  - An error that outlasts the retries throws. One Gemini will refuse again (a 4xx other than 429, such as a bad request or key) throws `UnretryableAiError`, a new provider-neutral error in `provider.ts`. `workflow-steps.ts` turns it into a `FatalError`, as it does for Qloo's 4xx errors.
- **No photo in errors.** Every error the adapter throws carries only the AI SDK's message. The AI SDK's own errors hold the request body, photo included, and the Workflow would store them with the step. Tests check that a thrown error holds no part of the photo.
- **Previews (ticket 35).** `renderPreview` throws until ticket 35 builds it. So with Gemini switched on, every Preview fails after the Workflow's retries and shows the placeholder, rather than a fake Preview. Ticket 35 can reuse the test file's fake Gemini API (`FakeGemini` and its response helpers in `gemini.test.ts`), `withoutRequest` for errors, and `UnretryableAiError`.
- **Tests.** `src/server/ai/gemini.test.ts` runs the adapter against a fake Gemini HTTP API, passed in as the Google provider's `fetch`. The tests never call Gemini, and they cover Gemini's real request and response shapes, blocks included. The tests don't check the prompts' wording, only that each request carries the Outfit's line, the Style Icon, the Brands and the photo.
- **Smoke run.** Not done: it costs money and needs the user's go-ahead. Ticket 04's set-up is done, though its rate limits aren't copied in yet. To run it, set `AI_PROVIDER=gemini` in `.env.local` (with `GEMINI_API_KEY`, already there), run `npm run dev`, and start a Consultation with each Photo Type. Previews will show their placeholder until ticket 35.
