// Usage limits. Every number lives here so it can change without hunting through code.

/** What a usage record counts: an Outfit switched in for the user to see, or a photo checked. */
export const USAGE_KINDS = ["outfit", "photo_check"] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

/** The limits count usage over the last this many hours: a rolling window, not a calendar day. */
export const USAGE_WINDOW_HOURS = 24;

/** The Outfit Allowance: how many Outfits a user may have made in the window. */
export const OUTFIT_ALLOWANCE = 10;

/** How many photos a user may have checked in the window, accepted or rejected. */
export const PHOTO_CHECK_LIMIT = 20;

/** How many of each kind of usage a user may have in the window. */
export const USAGE_LIMITS: Record<UsageKind, number> = { outfit: OUTFIT_ALLOWANCE, photo_check: PHOTO_CHECK_LIMIT };
