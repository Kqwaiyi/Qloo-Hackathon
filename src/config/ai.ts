// The AI provider's settings. Every model name lives here so it can change without hunting through code.

/** The Claude model that checks each photo and reads its Photo Style (ADR-0011). */
export const CLAUDE_PHOTO_CHECK_MODEL = "claude-haiku-5-5";

/** How hard Claude works at each photo check: enough to judge the photo, while it stays quick. */
export const CLAUDE_PHOTO_CHECK_EFFORT = "medium";

/**
 * The Claude model the Stylist runs on (ADR-0011). Its prompt cache is the model's own, so changing
 * it part-way through a Styling would miss the cache.
 */
export const CLAUDE_STYLIST_MODEL = "claude-haiku-5-5";

/** How hard Claude works at each of the Stylist's turns: it judges what suits the photo. */
export const CLAUDE_STYLIST_EFFORT = "high";

/**
 * The most Claude writes in one of the Stylist's turns, thinking included: far more than a note and
 * a few tool calls need, while each turn, one durable step, stays well inside a function's time.
 */
export const CLAUDE_STYLIST_MAX_OUTPUT_TOKENS = 16_000;

/** The Gemini model that tailors each Outfit's Pieces. */
export const GEMINI_TAILORING_MODEL = "gemini-3.5-flash-lite";

/**
 * The Gemini image models that can render Previews. Nano Banana 2.1 is the Preview bake-off's pick.
 * Nano Banana 2 Lite is the fallback, if 2.1 is ever unavailable: about 10% cheaper and over 3
 * times as fast, but in the bake-off it invented a face on a Body-Only Photo with no face in it,
 * filled in a receding hairline, changed poses and added accessories. Nothing falls back on its
 * own: switching is a change to GEMINI_PREVIEW_MODEL.
 */
export const GEMINI_PREVIEW_MODELS = {
  nanoBanana21: "gemini-nano-banana-2.1",
  nanoBanana2Lite: "gemini-3.1-flash-lite-image",
} as const;
type GeminiPreviewModel = (typeof GEMINI_PREVIEW_MODELS)[keyof typeof GEMINI_PREVIEW_MODELS];

/** The Gemini image model that renders each Preview, one of GEMINI_PREVIEW_MODELS. */
export const GEMINI_PREVIEW_MODEL: GeminiPreviewModel = GEMINI_PREVIEW_MODELS.nanoBanana21;
