// The AI provider's settings. Every model name lives here so it can change without hunting through code.

/**
 * The Claude models the app can run on. Claude Haiku 5.5 runs the photo check. Claude Sonnet 5.5 runs
 * the Stylist, which the Haiku check (`npm run check:stylist`) found Haiku fell short at, and judges
 * each Preview.
 */
export const CLAUDE_MODELS = {
  haiku55: "claude-haiku-5-5",
  sonnet55: "claude-sonnet-5-5",
} as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[keyof typeof CLAUDE_MODELS];

/** The Claude model that checks each photo and reads its Photo Style (ADR-0011). */
export const CLAUDE_PHOTO_CHECK_MODEL: ClaudeModel = CLAUDE_MODELS.haiku55;

/** How hard Claude works at each photo check: enough to judge the photo, while it stays quick. */
export const CLAUDE_PHOTO_CHECK_EFFORT = "medium";

/**
 * The Claude model the Stylist runs on (ADR-0011), one of CLAUDE_MODELS. Its prompt cache is the
 * model's own, so changing it part-way through a Styling would miss the cache.
 */
export const CLAUDE_STYLIST_MODEL: ClaudeModel = CLAUDE_MODELS.sonnet55;

/** How hard Claude works at each of the Stylist's turns, as it judges what suits the photo. */
export const CLAUDE_STYLIST_EFFORT = "medium";

/**
 * The most Claude writes in one of the Stylist's turns, thinking included: far more than a note and
 * a few tool calls need, while each turn, one durable step, stays well inside a function's time.
 */
export const CLAUDE_STYLIST_MAX_OUTPUT_TOKENS = 16_000;

/**
 * The Claude model that judges each Preview, in a call of its own (ADR-0012). Claude Haiku 5.5 missed
 * a face added to a Body-Only Photo's Preview, a hard rule, which Claude Sonnet 5.5 caught.
 */
export const CLAUDE_PREVIEW_VERDICT_MODEL: ClaudeModel = CLAUDE_MODELS.sonnet55;

/** How hard Claude works at each Preview's verdict: the effort that caught the added face. */
export const CLAUDE_PREVIEW_VERDICT_EFFORT = "medium";

/**
 * The most pixels on its long side a seller's photo is sent to Claude at: one larger is scaled down
 * to fit, keeping its proportions. The image model still gets each seller's photo as it was fetched.
 */
export const CLAUDE_SELLER_PHOTO_MAX_LONG_SIDE_PX = 768;

/**
 * The most pixels on its long side a Preview is sent to Claude at: one larger is scaled down to fit,
 * keeping its proportions. Users still see each Preview as the image model drew it.
 */
export const CLAUDE_PREVIEW_MAX_LONG_SIDE_PX = 1024;

/**
 * One of a Claude model's rate cards, in US dollars per million tokens: for a prompt of up to
 * `upToPromptTokens`, every input token counted, cached or not, or of any length when it has none.
 */
export interface ClaudeRateCard {
  upToPromptTokens?: number;
  input: number;
  /** Writing the prompt cache, which the Stylist caches for 5 minutes. */
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

/**
 * What each Claude model costs, as Anthropic priced it on 2026-10-06: a prompt is priced on the first
 * of its model's rate cards that covers its length. The Haiku check reports the Stylist's cost from
 * them, so a model the Stylist may run on has its prices here.
 */
export const CLAUDE_PRICES: Record<ClaudeModel, readonly ClaudeRateCard[]> = {
  [CLAUDE_MODELS.haiku55]: [
    { upToPromptTokens: 100_000, input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 },
    { input: 0.5, cacheWrite: 0.625, cacheRead: 0.05, output: 2.5 },
  ],
  [CLAUDE_MODELS.sonnet55]: [{ input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 }],
};

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
export type GeminiPreviewModel = (typeof GEMINI_PREVIEW_MODELS)[keyof typeof GEMINI_PREVIEW_MODELS];

/** The Gemini image model that renders each Preview, one of GEMINI_PREVIEW_MODELS. */
export const GEMINI_PREVIEW_MODEL: GeminiPreviewModel = GEMINI_PREVIEW_MODELS.nanoBanana21;

/** What one Preview costs on each image model, in US dollars, as the Preview bake-off measured it. */
export const GEMINI_PREVIEW_PRICES_USD: Record<GeminiPreviewModel, number> = {
  [GEMINI_PREVIEW_MODELS.nanoBanana21]: 0.0376,
  [GEMINI_PREVIEW_MODELS.nanoBanana2Lite]: 0.0342,
};
