import { APIError } from "better-auth/api";
import { AsyncLocalStorage } from "node:async_hooks";

import { COPY } from "@/config/copy";
import type { EmailKind } from "@/config/email";
import { AUTH_API_PATH, AUTH_ENDPOINTS, ROUTES } from "@/config/routes";
import { unverifiedAccountDeletionDate } from "@/server/accounts/verification";
import { passwordChangedEmail, passwordResetEmail, verificationEmail } from "@/server/email/messages";
import type { EmailRefusal, EmailSender } from "@/server/email/send-email";

/** The codes of the refusals our hooks and emails add to Better Auth's. Our operations match them. */
export const AUTH_ERROR_CODES = {
  signUpsPaused: "SIGN_UPS_PAUSED",
  emailsPaused: "EMAILS_PAUSED",
  emailLimitReached: "EMAIL_LIMIT_REACHED",
  emailChangeNeedsApproval: "EMAIL_CHANGE_NEEDS_APPROVAL",
} as const;

/** The user Better Auth hands its email callbacks: only what our emails need. */
interface AuthUser {
  id: string;
  email: string;
  createdAt: Date | string;
}

/**
 * Better Auth's `sendVerificationEmail`, through our send function. The kind of email comes from
 * the endpoint that sends it, which a caller can't disguise: a request through the HTTP handler
 * names it in its URL, and an `auth.api` call carries it (see `trackApiEndpoints`).
 */
export function verificationEmailSender(emailSender: EmailSender, baseURL: string) {
  return async ({ user, token }: { user: AuthUser; token: string }, request?: Request): Promise<void> => {
    // Our own link, always landing on the verification result page, whatever callback the request named.
    const link = `${baseURL}${AUTH_API_PATH}${AUTH_ENDPOINTS.verifyEmail}?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(ROUTES.verifyEmail)}`;
    const endpoint = request ? new URL(request.url).pathname.slice(AUTH_API_PATH.length) : apiEndpoint.getStore();
    const result = await emailSender.send({
      // Anything else counts as a resend, the kind with a per-account cap.
      kind: (endpoint === undefined ? undefined : VERIFICATION_EMAIL_KINDS[endpoint]) ?? "verification-resend",
      userId: user.id,
      to: user.email,
      ...verificationEmail({ link, deletionDate: unverifiedAccountDeletionDate(new Date(user.createdAt)) }),
    });
    if (!result.sent) throw emailRefusalError(result.refusal);
  };
}

/**
 * Better Auth's `sendResetPassword`, through our send function. A refused email throws, which
 * Better Auth logs and keeps to itself, so the request gets the same reply whatever happened.
 */
export function passwordResetEmailSender(emailSender: EmailSender, baseURL: string) {
  return async ({ user, token }: { user: AuthUser; token: string }): Promise<void> => {
    // Our own link: Better Auth checks the token, then lands on the reset page with it.
    const link = `${baseURL}${AUTH_API_PATH}${AUTH_ENDPOINTS.resetPassword}/${encodeURIComponent(token)}?callbackURL=${encodeURIComponent(ROUTES.resetPassword)}`;
    const result = await emailSender.send({ kind: "password-reset", userId: user.id, to: user.email, ...passwordResetEmail({ link }) });
    if (!result.sent) throw emailRefusalError(result.refusal);
  };
}

/**
 * Sends the password-changed notice through our send function. The password has changed by then,
 * so an email a cap stops or the transport fails is only logged: the change still stands.
 */
export function passwordChangedEmailSender(emailSender: EmailSender, baseURL: string, teamEmail: string) {
  return async (user: Pick<AuthUser, "id" | "email">): Promise<void> => {
    const content = passwordChangedEmail({ forgotPasswordLink: `${baseURL}${ROUTES.forgotPassword}`, teamEmail });
    try {
      const result = await emailSender.send({ kind: "password-changed", userId: user.id, to: user.email, ...content });
      if (!result.sent) console.error("The password-changed email was refused:", result.refusal);
    } catch (error) {
      console.error("The password-changed email failed:", error instanceof Error ? error.message : "unknown error");
    }
  };
}

const VERIFICATION_EMAIL_KINDS: Record<string, EmailKind> = {
  [AUTH_ENDPOINTS.signUp]: "verification",
  [AUTH_ENDPOINTS.sendVerificationEmail]: "verification-resend",
  // An unverified user's email change sends a new link to the new address.
  [AUTH_ENDPOINTS.changeEmail]: "email-change",
};

/** The endpoint of the `auth.api` call under way, if any. */
const apiEndpoint = new AsyncLocalStorage<string>();

/**
 * Makes every `auth.api` call run knowing its own endpoint, as a request through the HTTP handler
 * does from its URL. Better Auth gives an email callback no request for such a call, so this is how
 * its email still counts as the right kind.
 */
export function trackApiEndpoints(api: object): void {
  const endpoints = api as Record<string, unknown>;
  for (const [name, endpoint] of Object.entries(endpoints)) {
    if (typeof endpoint !== "function") continue;
    const path: unknown = (endpoint as { path?: unknown }).path;
    if (typeof path !== "string") continue;
    endpoints[name] = Object.assign((...args: unknown[]) => apiEndpoint.run(path, () => endpoint(...args)), endpoint);
  }
}

/** The Better Auth error for an email a cap stopped. */
export function emailRefusalError(refusal: EmailRefusal): APIError {
  switch (refusal) {
    case "sign-ups-paused":
      return new APIError("SERVICE_UNAVAILABLE", { code: AUTH_ERROR_CODES.signUpsPaused, message: COPY.signUpsPaused });
    case "account-limit":
      return new APIError("TOO_MANY_REQUESTS", { code: AUTH_ERROR_CODES.emailLimitReached, message: "Too many emails for this account today." });
    case "emails-paused":
    case "warnings-paused":
      return new APIError("SERVICE_UNAVAILABLE", { code: AUTH_ERROR_CODES.emailsPaused, message: "Emails are paused for now." });
  }
}
