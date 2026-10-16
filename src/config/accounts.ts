// Account rules. Every number lives here so it can change without hunting through code.

export const STYLE_PREFERENCES = ["menswear", "womenswear", "no_preference"] as const;
export type StylePreference = (typeof STYLE_PREFERENCES)[number];

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

/** Sessions last 30 days and roll forward, refreshed at most once a day. */
export const SESSION_EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

/** Better Auth's defaults, stated here so the forms can say the same thing. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function isWellFormedUsername(username: string): boolean {
  return username.length >= USERNAME_MIN_LENGTH && username.length <= USERNAME_MAX_LENGTH && USERNAME_PATTERN.test(username);
}
