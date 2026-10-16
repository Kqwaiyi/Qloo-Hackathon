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

/** A Styling makes up to this many Outfits, one per top unused Style Icon. */
export const OUTFITS_PER_STYLING = 2;

/** How often a page waiting on a Styling asks for its status. */
export const STYLING_STATUS_POLL_INTERVAL_MS = 1000;

/** The AI gets this many tries at an Outfit's Pieces: bad output is retried once, then tailoring has failed. */
export const TAILORING_ATTEMPTS = 2;

/**
 * A Style Icon whose tailoring failed is skipped for the next unused one, at most this many times
 * per Styling, so a broken model can't burn through the Style Icons.
 */
export const MAX_TAILORING_SUBSTITUTES = 2;
