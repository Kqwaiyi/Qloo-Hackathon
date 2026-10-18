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

/**
 * Usage records are purged once they're this many days old: older than the longest calendar month,
 * so the monthly cap still counts them. The Privacy Policy promises it.
 */
export const USAGE_RECORD_LIFETIME_DAYS = 35;

// The app-wide caps, so the public demo can't run up costs whatever individual users do. They count
// every user's Outfits together, from the same usage records.

/** The spec's 24-hour cap: how many Outfits every user together may have made in the window. */
export const APP_WIDE_24_HOUR_CAP = 100;

/** The monthly cap: how many Outfits every user together may have made in a UTC calendar month. */
export const APP_WIDE_MONTHLY_CAP = 750;

/** The Qloo backstop: no new Styling starts while Qloo's last reported calls left this month are below this. */
export const QLOO_BACKSTOP_CALLS = 1000;
