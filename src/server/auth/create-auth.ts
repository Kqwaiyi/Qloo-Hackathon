import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { username } from "better-auth/plugins";
import * as z from "zod";

import {
  DELETE_ACCOUNT_RATE_LIMIT,
  demoAccountEmailOf,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_LINK_LIFETIME_SECONDS,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  SIGN_IN_RATE_LIMIT,
  SIGN_UP_RATE_LIMIT,
  STYLE_PREFERENCES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  VERIFICATION_LINK_LIFETIME_SECONDS,
} from "@/config/accounts";
import { COPY } from "@/config/copy";
import { findCountry } from "@/config/countries";
import { AUTH_API_PATH, AUTH_ENDPOINTS } from "@/config/routes";
import { recordActivity } from "@/server/accounts/activity";
import { AGE_GATE_COOKIE, isBlockedByAgeGate } from "@/server/accounts/age-gate";
import { judgeAge, parseIsoBirthDate } from "@/server/accounts/birth-date";
import { afterAccountDeletion, beforeAccountDeletion } from "@/server/accounts/deletion";
import { endEmailChange, recordEmailChangeStep } from "@/server/accounts/email-change";
import type { BlobStore } from "@/server/blob/store";
import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/database";
import * as schema from "@/server/db/schema";
import type { EmailSender } from "@/server/email/send-email";
import { serializeCookie } from "@/server/http/cookies";
import { isFromSupportedRegion } from "@/server/region-gate";
import type { StylingRunner } from "@/server/stylings/runner";

import {
  emailChangeApprovalSender,
  emailRefusalError,
  passwordChangedEmailSender,
  passwordResetEmailSender,
  trackApiEndpoints,
  verificationEmailSender,
} from "./emails";
import { type BotCheckOptions, botCheckGuard } from "./bot-check";
import { demoAccountGuard } from "./demo-account";
import { emailChangeLinkCheck } from "./email-change";
import { passwordResetFinisher } from "./password-reset";

export type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

export interface AuthOptions {
  db: Database;
  clock: Clock;
  baseURL: string;
  /** Other origins the app is served from, such as a preview deployment's own URL. */
  trustedOrigins?: string[];
  secret: string;
  /** The send-email function, which every email Better Auth sends goes through. */
  emailSender: EmailSender;
  /** The team's address, which the password-changed email says to write to, and whose `+demo` plus-address is the Demo Account's. */
  teamEmail: string;
  /** Where photos and Previews are kept, which deleting an account deletes. */
  blob: BlobStore;
  /** What runs Stylings, whose Workflow runs deleting an account cancels. */
  stylings: StylingRunner;
  /** Whether Better Auth's rate limits apply. Unset, they do in production only, as Better Auth's default. */
  rateLimit?: boolean;
  /** Cloudflare Turnstile, for the Bot Check. Unset, the Bot Check is off. */
  botCheck?: BotCheckOptions;
}

export function createAuth({
  db,
  clock,
  baseURL,
  trustedOrigins,
  secret,
  emailSender,
  teamEmail,
  blob,
  stylings,
  rateLimit,
  botCheck,
}: AuthOptions) {
  const demoAccountEmail = demoAccountEmailOf(teamEmail);

  /**
   * Rechecks 18+ on every email sign-up, ours or a direct call, before anything is read or written,
   * then the region gate and the app-wide sign-up email cap.
   */
  async function beforeSignUp(ctx: HookContext): Promise<void> {
    // A browser already blocked is refused without restarting its 30 days.
    if (ctx.headers && isBlockedByAgeGate(ctx.headers)) throw under18();
    const birthDate = parseIsoBirthDate(ctx.body?.birthDate);
    if (!birthDate) throw birthDateRequired();
    const verdict = judgeAge(birthDate, clock.now());
    if (verdict === "turns-18-today") throw under18();
    if (verdict === "under-18") {
      throw under18({ "set-cookie": serializeCookie({ ...AGE_GATE_COOKIE, secure: baseURL.startsWith("https://") }) });
    }
    // A server call without a request's headers, such as a team script's, has no country to judge.
    if (ctx.headers && !isFromSupportedRegion(ctx.headers)) throw unsupportedRegion();
    // Near Gmail's daily limit, new sign-ups stop, keeping the rest for existing users.
    if (await emailSender.refusalFor("verification", null)) throw emailRefusalError("sign-ups-paused");
  }

  /**
   * An email change only while its cap allows. Checked before Better Auth acts, which ignores a
   * refused email: it would change an unverified user's address anyway, or answer a verified user
   * as if the approval went. An address already in use is refused the same, so it stays unseen.
   */
  async function beforeChangeEmail(ctx: HookContext): Promise<void> {
    const session = await getSessionFromCtx(ctx);
    if (!session) return;
    const refusal = await emailSender.refusalFor("email-change", session.user.id);
    if (refusal) throw emailRefusalError(refusal);
  }

  const refuseWhatTheTeamManages = demoAccountGuard(demoAccountEmail);

  // First, so a bot learns nothing from the other checks.
  const refuseBots = botCheckGuard(botCheck, demoAccountEmail);

  const checkEmailChangeLink = emailChangeLinkCheck({ db, clock, emailSender, secret });

  /** A verified user's email-change link goes ahead only while it fits their newest change (see `emailChangeLinkCheck`). */
  async function beforeVerifyEmail(ctx: HookContext): Promise<void> {
    const refusedLanding = await checkEmailChangeLink(ctx.query?.token);
    if (refusedLanding) throw ctx.redirect(refusedLanding);
  }

  /**
   * While every email is paused, a reset request says so, before the address is looked up, so every
   * address still gets the same answer. Any other refusal stays silent (see `passwordResetEmailSender`).
   */
  async function beforeRequestPasswordReset(): Promise<void> {
    const refusal = await emailSender.refusalFor("password-reset", null);
    if (refusal) throw emailRefusalError(refusal);
  }

  /**
   * Deleting the account is confirmed with the password only. Without one, Better Auth would take a
   * sign-in less than a day old instead.
   */
  function beforeDeleteUser(ctx: HookContext): void {
    const password: unknown = ctx.body?.password;
    if (typeof password !== "string" || password === "") throw passwordRequired();
  }

  /** Every password change signs out the user's other devices, whatever the request asked for. */
  function beforeChangePassword(ctx: HookContext) {
    return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };
  }

  const sendPasswordChangedEmail = passwordChangedEmailSender(emailSender, baseURL, teamEmail);
  const sendEmailChangeApproval = emailChangeApprovalSender(emailSender, baseURL, teamEmail);

  /** A verified user's change asks the old address to approve it, and then waits on that. */
  async function sendChangeEmailConfirmation(data: Parameters<typeof sendEmailChangeApproval>[0]): Promise<void> {
    await sendEmailChangeApproval(data);
    await recordEmailChangeStep(db, { userId: data.user.id, newEmail: data.newEmail, step: "approval", at: clock.now() });
  }

  /** Once approved, a change waits on the link its new address was just sent. */
  async function emailChangeLinkSent(recipient: { id: string; email: string }): Promise<void> {
    await recordEmailChangeStep(db, { userId: recipient.id, newEmail: recipient.email, step: "verification", at: clock.now() });
  }

  /**
   * The notice email after every password change: from our Settings form, and from a direct call
   * too, so someone holding a stolen sign-in can't change the password unnoticed. A reset sends none.
   */
  async function afterChangePassword(ctx: HookContext): Promise<void> {
    const returned: unknown = ctx.context.returned;
    if (isAPIError(returned)) return;
    const changed = returned as { user?: Parameters<typeof sendPasswordChangedEmail>[0] } | undefined;
    if (changed?.user) await sendPasswordChangedEmail(changed.user);
  }

  const auth = betterAuth({
    appName: "Outfit Recommender",
    baseURL,
    basePath: AUTH_API_PATH,
    trustedOrigins,
    secret,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      sendResetPassword: passwordResetEmailSender(emailSender, baseURL),
      resetPasswordTokenExpiresIn: PASSWORD_RESET_LINK_LIFETIME_SECONDS,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: passwordResetFinisher(db, clock),
    },
    // A soft gate: a new user is signed in at once, and only New Consultation waits for the link.
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: VERIFICATION_LINK_LIFETIME_SECONDS,
      autoSignInAfterVerification: true,
      sendVerificationEmail: verificationEmailSender(emailSender, baseURL, emailChangeLinkSent),
      // After any verification, an email change included: once the email has changed, nothing waits.
      afterEmailVerification: (verified) => endEmailChange(db, verified.id),
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    // Kept in the database, so every server instance counts together. It applies to requests that
    // reach Better Auth's HTTP endpoints, which is why our forms post to them.
    rateLimit: {
      enabled: rateLimit,
      storage: "database",
      customRules: {
        [AUTH_ENDPOINTS.signUp]: { ...SIGN_UP_RATE_LIMIT },
        [AUTH_ENDPOINTS.signInEmail]: { ...SIGN_IN_RATE_LIMIT },
        [AUTH_ENDPOINTS.signInUsername]: { ...SIGN_IN_RATE_LIMIT },
        [AUTH_ENDPOINTS.deleteUser]: { ...DELETE_ACCOUNT_RATE_LIMIT },
      },
    },
    advanced: {
      // The client's IP address, as Vercel sets it.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: (deleted) => beforeAccountDeletion({ db, blob, clock, stylings }, deleted.id),
        afterDelete: (deleted) => afterAccountDeletion({ db }, deleted.id),
      },
      changeEmail: {
        enabled: true,
        // An unverified user's change happens at once, and a new link goes to the new address.
        updateEmailWithoutVerification: true,
        // A verified user's old address approves first, then the new address gets its link.
        sendChangeEmailConfirmation,
      },
      additionalFields: {
        stylePreference: {
          type: [...STYLE_PREFERENCES],
          required: true,
          validator: { input: z.enum(STYLE_PREFERENCES) },
        },
        countryCode: {
          type: "string",
          required: true,
          validator: { input: z.string().refine((code) => findCountry(code)?.code === code, "Not a supported Country") },
        },
        birthYear: { type: "number", required: false, input: false },
        birthMonth: { type: "number", required: false, input: false },
        // Set only by "Get my Outfits" with both consent ticks, and cleared by withdrawing photo consent.
        acceptedPhotoNoticeVersion: { type: "number", required: false, input: false },
        photoNoticeAcceptedAt: { type: "date", required: false, input: false },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        await refuseBots(ctx);
        await refuseWhatTheTeamManages(ctx);
        if (ctx.path === AUTH_ENDPOINTS.signUp) await beforeSignUp(ctx);
        if (ctx.path === AUTH_ENDPOINTS.changeEmail) await beforeChangeEmail(ctx);
        if (ctx.path === AUTH_ENDPOINTS.verifyEmail) await beforeVerifyEmail(ctx);
        if (ctx.path === AUTH_ENDPOINTS.requestPasswordReset) await beforeRequestPasswordReset();
        if (ctx.path === AUTH_ENDPOINTS.deleteUser) beforeDeleteUser(ctx);
        if (ctx.path === AUTH_ENDPOINTS.changePassword) return beforeChangePassword(ctx);
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === AUTH_ENDPOINTS.changePassword) await afterChangePassword(ctx);
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Keeps the birth year and month from the date of birth sent with the sign-up, and drops the
          // day. The sign-up time is our clock's, which the unverified-account deletion date counts from.
          before: async (_newUser, ctx) => {
            const birthDate = parseIsoBirthDate(ctx?.body?.birthDate);
            if (!birthDate) throw birthDateRequired();
            return { data: { birthYear: birthDate.year, birthMonth: birthDate.month, createdAt: clock.now() } };
          },
        },
      },
      // Every session created or refreshed marks its user active, for the daily sweep.
      session: {
        create: { after: (created) => recordActivity({ db, clock }, created.userId) },
        update: {
          after: async (updated) => {
            // Better Auth hands over nothing if the session went in the meantime.
            if (updated?.userId) await recordActivity({ db, clock }, updated.userId);
          },
        },
      },
    },
    plugins: [username({ minUsernameLength: USERNAME_MIN_LENGTH, maxUsernameLength: USERNAME_MAX_LENGTH })],
  });
  trackApiEndpoints(auth.api);
  // Which account is the Demo Account, for whatever reads a user through Better Auth.
  return Object.assign(auth, { demoAccountEmail });
}

export type Auth = ReturnType<typeof createAuth>;

function under18(headers: Record<string, string> = {}): APIError {
  return new APIError("BAD_REQUEST", { code: "UNDER_18", message: COPY.under18 }, headers);
}

function unsupportedRegion(): APIError {
  return new APIError("FORBIDDEN", { code: "UNSUPPORTED_REGION", message: COPY.unsupportedRegion });
}

function passwordRequired(): APIError {
  return new APIError("BAD_REQUEST", { code: "PASSWORD_REQUIRED", message: "Your password is required to delete your account." });
}

function birthDateRequired(): APIError {
  return new APIError("BAD_REQUEST", { code: "BIRTH_DATE_REQUIRED", message: "A valid date of birth is required." });
}
