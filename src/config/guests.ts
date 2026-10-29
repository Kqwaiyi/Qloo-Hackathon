// The Guest Page's rules. Every number lives here so it can change without hunting through code.

/**
 * How long a Guest Consultation is kept (ADR-0013): the guest cleanup deletes it, with its guest
 * user, photo and Previews, once it's this old, unless its Styling is running.
 */
export const GUEST_CONSULTATION_LIFETIME_SECONDS = 60 * 60;

/**
 * The guest cookie, which lets a Guest come back to their Guest Consultation: signed, HTTP-only,
 * holding the guest user's id, and valid for as long as the Guest Consultation is kept from "Get my
 * Outfits".
 */
export const GUEST_COOKIE_NAME = "guest";
export const GUEST_COOKIE_VALID_SECONDS = GUEST_CONSULTATION_LIFETIME_SECONDS;

/**
 * How long the browser keeps the guest cookie: a day, outliving its hour, so a Guest who comes back
 * is told their Guest Consultation has been deleted, after which the Guest Page clears it.
 */
export const GUEST_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Where a guest user's placeholder email and username are: `.invalid` is reserved (RFC 2606), so
 * nothing is ever mailed there, and no account's username can have an "@" in it.
 */
export const GUEST_EMAIL_DOMAIN = "guest.invalid";

/** A guest user's placeholder email and username. */
export function guestPlaceholderAddress(guestUserId: string): string {
  return `${guestUserId}@${GUEST_EMAIL_DOMAIN}`;
}

/** Whether an address is a guest user's placeholder, at the guest domain, ignoring case: one that's never mailed. */
export function isGuestPlaceholderAddress(address: string): boolean {
  return address.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}
