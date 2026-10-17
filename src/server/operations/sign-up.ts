import * as z from "zod";

import { isAllowedPassword } from "@/config/accounts";
import { AGE_GATE_COOKIE, isBlockedByAgeGate } from "@/server/accounts/age-gate";
import {
  type BirthDateFields,
  birthDateFieldsSchema,
  formatBirthDate,
  judgeAge,
  parseBirthDateFields,
} from "@/server/accounts/birth-date";
import { checkProfile, type ProfileField, profileInputSchema, usernameProblem } from "@/server/accounts/profile";
import { AUTH_ENDPOINTS } from "@/config/routes";
import { AUTH_ERROR_CODES } from "@/server/auth/emails";
import { postToAuthEndpoint } from "@/server/auth/endpoint";
import type { OperationContext, Result } from "@/server/operations/context";

export type DateOfBirthRefusal = { refusal: "invalid-date" | "under-18" };

/** Sign-up step 1: is this date of birth allowed to go on to step 2? */
export async function checkDateOfBirth(
  ctx: OperationContext,
  fields: BirthDateFields,
): Promise<Result<object, DateOfBirthRefusal>> {
  if (isBlockedByAgeGate(ctx.requestHeaders)) return { ok: false, refusal: "under-18" };
  const birthDate = parseBirthDateFields(fields);
  if (!birthDate) return { ok: false, refusal: "invalid-date" };
  const verdict = judgeAge(birthDate, ctx.clock.now());
  if (verdict === "adult") return { ok: true };
  if (verdict === "under-18") ctx.responseCookies.set(AGE_GATE_COOKIE);
  return { ok: false, refusal: "under-18" };
}

/** Everything sign-up step 2 sends, unchecked. Server actions parse their input with this. */
export const signUpInputSchema = profileInputSchema.extend({
  birthDate: birthDateFieldsSchema,
  email: z.string(),
  password: z.string(),
  acceptedTerms: z.boolean(),
});
export type SignUpInput = z.infer<typeof signUpInputSchema>;

export type SignUpField = "birthDate" | ProfileField | "email" | "password";

export type SignUpRefusal =
  | { refusal: "under-18" | "terms-not-accepted" | "username-taken" | "email-taken" | "sign-ups-paused" | "too-many-sign-ups" }
  | { refusal: "invalid"; field: SignUpField };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

/**
 * Sign-up step 2: creates the account through Better Auth's sign-up endpoint, as any client would,
 * so its per-IP rate limit applies, and signs the user in. Better Auth then emails the verification
 * link. Its sign-up hook rechecks the date of birth, so this refuses an under-18 date too.
 */
export async function signUp(ctx: OperationContext, input: SignUpInput): Promise<Result<object, SignUpRefusal>> {
  if (!input.acceptedTerms) return { ok: false, refusal: "terms-not-accepted" };
  const birthDate = parseBirthDateFields(input.birthDate);
  if (!birthDate) return invalid("birthDate");
  const profile = checkProfile(input);
  if (!profile.ok) return invalid(profile.field);
  const email = input.email.trim();
  if (!EMAIL_PATTERN.test(email)) return invalid("email");
  if (!isAllowedPassword(input.password)) return invalid("password");

  const body = {
    ...profile.body,
    email,
    password: input.password,
    // Not a user field: the sign-up hooks check it and keep only its year and month.
    birthDate: formatBirthDate(birthDate),
  };
  const answer = await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.signUp, body);
  if (answer.ok) return { ok: true };
  const username = usernameProblem(answer.code);
  if (username) return username === "taken" ? { ok: false, refusal: "username-taken" } : invalid("username");
  switch (answer.code) {
    case "UNDER_18":
      return { ok: false, refusal: "under-18" };
    case AUTH_ERROR_CODES.signUpsPaused:
      return { ok: false, refusal: "sign-ups-paused" };
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return { ok: false, refusal: "email-taken" };
    case "INVALID_EMAIL":
      return invalid("email");
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
      return invalid("password");
  }
  // Better Auth's per-IP rate limit, which answers without a code.
  if (answer.status === 429) return { ok: false, refusal: "too-many-sign-ups" };
  throw new Error(`Better Auth refused the sign-up (${answer.status} ${answer.code ?? "no code"}).`);
}

function invalid(field: SignUpField): { ok: false; refusal: "invalid"; field: SignUpField } {
  return { ok: false, refusal: "invalid", field };
}
