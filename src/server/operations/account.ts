import * as z from "zod";

import { isAllowedPassword } from "@/config/accounts";
import { AUTH_ENDPOINTS } from "@/config/routes";
import { type BirthDateFields, judgeAge, parseBirthDateFields, storeBirthYearAndMonth } from "@/server/accounts/birth-date";
import { withdrawPhotoConsentOf } from "@/server/accounts/photo-consent";
import { checkProfile, type ProfileField, type ProfileInput, usernameProblem } from "@/server/accounts/profile";
import { MANAGED_BY_THE_TEAM } from "@/server/auth/demo-account";
import { postToAuthEndpoint } from "@/server/auth/endpoint";
import type { AuthRequestContext, OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import { signOut } from "@/server/operations/sign-in";

export type UpdateProfileRefusal =
  | { refusal: "signed-out" }
  | { refusal: "username-taken" }
  | { refusal: "managed-by-the-team" }
  | { refusal: "invalid"; field: ProfileField };

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
  // The Demo Account's username, which the team manages.
  if (answer.code === MANAGED_BY_THE_TEAM) return { ok: false, refusal: "managed-by-the-team" };
  if (answer.status === 401) return { ok: false, refusal: "signed-out" };
  throw new Error(`Better Auth couldn't update the profile (${answer.status} ${answer.code ?? "no code"}).`);
}

/** The password change in Settings, as sent. Server actions parse their input with this. */
export const changePasswordInputSchema = z.object({ currentPassword: z.string(), newPassword: z.string() });
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export type ChangePasswordRefusal = { refusal: "signed-out" | "wrong-password" | "invalid-password" | "rate-limited" | "managed-by-the-team" };

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
    case MANAGED_BY_THE_TEAM:
      return { ok: false, refusal: "managed-by-the-team" };
  }
  if (answer.status === 401) return { ok: false, refusal: "signed-out" };
  // Better Auth's per-IP rate limit, 3 tries in 10 seconds, which answers without a code.
  if (answer.status === 429) return { ok: false, refusal: "rate-limited" };
  throw new Error(`Better Auth couldn't change the password (${answer.status} ${answer.code ?? "no code"}).`);
}

export type WithdrawPhotoConsentRefusal = { refusal: "signed-out" | "managed-by-the-team" };

/**
 * Settings → Privacy → "Withdraw photo consent": forgets the user's agreement to the photo notice,
 * then deletes every one of their Consultations for good (see `withdrawPhotoConsentOf`). The
 * account stays. Not on the Demo Account, where it would delete every judge's Consultations.
 */
export async function withdrawPhotoConsent(
  ctx: Pick<OperationContext, "auth" | "db" | "blob" | "clock" | "stylings" | "requestHeaders">,
): Promise<Result<object, WithdrawPhotoConsentRefusal>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };
  if (user.isDemoAccount) return { ok: false, refusal: "managed-by-the-team" };
  await withdrawPhotoConsentOf(ctx, user.id);
  return { ok: true };
}

export type ChangeDemoAccountBirthDateRefusal = { refusal: "signed-out" | "not-demo-account" | "invalid-birth-date" | "under-18" };

/**
 * Settings → Profile on the Demo Account: a new date of birth, so judges can see how Outfits change
 * with the age group. It must be 18 or over, judged as sign-up judges it: to the day, in every time
 * zone (ADR-0004). Only its year and month are kept, as at sign-up. Anyone else's date of birth
 * stays as they signed up with it, and the team corrects it when they write in.
 */
export async function changeDemoAccountBirthDate(
  ctx: Pick<OperationContext, "auth" | "clock" | "requestHeaders">,
  fields: BirthDateFields,
): Promise<Result<object, ChangeDemoAccountBirthDateRefusal>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };
  if (!user.isDemoAccount) return { ok: false, refusal: "not-demo-account" };
  const birthDate = parseBirthDateFields(fields);
  if (!birthDate) return { ok: false, refusal: "invalid-birth-date" };
  if (judgeAge(birthDate, ctx.clock.now()) !== "adult") return { ok: false, refusal: "under-18" };
  await storeBirthYearAndMonth(ctx.auth, user.id, birthDate);
  return { ok: true };
}

/** The password that confirms deleting the account, as sent. Server actions parse their input with this. */
export const deleteAccountInputSchema = z.object({ password: z.string() });
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;

export type DeleteAccountRefusal = { refusal: "signed-out" | "wrong-password" | "rate-limited" | "managed-by-the-team" };

/** Settings → Danger → "Delete account", confirmed with the password. The user is signed out. */
export async function deleteAccount(ctx: AuthRequestContext, input: DeleteAccountInput): Promise<Result<object, DeleteAccountRefusal>> {
  const answer = await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.deleteUser, { password: input.password });
  if (answer.ok) return { ok: true };
  switch (answer.code) {
    case "INVALID_PASSWORD":
    // Longer than any password can be, or none at all, so it isn't theirs.
    case "PASSWORD_TOO_LONG":
    case "PASSWORD_REQUIRED":
      return { ok: false, refusal: "wrong-password" };
    case MANAGED_BY_THE_TEAM:
      return { ok: false, refusal: "managed-by-the-team" };
  }
  if (answer.status === 401) return { ok: false, refusal: "signed-out" };
  // Our per-IP rate limit on account deletions, which answers without a code.
  if (answer.status === 429) return { ok: false, refusal: "rate-limited" };
  throw new Error(`Better Auth couldn't delete the account (${answer.status} ${answer.code ?? "no code"}).`);
}

export type SignOutEverywhereRefusal = { refusal: "signed-out" | "managed-by-the-team" };

/** Settings → "Sign out of all devices": ends every one of the user's sessions, this one included. */
export async function signOutEverywhere(ctx: AuthRequestContext): Promise<Result<object, SignOutEverywhereRefusal>> {
  const answer = await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.revokeSessions, {});
  if (!answer.ok) {
    if (answer.status === 401) return { ok: false, refusal: "signed-out" };
    if (answer.code === MANAGED_BY_THE_TEAM) return { ok: false, refusal: "managed-by-the-team" };
    throw new Error(`Better Auth couldn't end the sessions (${answer.status} ${answer.code ?? "no code"}).`);
  }
  // Better Auth ended this session along with the rest but left its cookie, which signing out clears.
  await signOut(ctx);
  return { ok: true };
}
