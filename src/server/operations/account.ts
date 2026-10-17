import { eq } from "drizzle-orm";
import * as z from "zod";

import { isAllowedPassword } from "@/config/accounts";
import { AUTH_ENDPOINTS } from "@/config/routes";
import { clearPhotoConsent } from "@/server/accounts/photo-consent";
import { checkProfile, type ProfileField, type ProfileInput, usernameProblem } from "@/server/accounts/profile";
import { postToAuthEndpoint } from "@/server/auth/endpoint";
import { deleteConsultationOf } from "@/server/consultations/deletion";
import { consultation } from "@/server/db/schema";
import type { AuthRequestContext, OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import { signOut } from "@/server/operations/sign-in";

export type UpdateProfileRefusal = { refusal: "signed-out" | "username-taken" } | { refusal: "invalid"; field: ProfileField };

/**
 * Settings → Profile: the username, Style Preference and Country. The old username is free for
 * anyone at once. Each Consultation keeps the profile it started with, so only new ones change.
 */
export async function updateProfile(ctx: AuthRequestContext, input: ProfileInput): Promise<Result<object, UpdateProfileRefusal>> {
  const profile = checkProfile(input);
  if (!profile.ok) return { ok: false, refusal: "invalid", field: profile.field };

  const answer = await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.updateUser, profile.body);
  if (answer.ok) return { ok: true };
  const username = usernameProblem(answer.code);
  if (username) return username === "taken" ? { ok: false, refusal: "username-taken" } : { ok: false, refusal: "invalid", field: "username" };
  if (answer.status === 401) return { ok: false, refusal: "signed-out" };
  throw new Error(`Better Auth couldn't update the profile (${answer.status} ${answer.code ?? "no code"}).`);
}

/** The password change in Settings, as sent. Server actions parse their input with this. */
export const changePasswordInputSchema = z.object({ currentPassword: z.string(), newPassword: z.string() });
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export type ChangePasswordRefusal = { refusal: "signed-out" | "wrong-password" | "invalid-password" | "rate-limited" };

/**
 * Settings → Sign-in: a new password, given the current one. Our Better Auth hooks then sign out
 * the user's other devices and email them the password-changed notice, for direct calls too.
 */
export async function changePassword(ctx: AuthRequestContext, input: ChangePasswordInput): Promise<Result<object, ChangePasswordRefusal>> {
  if (!isAllowedPassword(input.newPassword)) return { ok: false, refusal: "invalid-password" };
  const answer = await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.changePassword, {
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
  });
  if (answer.ok) return { ok: true };
  switch (answer.code) {
    case "INVALID_PASSWORD":
    // The new password is within the limits, so it's the current one that's too long to be right.
    case "PASSWORD_TOO_LONG":
      return { ok: false, refusal: "wrong-password" };
  }
  if (answer.status === 401) return { ok: false, refusal: "signed-out" };
  // Better Auth's per-IP rate limit, 3 tries in 10 seconds, which answers without a code.
  if (answer.status === 429) return { ok: false, refusal: "rate-limited" };
  throw new Error(`Better Auth couldn't change the password (${answer.status} ${answer.code ?? "no code"}).`);
}

export type WithdrawPhotoConsentRefusal = { refusal: "signed-out" };

/**
 * Settings → Privacy → "Withdraw photo consent": forgets the user's agreement to the photo notice,
 * then deletes every one of their Consultations for good, as deleting each would, stopping any
 * Styling first. The account stays. The agreement goes first, so no new Consultation can start
 * meanwhile, and withdrawing again finishes the job if a Consultation's Blob objects couldn't go.
 */
export async function withdrawPhotoConsent(
  ctx: Pick<OperationContext, "auth" | "db" | "blob" | "clock" | "stylings" | "requestHeaders">,
): Promise<Result<object, WithdrawPhotoConsentRefusal>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };
  await clearPhotoConsent(ctx.db, user.id);
  const consultations = await ctx.db.select({ id: consultation.id }).from(consultation).where(eq(consultation.userId, user.id));
  for (const { id } of consultations) await deleteConsultationOf(ctx, { userId: user.id, consultationId: id });
  return { ok: true };
}

export type SignOutEverywhereRefusal = { refusal: "signed-out" };

/** Settings → "Sign out of all devices": ends every one of the user's sessions, this one included. */
export async function signOutEverywhere(ctx: AuthRequestContext): Promise<Result<object, SignOutEverywhereRefusal>> {
  const answer = await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.revokeSessions, {});
  if (!answer.ok) {
    if (answer.status === 401) return { ok: false, refusal: "signed-out" };
    throw new Error(`Better Auth couldn't end the sessions (${answer.status} ${answer.code ?? "no code"}).`);
  }
  // Better Auth ended this session along with the rest but left its cookie, which signing out clears.
  await signOut(ctx);
  return { ok: true };
}
