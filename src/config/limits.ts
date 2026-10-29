// Usage limits. Every number lives here so it can change without hunting through code.

/**
 * What a usage record counts: an Outfit switched in for the user to see, a photo checked, or a
 * search a Styling made in the product search.
 */
export const USAGE_KINDS = ["outfit", "photo_check", "product_search"] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

/**
 * What a user's own usage records count. A product search's record holds no user: only the
 * product-search backstop counts it.
 */
export type UserUsageKind = Exclude<UsageKind, "product_search">;

/** The limits count usage over the last this many hours: a rolling window, not a calendar day. */
export const USAGE_WINDOW_HOURS = 24;

/** The Outfit Allowance: how many Outfits a user may have made in the window. */
export const OUTFIT_ALLOWANCE = 10;

/** How many photos a user may have checked in the window, accepted or rejected. */
export const PHOTO_CHECK_LIMIT = 20;

/** How many of each kind of usage a user may have in the window. */
export const USAGE_LIMITS: Record<UserUsageKind, number> = { outfit: OUTFIT_ALLOWANCE, photo_check: PHOTO_CHECK_LIMIT };

/**
 * Usage records are purged once they're this many days old: older than the longest calendar month,
 * so the monthly cap still counts them. The Privacy Policy promises it.
 */
export const USAGE_RECORD_LIFETIME_DAYS = 35;

// The Guest Page's daily limit. A Guest has no Outfit Allowance, so each internet address is held to
// these instead, over the same rolling window, counted by a salted hash of the address.

/** What a guest usage record counts: a Guest Consultation, once its first Outfit is shown, or a photo checked. */
export const GUEST_USAGE_KINDS = ["guest_consultation", "photo_check"] as const;
export type GuestUsageKind = (typeof GUEST_USAGE_KINDS)[number];

/** How many Guest Consultations an internet address may have in the window. */
export const GUEST_CONSULTATIONS_PER_ADDRESS = 1;

/** How many photos an internet address may have had checked on the Guest Page in the window, accepted or rejected. */
export const GUEST_PHOTO_CHECK_LIMIT = 5;

/** How many of each kind of guest usage an internet address may have in the window. */
export const GUEST_USAGE_LIMITS: Record<GuestUsageKind, number> = {
  guest_consultation: GUEST_CONSULTATIONS_PER_ADDRESS,
  photo_check: GUEST_PHOTO_CHECK_LIMIT,
};

/**
 * Guest usage records, with the IP hash they hold, are purged once they're this many hours old: as
 * soon as the window no longer counts them. ADR-0013 keeps an IP hash no longer than this.
 */
export const GUEST_USAGE_RECORD_LIFETIME_HOURS = USAGE_WINDOW_HOURS;

// The app-wide caps, so the public demo can't run up costs whatever individual users do. They count
// every user's Outfits together, from the same usage records.

/** The spec's 24-hour cap: how many Outfits every user together may have made in the window. */
export const APP_WIDE_24_HOUR_CAP = 100;

/** The monthly cap: how many Outfits every user together may have made in a UTC calendar month. */
export const APP_WIDE_MONTHLY_CAP = 750;

/** The Qloo backstop: no new Styling starts while Qloo's last reported calls left this month are below this. */
export const QLOO_BACKSTOP_CALLS = 1000;

/**
 * The product-search backstop: no new Styling starts while this UTC calendar month's product searches
 * leave less than one Styling's searches (EVERYONES_STYLING_LIMITS' productSearches) below this.
 * Each search costs a credit.
 */
export const PRODUCT_SEARCH_BACKSTOP_SEARCHES = 5000;
