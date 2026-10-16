// Styling rules and vocabulary. Every number lives here so it can change without hunting through code.

/** What a Styling is for: a new Consultation's first, a "see more", a re-styling, or a try again. */
export const STYLING_KINDS = ["first", "more", "budget_tier_change", "photo_style_change", "try_again"] as const;
export type StylingKind = (typeof STYLING_KINDS)[number];

export const STYLING_STATUSES = ["running", "succeeded", "failed"] as const;
export type StylingStatus = (typeof STYLING_STATUSES)[number];

/** The stages a Styling moves through, in order. It finishes after the last one it needs. */
export const STYLING_STAGES = ["style_icons", "brands", "building_outfits", "previews"] as const;
export type StylingStage = (typeof STYLING_STAGES)[number];

/** Why a Styling that made no Outfit failed. */
export const STYLING_FAILURE_REASONS = ["nothing_built", "something_broke"] as const;
export type StylingFailureReason = (typeof STYLING_FAILURE_REASONS)[number];

/** Whether a ranked Style Icon has inspired an Outfit yet, or was passed over. */
export const STYLE_ICON_STATUSES = ["unused", "used", "skipped"] as const;
export type StyleIconStatus = (typeof STYLE_ICON_STATUSES)[number];

/**
 * Where an Outfit's Preview is: still to render, ready, refused by the image model, or failed. A
 * Preview not ready when its Styling finishes is marked failed.
 */
export const PREVIEW_STATES = ["pending", "ready", "refused", "failed"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

/**
 * Why the image model refused a Preview: it blocked the request, stopped for image safety, or
 * answered in text with no image.
 */
export const PREVIEW_REFUSAL_REASONS = ["blocked", "image_safety", "no_image"] as const;
export type PreviewRefusalReason = (typeof PREVIEW_REFUSAL_REASONS)[number];

/** A Styling renders this many Previews at once, each its own step. */
export const PREVIEWS_AT_ONCE = 2;

/** A Styling makes up to this many Outfits, one per top unused Style Icon. */
export const OUTFITS_PER_STYLING = 2;

/**
 * A body photo's first Styling fetches the Brands of this many Style Icons at once before its
 * first Outfits, one spare in case a Style Icon can't complete an Outfit. Later fetches, and other
 * kinds of Styling, fetch as needed.
 */
export const BRAND_FETCHES_UP_FRONT = 3;

/** A Styling fetches Brands for at most this many Style Icons, so Style Icons whose Brands don't fit can't use up Qloo's calls. */
export const MAX_BRAND_FETCHES_PER_STYLING = 6;

/** A Styling never has more Qloo calls than this waiting at once. There's no shared rate limiter. */
export const QLOO_CALLS_AT_ONCE = 3;

/** How often a page waiting on a Styling asks for its status. */
export const STYLING_STATUS_POLL_INTERVAL_MS = 1000;

/** A step of the Styling checklist that has run longer than this says it's taking longer than usual. */
export const SLOW_STEP_MS = 60_000;

/** The AI gets this many tries at an Outfit's Pieces: bad output is retried once, then tailoring has failed. */
export const TAILORING_ATTEMPTS = 2;

/**
 * A Style Icon whose tailoring failed is skipped for the next unused one, at most this many times
 * per Styling, so a broken model can't burn through the Style Icons.
 */
export const MAX_TAILORING_SUBSTITUTES = 2;
