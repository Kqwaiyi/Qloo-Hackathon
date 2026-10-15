# 34: Gemini adapter: photo check and tailoring

**What to build:** The real AI provider behind our interface for checking photos and tailoring Pieces, running on Gemini through the Vercel AI SDK. It stays off unless explicitly switched on, so the fake adapter remains the default in development and tests. The prompts carry the AI contract's rules: report only what's visible, never guess age or sensitive traits, and tailor generic, plausible Pieces with respectful "why" lines.

**Blocked by:** [07 Photo check rejections and the one-tap Photo Type switch](07-photo-check-rejections.md), [16 One-Piece Outfits](16-one-piece-outfits.md)

**Status:** ready-for-agent

**Spec:** [spec.md](../spec.md) sections "AI provider interface" (1. Check a photo; 2. Tailor one Outfit's Pieces; Gemini adapter) and "Testing Decisions" (Live checks). Stories 85 and 96–99. [ADR-0001](../../../docs/adr/0001-qloo-selects-ai-concretizes.md), [ADR-0003](../../../docs/adr/0003-ai-may-merge-top-and-bottom.md), [ADR-0005](../../../docs/adr/0005-photos-edited-never-analysed.md).

- [ ] The adapter implements the interface's photo-check and tailoring operations with the AI SDK (`ai@7`, `@ai-sdk/google@4`), which appears nowhere else in the code. It owns its prompts.
- [ ] Both operations use `gemini-3.5-flash-lite`, named in config. Images are always sent inline, never through the Files API.
- [ ] It runs only when explicitly switched on by configuration.
- [ ] The photo-check prompt asks only for what the interface returns. It may name hijabs, turbans and caps as examples of covered hair, but only yes or no comes back. No age guessing, and no inference of ethnicity, skin tone, body measurements or health. A plain photo reads as casual.
- [ ] Google blocking the photo maps to "not appropriate". The check relies on the AI SDK's own retries, and an error that remains is the "check errored" outcome.
- [ ] The tailoring prompt sets the rules: generic items, never product or model names; never a price; only an item the Brand plausibly makes; the Top is one garment, the main visible upper layer. `why` is in English and second person, about 20 words; it may mention the garment, the Style Icon, the Photo Style, the user's hair and what they're already wearing, and never body size or shape, weight, skin colour, ethnicity, gender or age.
- [ ] One-Piece: only on the Top Brand, only when that Brand plausibly makes one and it fits the line (dresses for womenswear, jumpsuits and overalls for either). The prompt prefers separates, with no cap.
- [ ] Hairstyle: built from the Style Icon's name alone, never from Qloo's image of them. The cut must be achievable from the user's current hair (shorter or restyled, without adding much length or changing the texture), in the user's own hair colour. When the model doesn't know the signature cut, it sets the unknown-cut flag, bases the cut on the Outfit and Photo Style, and `why` doesn't claim it's the Style Icon's cut.
- [ ] Tests run the adapter against a mocked model, never Gemini, and cover mapping responses, blocks and errors to the interface's outcomes.
- [ ] A manual smoke run against real Gemini happens only with the user's go-ahead, since it costs money, and only after ticket 04 is done.
