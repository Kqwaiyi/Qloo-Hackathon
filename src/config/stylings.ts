// Styling rules and vocabulary. Every number lives here so it can change without hunting through code.

/** What a Styling is for: a new Consultation's first, a "see more", a re-styling, or a try again. */
export const STYLING_KINDS = ["first", "more", "budget_tier_change", "photo_style_change", "try_again"] as const;
export type StylingKind = (typeof STYLING_KINDS)[number];

/**
 * Whether a Styling adds to the Consultation's current Outfits, as "Show 2 more Outfits" does: it
 * carries on down their Style Icons, numbers its Outfits after theirs, and keeps them in view while
 * it runs.
 */
export function addsToCurrentOutfits(kind: StylingKind): boolean {
  return kind === "more";
}

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
 * Why a Preview was refused: the image model blocked the request, stopped for image safety, or
 * answered in text with no image; or the Stylist kept neither of its images (`not_kept`), as both
 * broke a hard rule.
 */
export const PREVIEW_REFUSAL_REASONS = ["blocked", "image_safety", "no_image", "not_kept"] as const;
export type PreviewRefusalReason = (typeof PREVIEW_REFUSAL_REASONS)[number];

/** Why the image model refused a Preview, as it says: never `not_kept`, which is the Stylist's. */
export type ImageModelRefusalReason = Exclude<PreviewRefusalReason, "not_kept">;

/**
 * Where an Outfit's one redraw of its Preview is: drawing, drawn, refused by the image model, or
 * failed; then kept, once the Stylist keeps the first image, the redraw or neither. An Outfit never
 * redrawn has none. A redraw not kept by the time its Styling finishes leaves the Outfit with no
 * Preview, as nobody chose which of its images shows the user as they are.
 */
export const PREVIEW_REDRAW_STATES = ["pending", "ready", "refused", "failed", "kept"] as const;
export type PreviewRedrawState = (typeof PREVIEW_REDRAW_STATES)[number];

/** How a redraw came out, as the step that drew it saves it. */
export type PreviewRedrawOutcome = Extract<PreviewRedrawState, "ready" | "refused" | "failed">;

/** Which of a redrawn Preview's images the Stylist keeps: the first, the redraw, or neither. */
export const KEPT_PREVIEWS = ["first", "redraw", "none"] as const;
export type KeptPreview = (typeof KEPT_PREVIEWS)[number];

/** A correction the Stylist sends with a redraw longer than this many characters is refused: it's one sentence. */
export const PREVIEW_CORRECTION_MAX_LENGTH = 300;

/**
 * Where a Piece's search in the product search is: under way, answered (with the Products that
 * qualified, if any), or never answered, still erroring after its retries.
 */
export const PIECE_SEARCH_STATES = ["searching", "answered", "unanswered"] as const;
export type PieceSearchState = (typeof PIECE_SEARCH_STATES)[number];

/** A Styling renders this many Previews at once, each its own step. */
export const PREVIEWS_AT_ONCE = 2;

/**
 * A Preview step that throws is tried again this many times, as the Workflow's default retries it.
 * A Product photo that still can't be fetched on its last try is drawn from its title instead.
 */
export const PREVIEW_STEP_MAX_RETRIES = 3;

/** A Styling makes up to this many Outfits, one per top unused Style Icon. */
export const OUTFITS_PER_STYLING = 2;

/** A Styling fetches Brands for at most this many Style Icons, so Style Icons whose Brands don't fit can't use up Qloo's calls. */
export const MAX_BRAND_FETCHES_PER_STYLING = 6;

/**
 * For each Category, the Stylist chooses among this many of a Style Icon's Brands still in play,
 * best first (ADR-0010): one that drops out of play makes way for the next.
 */
export const TOP_BRANDS_PER_CATEGORY = 3;

/** A Styling never has more Qloo calls than this waiting at once. There's no shared rate limiter. */
export const QLOO_CALLS_AT_ONCE = 3;

/** A Styling never has more product-search calls than this waiting at once, Brand lookups included. */
export const PRODUCT_CALLS_AT_ONCE = 3;

/**
 * A Styling makes at most this many product searches, each counted once however many tries it
 * takes, so one Styling can't run away with the product-search budget. Brand lookups are free, and
 * don't count. Like the cap on Brand fetches, it's the Styling's own, the Demo Account's included.
 */
export const MAX_PRODUCT_SEARCHES_PER_STYLING = 24;

/** How often a page waiting on a Styling asks for its status. */
export const STYLING_STATUS_POLL_INTERVAL_MS = 1000;

/** A step of the Styling checklist that has run longer than this says it's taking longer than usual. */
export const SLOW_STEP_MS = 60_000;

/** The stages the checklist shows as Building Outfits: fetching Brands is part of building the Outfits. */
export const BUILDING_OUTFITS_STAGES: readonly StylingStage[] = ["brands", "building_outfits"];

/** Building Outfits is the Stylist's longest step, so it says it's taking longer than usual only after this long. */
export const SLOW_BUILDING_OUTFITS_MS = 3 * 60_000;

/**
 * What an entry of the Stylist's Notes is: a note the Stylist wrote to the user, or a step our code
 * wrote for one of its tool calls and what came of it.
 */
export const STYLIST_NOTE_KINDS = ["note", "step"] as const;
export type StylistNoteKind = (typeof STYLIST_NOTE_KINDS)[number];

/** A note the Stylist writes longer than this many characters is dropped, as one that's empty or states a price is. */
export const STYLIST_NOTE_MAX_LENGTH = 300;

/**
 * A running Styling whose stage hasn't moved for this long is stuck: whatever next reads its status
 * finishes it, so it can't hold the Styling locks for good.
 */
export const STUCK_STYLING_MS = 10 * 60_000;

/** Whether a running Styling whose stage last moved at `stageMovedAt` is stuck by `now`. */
export function isStuck(stageMovedAt: Date, now: Date): boolean {
  return now.getTime() - stageMovedAt.getTime() >= STUCK_STYLING_MS;
}

/**
 * The Stylist gets at most this many turns, each one call to its model, per Styling, so one
 * Styling's cost is bounded. A Styling that reaches it finishes with the Outfits it saved. A Stylist
 * that keeps getting an Outfit wrong is bounded by its turns.
 */
export const MAX_STYLIST_TURNS = 30;
