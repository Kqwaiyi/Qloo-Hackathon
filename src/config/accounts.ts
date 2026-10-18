// Account rules. Every number lives here so it can change without hunting through code.

import { AUTH_ENDPOINTS } from "@/config/routes";

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

/**
 * Better Auth's rate limit on sign-ins, per IP address, counted apart for sign-in by email and by
 * username. It's Better Auth's own default for sign-in: 3 tries in 10 seconds.
 */
export const SIGN_IN_RATE_LIMIT = { window: 10, max: 3 } as const;

/**
 * Better Auth's rate limit on account deletions, per IP address. Each try checks a password, so it's
 * as tight as Better Auth's own limit on password changes: 3 tries in 10 seconds.
 */
export const DELETE_ACCOUNT_RATE_LIMIT = { window: 10, max: 3 } as const;

/**
 * The Better Auth endpoints the Bot Check (Cloudflare Turnstile) guards, for our forms and direct
 * posts alike. A call with no request headers, such as a team script's, skips it, and so, for now,
 * does signing in to the Demo Account.
 */
export const BOT_CHECK_ENDPOINTS: readonly string[] = [
  AUTH_ENDPOINTS.signUp,
  AUTH_ENDPOINTS.signInEmail,
  AUTH_ENDPOINTS.signInUsername,
  AUTH_ENDPOINTS.requestPasswordReset,
];

/** How long the Bot Check waits for Cloudflare before letting the request go on anyway. */
export const BOT_CHECK_TIMEOUT_MS = 5_000;

/** A verification link works for this long. */
export const VERIFICATION_LINK_LIFETIME_SECONDS = 24 * 60 * 60;

/**
 * A verified user's email change waits on two links in turn: the old address's approval, then the
 * new address's link. Each works as long as a verification link.
 */
export const EMAIL_CHANGE_STEPS = ["approval", "verification"] as const;
export type EmailChangeStep = (typeof EMAIL_CHANGE_STEPS)[number];

/**
 * The photo notice's version: what the consent sheet says happens to a user's photos, including the
 * COPY lines it shows. Raise it whenever that wording changes, so every user sees the sheet again
 * before their next Consultation.
 */
export const PHOTO_NOTICE_VERSION = 1;

/**
 * The Demo Account, the single shared account the judges use, is named by its email: the team
 * address's `+demo` plus-address, so its password resets reach the team. The team address itself
 * is GMAIL_USER, which stays in the environment.
 */
const DEMO_ACCOUNT_PLUS_TAG = "demo";

/** The Demo Account's email, given the team's address: "team@gmail.com" makes "team+demo@gmail.com". */
export function demoAccountEmailOf(teamEmail: string): string {
  const at = teamEmail.lastIndexOf("@");
  return `${teamEmail.slice(0, at)}+${DEMO_ACCOUNT_PLUS_TAG}@${teamEmail.slice(at + 1)}`.toLowerCase();
}

/**
 * What the team's script creates the Demo Account with. Judges may change its Style Preference,
 * Country and date of birth in Settings; the rest is managed by the team.
 */
export const DEMO_ACCOUNT_PROFILE = { username: "demo", stylePreference: "no_preference", countryCode: "US" } as const;

/** In the 25–29 age group, as sign-up takes it. Only the year and month are kept. */
export const DEMO_ACCOUNT_BIRTH_DATE = "2000-01-01";

/** A password reset link works for this long. */
export const PASSWORD_RESET_LINK_LIFETIME_SECONDS = 60 * 60;

/** An account still unverified this many days after sign-up is deleted. */
export const UNVERIFIED_ACCOUNT_LIFETIME_DAYS = 7;

/**
 * An account with no activity for this many months is deleted with everything in it, once a
 * warning email has given this many days' notice. The Privacy Policy promises both.
 */
export const INACTIVE_ACCOUNT_LIFETIME_MONTHS = 12;
export const INACTIVITY_WARNING_NOTICE_DAYS = 30;

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
