# 35: Gemini adapter: Previews

**What to build:** Real Previews from Gemini's image model that change only the Outfit's Pieces and keep everything else about the person and the photo. A refusal is final and recorded with its reason; temporary errors are left to the Workflow step's retries.

**Blocked by:** [12 Previews of the user wearing each Outfit](12-previews.md), [34 Gemini adapter: photo check and tailoring](34-gemini-check-tailoring.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (3. Render one Preview; Gemini adapter: Models) and "Further Notes" (Untested), and the request settings recorded by the harness on the `prototype/preview-bakeoff` branch. Stories 100–102.

- [x] Previews use `gemini-nano-banana-2.1` with `responseModalities: ["IMAGE"]`, thinking level `minimal` set explicitly, and no `imageConfig`, so the output keeps the photo's aspect ratio at about 1K. `gemini-3.1-flash-lite-image` is a config-only fallback.
- [x] The adapter sets `maxRetries: 0`, so a refusal is final. It maps refusals to their reason category (a block reason, an image-safety finish reason, or text with no image) and throws transient errors.
- [x] The prompt changes only the Pieces and keeps everything else: face and identity; body shape and size, with no slimming or beautifying; skin tone, pose and background; framing and aspect ratio; and glasses, jewellery, bags and head coverings, never removing a head covering. It never receives the Style Icon's name or image.
- [x] A Face Photo Preview changes only the hair. A Body-Only Preview keeps a visible face unchanged and never invents one.
- [x] Tests use a mocked model and cover an image, each refusal category, and a transient error.
- [ ] A manual smoke run, including phone photos, happens only with the user's go-ahead.

## Comments

Implemented, except the smoke run, which waits for the user's go-ahead. Decisions made along the way that later tickets should know:

- **The call.** `GeminiAiProvider.renderPreview` (`src/server/ai/gemini.ts`) is one `generateText` call on `GEMINI_PREVIEW_MODEL` with `maxRetries: 0`. It sends what the bake-off harness sent: one user message with the instruction, then the photo inline, and no system instruction. `generationConfig` is exactly `responseModalities: ["IMAGE"]` and `thinkingConfig: { thinkingLevel: "minimal" }`, and a test checks that.
  - The image comes back as Gemini sent it, and the step re-encodes it to WebP as before. An image Gemini drew while thinking is never returned: the AI SDK keeps it out of the reply's files.
- **The fallback.** `src/config/ai.ts` lists both image models in `GEMINI_PREVIEW_MODELS`, and `GEMINI_PREVIEW_MODEL` picks Nano Banana 2.1. Nothing falls back on its own: switching to Nano Banana 2 Lite is a one-line change there. The comment there says what the bake-off saw Lite do wrong.
- **Refusals.** A reply without an image is sorted in this order. None of these was seen for real, since no bake-off call was refused, so the finish reasons come from Google's API reference.
  1. `promptFeedback.blockReason` set: `blocked`.
  2. A finish reason from Google's filters (`IMAGE_SAFETY`, `IMAGE_PROHIBITED_CONTENT`, `IMAGE_RECITATION`, `SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`, `RECITATION`): `image_safety`.
  3. Text, or a finish reason of `NO_IMAGE` or `IMAGE_OTHER`: `no_image`.
  4. Anything else, such as `OTHER`, an empty `STOP` or no candidates at all: not a refusal. It throws a plain error, so the Workflow step retries it. Each retry is billed, but such replies should be rare, and the spec leaves only refusals final.
- **Errors.** A failed call goes through `withoutRequest` like the other operations, so no error carries the photo. With `maxRetries: 0` the AI SDK doesn't retry, so a 429 or 5xx throws after one try, for the step to retry. A 4xx other than 429 is an `UnretryableAiError`, which `workflow-steps.ts` already makes a `FatalError`. The interface's doc for `renderPreview` now says so.
- **The instruction.** `previewInstruction` builds it from the Photo Type and the Pieces' `details`, based on the bake-off's prompt. It lists the Pieces to change, then what to keep: face and identity, body shape and size with no slimming or beautifying, skin tone, pose, background and lighting, framing and aspect ratio, glasses, jewellery, bags, and any head covering, never removed. Then, by case:
  - A Face Photo is told to change only the hair, and to keep everything they're wearing too.
  - With no Hairstyle Piece (covered hair, or a Body-Only Photo), it keeps the hair and anything covering it. With one, it keeps the user's own hair colour.
  - A Body-Only Photo leaves any visible part of the face as it is, and is told never to add a face or head.
  - The wording addresses the image model in plain words ("outfit", "items"), as the bake-off did, not our glossary's terms.
- **The Style Icon's name.** The Preview's input has no Style Icon. The Hairstyle's `details` comes from tailoring, which does know the name, so the tailoring prompt now says `details` never names the Style Icon or anyone else. Only the prompt enforces this: no code check, like the rule against product names.
- **Tests.** The "Previews" tests in `src/server/ai/gemini.test.ts` run against the same fake Gemini API. They cover:
  - an image, and an image drawn while thinking;
  - the model and request settings, and the photo and each Piece's `details` sent;
  - each refusal category, asked only once;
  - replies that aren't refusals;
  - 429 and 5xx errors thrown after one try, carrying nothing of the photo;
  - a 400 as an `UnretryableAiError`.

  As in ticket 34, they don't check the instruction's wording.
- **Smoke run.** Not done: it costs about $0.04 per Preview and needs the user's go-ahead. To run it, set `AI_PROVIDER=gemini` in `.env.local` (with `GEMINI_API_KEY`), run `npm run dev`, and start a Consultation with each Photo Type: a Face Photo, a Full-Body Photo, one with covered hair, and a Body-Only Photo with and without a face. Use phone photos too. Check each Preview against the keep list. A Preview takes about 11 s.
