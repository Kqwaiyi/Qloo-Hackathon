# Which Google models fit Previews and photo checks?

Type: research
Status: resolved
Map: [Outfit Recommender](../map.md)

## Question

Which Google models and API should the first AI provider use? Documentation only: **no Gemini API calls** (they cost real money).

1. **Preview model:** compare the current Google image models (for example Gemini 2.5 Flash Image, Gemini 3 Pro Image, Imagen) on: editing a supplied photo while keeping the person recognisable; changing hairstyle, top, bottom and shoes together in one image; price per image; latency; rate limits per tier; input image size and format limits; output resolution. Recommend the cheapest one that's good enough.
2. **Policy:** Google's rules on generating or editing images of real people and of minors, safety filters or person-generation settings that could block a Preview, and what a refusal looks like in the API response.
3. **Text and vision model** for the photo check and Piece tailoring (for example Gemini Flash or Flash-Lite): structured JSON output, price, latency.
4. **Data use:** does Google train on or retain inputs on the free vs paid tier? We send face photos.
5. **Swappable provider:** does a library such as the Vercel AI SDK support Gemini image editing and structured output, so changing provider later is cheap?

## Answer

- **Minimum age conflict:** Google's terms don't allow a 13+ app. Both the Gemini API terms and the Google Cloud (Vertex) terms forbid use in an app "directed towards or is likely to be accessed by individuals under the age of 18". The options are to age-gate the app to 18+, or to send under-18 users to a different provider. This reopens the 13+ minimum age; see "What consent, retention and minimum age do we commit to?".
- **Preview model:** `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite) costs $0.0336 per 1K output image plus $0.25 per million input tokens, with Google targeting under 2 s per image. It only outputs 1K, which is enough for a phone. It is weaker at changing several items in one edit, so the fallback is `gemini-nano-banana-2.1`, the same per-image price at about $0.005 more per Preview. This needs a real-photo comparison before committing. Imagen has been shut down; the other Google image models are deprecated, closed to new users, or 2–4x the price.
- **Text and vision model:** `gemini-3.5-flash-lite`, at $0.30 in and $2.50 out per million tokens. It returns structured JSON and has no shutdown date. `gemini-3.1-flash-lite` is slightly cheaper but has an earliest shutdown of 2027-05-07.
- **Cost (estimated, not measured):** about $0.08 per Consultation (2 Previews plus the photo check and tailoring), or about $0.09 with 2.1. Each "see more" adds about $0.07.
- **Policy:**
  - Editing photos of real people is supported, but users must have rights to the photo. Impersonation, sexual content, and using biometrics without legally required consent are prohibited.
  - Vertex documents a filter that blocks photorealistic images of children, so edits of teen photos will likely be refused.
  - A refusal arrives as a normal successful response that carries a block or finish reason, or as text with no image.
- **Data use:** on the free tier, Google trains on inputs and humans may review them, so **use a billing-enabled project only**. On the paid tier, Google doesn't train on inputs but keeps them for 55 days for abuse monitoring. Guaranteed zero retention requires Vertex.
- **Swappable provider:** the Vercel AI SDK (`ai@7`, `@ai-sdk/google@4`) supports Gemini image editing and structured output. Pass the Lite model ID as a plain string, since it isn't in the SDK's model list. Set `maxRetries: 0` for Previews, because some refusals are retried by default.

Findings: branch `research/google-ai-models`, file `.scratch/outfit-recommender-map/research/google-ai-models.md`.
