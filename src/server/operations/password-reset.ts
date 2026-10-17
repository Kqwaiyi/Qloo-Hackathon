import * as z from "zod";

import { isAllowedPassword } from "@/config/accounts";
import { AUTH_ENDPOINTS } from "@/config/routes";
import { AUTH_ERROR_CODES } from "@/server/auth/emails";
import { postToAuthEndpoint } from "@/server/auth/endpoint";
import type { AuthRequestContext, Result } from "@/server/operations/context";

export type RequestPasswordResetRefusal = { refusal: "invalid-email" | "emails-paused" | "rate-limited" };

/**
 * "Forgot password": emails a reset link to the account that uses this address, if any. Every
 * address gets the same reply, so nobody can find out which addresses have accounts: an account
 * that has had its 3 reset emails today just gets no more.
 */
export async function requestPasswordReset(
  ctx: AuthRequestContext,
  email: string,
): Promise<Result<object, RequestPasswordResetRefusal>> {
  const address = email.trim();
  if (!z.email().safeParse(address).success) return { ok: false, refusal: "invalid-email" };

  const answer = await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.requestPasswordReset, { email: address });
  if (answer.ok) return { ok: true };
  if (answer.code === AUTH_ERROR_CODES.emailsPaused) return { ok: false, refusal: "emails-paused" };
  // Better Auth's per-IP rate limit, which answers without a code.
  if (answer.status === 429) return { ok: false, refusal: "rate-limited" };
  throw new Error(`Better Auth couldn't take the password reset request (${answer.status} ${answer.code ?? "no code"}).`);
}

export interface ResetPasswordInput {
  /** From the link, which brought it to the reset page. */
  token: string;
  newPassword: string;
}

export type ResetPasswordRefusal = {
  /** The link has expired, been used, or been cancelled by another reset. */
  refusal: "invalid-link" | "invalid-password";
};

/** The reset page: sets the new password, if the link still works. A refused password leaves the link working. */
export async function resetPassword(ctx: AuthRequestContext, input: ResetPasswordInput): Promise<Result<object, ResetPasswordRefusal>> {
  if (!isAllowedPassword(input.newPassword)) return { ok: false, refusal: "invalid-password" };
  const answer = await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.resetPassword, { token: input.token, newPassword: input.newPassword });
  if (answer.ok) return { ok: true };
  if (answer.code === "INVALID_TOKEN") return { ok: false, refusal: "invalid-link" };
  throw new Error(`Better Auth couldn't reset the password (${answer.status} ${answer.code ?? "no code"}).`);
}
