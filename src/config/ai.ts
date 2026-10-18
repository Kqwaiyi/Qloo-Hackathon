// The AI provider's settings. Every model name lives here so it can change without hunting through code.

/** The Gemini model that checks each photo and reads its Photo Style. */
export const GEMINI_PHOTO_CHECK_MODEL = "gemini-3.5-flash-lite";

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
