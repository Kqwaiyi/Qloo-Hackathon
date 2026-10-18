// Email rules. Every email goes through one send function (src/server/email/send-email.ts), which
// enforces every cap below so that Gmail never blocks the team account (it allows about 500 a day).

/** Who every email comes from. */
export const EMAIL_FROM_NAME = "Outfit Recommender";

/**
 * Each kind of email the app sends, as the email log records it. "verification" is the link sent
 * at sign-up; a link asked for again is a "verification-resend". "email-change" is the one email
 * every email change starts with: an unverified user's link to the new address, or a verified
 * user's approval request to the old one. Once approved, the new address gets an
 * "email-change-verification".
 */
export const EMAIL_KINDS = [
  "verification",
  "verification-resend",
  "email-change",
  "email-change-verification",
  "password-reset",
  "password-changed",
  "inactivity-warning",
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/** The caps count the emails sent in the last this many hours. */
export const EMAIL_CAP_WINDOW_HOURS = 24;

/** The email log's rows are purged once they're this many days old. The Privacy Policy promises it. */
export const EMAIL_LOG_LIFETIME_DAYS = 35;

/** No email of any kind goes out once this many went out in the window. */
export const ALL_EMAILS_CAP = 450;

/** New sign-ups, and their verification emails, stop once this many emails went out in the window. */
export const SIGN_UP_EMAILS_CAP = 300;

/** At most this many inactivity warnings go out in the window. */
export const INACTIVITY_WARNINGS_CAP = 50;

/**
 * Per account, at most this many of each kind go out in the window. "email-change" caps the email
 * changes themselves, verified or not. Opening an approval link again sends the new address
 * another link, so those have a cap of their own.
 */
export const PER_ACCOUNT_EMAIL_CAPS: Partial<Record<EmailKind, number>> = {
  "verification-resend": 5,
  "password-reset": 3,
  "email-change": 3,
  "email-change-verification": 3,
};
