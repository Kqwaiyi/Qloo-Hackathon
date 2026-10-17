// Account rules. Every number lives here so it can change without hunting through code.

export const STYLE_PREFERENCES = ["menswear", "womenswear", "no_preference"] as const;
export type StylePreference = (typeof STYLE_PREFERENCES)[number];

export function isStylePreference(value: string): value is StylePreference {
  return (STYLE_PREFERENCES as readonly string[]).includes(value);
}

export const STYLE_PREFERENCE_LABELS: Record<StylePreference, string> = {
  menswear: "Menswear",
  womenswear: "Womenswear",
  no_preference: "No preference",
};

/**
 * An Outfit's line: menswear or womenswear. A menswear or womenswear user's Outfits are all in that
 * line; a no-preference user's alternate, womenswear first.
 */
export const LINES = ["womenswear", "menswear"] as const;
export type Line = (typeof LINES)[number];

/** Outfit Recommender is for adults only (ADR-0004). */
export const MINIMUM_AGE = 18;

/** An under-18 date of birth blocks sign-up from that browser for this long. */
export const AGE_GATE_COOKIE_NAME = "age_gate";
export const AGE_GATE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Better Auth's rate limit on sign-ups, per IP address. */
export const SIGN_UP_RATE_LIMIT = { window: 60 * 60, max: 3 } as const;

/** A verification link works for this long. */
export const VERIFICATION_LINK_LIFETIME_SECONDS = 24 * 60 * 60;

/** A password reset link works for this long. */
export const PASSWORD_RESET_LINK_LIFETIME_SECONDS = 60 * 60;

/** An account still unverified this many days after sign-up is deleted. */
export const UNVERIFIED_ACCOUNT_LIFETIME_DAYS = 7;

/** Sessions last 30 days and roll forward, refreshed at most once a day. */
export const SESSION_EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

/** Better Auth's defaults, stated here so the forms can say the same thing. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Any 8–128 characters: no composition rules and no breached-password check. */
export function isAllowedPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

export function isWellFormedUsername(username: string): boolean {
  return username.length >= USERNAME_MIN_LENGTH && username.length <= USERNAME_MAX_LENGTH && USERNAME_PATTERN.test(username);
}
