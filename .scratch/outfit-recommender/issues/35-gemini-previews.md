# 35: Gemini adapter: Previews

**What to build:** Real Previews from Gemini's image model that change only the Outfit's Pieces and keep everything else about the person and the photo. A refusal is final and recorded with its reason; temporary errors are left to the Workflow step's retries.

**Blocked by:** [12 Previews of the user wearing each Outfit](12-previews.md), [34 Gemini adapter: photo check and tailoring](34-gemini-check-tailoring.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (3. Render one Preview; Gemini adapter: Models) and "Further Notes" (Untested), and the request settings recorded by the harness on the `prototype/preview-bakeoff` branch. Stories 100–102.

- [ ] Previews use `gemini-nano-banana-2.1` with `responseModalities: ["IMAGE"]`, thinking level `minimal` set explicitly, and no `imageConfig`, so the output keeps the photo's aspect ratio at about 1K. `gemini-3.1-flash-lite-image` is a config-only fallback.
- [ ] The adapter sets `maxRetries: 0`, so a refusal is final. It maps refusals to their reason category (a block reason, an image-safety finish reason, or text with no image) and throws transient errors.
- [ ] The prompt changes only the Pieces and keeps everything else: face and identity; body shape and size, with no slimming or beautifying; skin tone, pose and background; framing and aspect ratio; and glasses, jewellery, bags and head coverings, never removing a head covering. It never receives the Style Icon's name or image.
- [ ] A Face Photo Preview changes only the hair. A Body-Only Preview keeps a visible face unchanged and never invents one.
- [ ] Tests use a mocked model and cover an image, each refusal category, and a transient error.
- [ ] A manual smoke run, including phone photos, happens only with the user's go-ahead.
