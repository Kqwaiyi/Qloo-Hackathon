import type { EmailChangeStep } from "@/config/accounts";

export const ROUTES = {
  home: "/",
  signIn: "/sign-in",
  signUp: "/sign-up",
  forgotPassword: "/forgot-password",
  /** Where a password reset link lands once Better Auth has checked it: the form for the new password. */
  resetPassword: "/reset-password",
  /** Where a verification link lands once Better Auth has checked it: the verification result. */
  verifyEmail: "/verify-email",
  /** Where a verified user's email-change links land: the old address's approval, then the new address's link. */
  emailChange: "/email-change",
  /** The Guest Page: one Guest Consultation, then its results, without an account. */
  guest: "/guest",
  newConsultation: "/consultations/new",
  myConsultations: "/consultations",
  settings: "/settings",
  terms: "/terms",
  privacy: "/privacy",
} as const;

export function consultationRoute(consultationId: string): string {
  return `${ROUTES.myConsultations}/${encodeURIComponent(consultationId)}`;
}

/** How many of the Stylist's Notes a page polling the Styling status has, so it's sent only those after them. */
export const NOTES_AFTER_PARAM = "notesAfter";

/** What a page waiting on a Consultation's Styling polls, having the first `notesAfter` of the Stylist's Notes. */
export function stylingStatusRoute(consultationId: string, notesAfter = 0): string {
  return `/api/consultations/${encodeURIComponent(consultationId)}/styling?${NOTES_AFTER_PARAM}=${notesAfter}`;
}

/** Where a Consultation's page asks for its Products' prices to be refreshed in the background (see PriceRefresh). */
export function priceRefreshRoute(consultationId: string): string {
  return `/api/consultations/${encodeURIComponent(consultationId)}/price-refresh`;
}

/** Where the app pages renew the sign-in in the background (see RenewSignIn). */
export const SIGN_IN_RENEWAL_ROUTE = "/api/sign-in-renewal";

/** Where Better Auth's own endpoints are served. */
export const AUTH_API_PATH = "/api/auth";

/** The Better Auth endpoints our code names, under AUTH_API_PATH. */
export const AUTH_ENDPOINTS = {
  signUp: "/sign-up/email",
  signInEmail: "/sign-in/email",
  signInUsername: "/sign-in/username",
  sendVerificationEmail: "/send-verification-email",
  changeEmail: "/change-email",
  verifyEmail: "/verify-email",
  requestPasswordReset: "/request-password-reset",
  /** Takes the new password. A link opens it as `/reset-password/<token>`, which checks the token first. */
  resetPassword: "/reset-password",
  updateUser: "/update-user",
  changePassword: "/change-password",
  /** Ends every session of the signed-in user, this one included. */
  revokeSessions: "/revoke-sessions",
  /** Ends every session of the signed-in user but this one. */
  revokeOtherSessions: "/revoke-other-sessions",
  /** Ends one session of the signed-in user, given its token. */
  revokeSession: "/revoke-session",
  /** Deletes the signed-in user's account, given their password. */
  deleteUser: "/delete-user",
} as const;

/** Where a signed-in user lands. */
export const APP_HOME = ROUTES.newConsultation;

/** Where a verification link lands once it has worked: New Consultation, saying "Email verified". */
export const EMAIL_VERIFIED_PARAM = "email-verified";
export const EMAIL_VERIFIED_ROUTE = `${ROUTES.newConsultation}?${EMAIL_VERIFIED_PARAM}=1`;

/**
 * Where each step's link of a verified user's email change lands once Better Auth has checked it:
 * the email-change page, told which step's link it was. A link that didn't work adds an `error`.
 */
export const EMAIL_CHANGE_STEP_PARAM = "step";
export const EMAIL_CHANGE_LANDINGS: Record<EmailChangeStep, string> = {
  approval: `${ROUTES.emailChange}?${EMAIL_CHANGE_STEP_PARAM}=approval`,
  verification: `${ROUTES.emailChange}?${EMAIL_CHANGE_STEP_PARAM}=verification`,
};

/** Where a finished email change goes on to: Settings, saying the email has changed. */
export const EMAIL_CHANGED_PARAM = "email-changed";
export const EMAIL_CHANGED_ROUTE = `${ROUTES.settings}?${EMAIL_CHANGED_PARAM}=1`;

/** Where a completed password reset lands: sign-in, since the reset signed the user out everywhere. */
export const PASSWORD_RESET_PARAM = "password-reset";
export const PASSWORD_RESET_ROUTE = `${ROUTES.signIn}?${PASSWORD_RESET_PARAM}=1`;

/** Where "Sign out of all devices" lands: sign-in, saying every device is signed out. */
export const SIGNED_OUT_EVERYWHERE_PARAM = "signed-out-everywhere";
export const SIGNED_OUT_EVERYWHERE_ROUTE = `${ROUTES.signIn}?${SIGNED_OUT_EVERYWHERE_PARAM}=1`;

/** Where deleting the account lands: the landing page, saying the account has been deleted. */
export const ACCOUNT_DELETED_PARAM = "account-deleted";
export const ACCOUNT_DELETED_ROUTE = `${ROUTES.home}?${ACCOUNT_DELETED_PARAM}=1`;
