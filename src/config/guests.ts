// The Guest Page's rules. Every number lives here so it can change without hunting through code.

/**
 * The guest cookie, which lets a Guest come back to their Guest Consultation: signed, HTTP-only,
 * holding the guest user's id, and valid for this long from "Get my Outfits".
 */
export const GUEST_COOKIE_NAME = "guest";
export const GUEST_COOKIE_MAX_AGE_SECONDS = 60 * 60;

/**
 * Where a guest user's placeholder email and username are: `.invalid` is reserved (RFC 2606), so
 * nothing is ever mailed there, and no account's username can have an "@" in it.
 */
export const GUEST_EMAIL_DOMAIN = "guest.invalid";
