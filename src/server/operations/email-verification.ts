import { unverifiedAccountDeletionDate } from "@/server/accounts/verification";
import { AUTH_ENDPOINTS } from "@/config/routes";
import { AUTH_ERROR_CODES } from "@/server/auth/emails";
import { postToAuthEndpoint } from "@/server/auth/endpoint";
import type { AuthRequestContext, OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";

/** Whether the signed-in user has verified their email, and if not, what the banner tells them. */
export type EmailVerification = { verified: true } | { verified: false; email: string; deletionDate: Date };

/** What the verification banner and the New Consultation gate need. Null for a signed-out visitor. */
export async function readEmailVerification(ctx: Pick<OperationContext, "auth" | "requestHeaders">): Promise<EmailVerification | null> {
  const user = await readSignedInUser(ctx);
  if (!user) return null;
  if (user.emailVerified) return { verified: true };
  return { verified: false, email: user.email, deletionDate: unverifiedAccountDeletionDate(user.createdAt) };
}

export type ResendVerificationRefusal = {
  refusal: "signed-out" | "already-verified" | "resend-limit" | "emails-paused" | "rate-limited";
};

/** "Resend link": emails the signed-in, unverified user a new verification link. */
export async function resendVerificationEmail(ctx: AuthRequestContext): Promise<Result<object, ResendVerificationRefusal>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };
  if (user.emailVerified) return { ok: false, refusal: "already-verified" };

  const answer = await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.sendVerificationEmail, { email: user.email });
  if (answer.ok) return { ok: true };
  switch (answer.code) {
    case "EMAIL_ALREADY_VERIFIED":
      return { ok: false, refusal: "already-verified" };
    case AUTH_ERROR_CODES.emailLimitReached:
      return { ok: false, refusal: "resend-limit" };
    case AUTH_ERROR_CODES.emailsPaused:
      return { ok: false, refusal: "emails-paused" };
  }
  if (answer.status === 429) return { ok: false, refusal: "rate-limited" };
  throw new Error(`Better Auth couldn't resend the verification link (${answer.status} ${answer.code ?? "no code"}).`);
}
