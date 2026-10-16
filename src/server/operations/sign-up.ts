import * as z from "zod";

import {
  isWellFormedUsername,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  STYLE_PREFERENCES,
  type StylePreference,
} from "@/config/accounts";
import { findCountry } from "@/config/countries";
import { AGE_GATE_COOKIE, isBlockedByAgeGate } from "@/server/accounts/age-gate";
import {
  type BirthDateFields,
  birthDateFieldsSchema,
  formatBirthDate,
  judgeAge,
  parseBirthDateFields,
} from "@/server/accounts/birth-date";
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
export const signUpInputSchema = z.object({
  birthDate: birthDateFieldsSchema,
  username: z.string(),
  email: z.string(),
  password: z.string(),
  stylePreference: z.string(),
  countryCode: z.string(),
  acceptedTerms: z.boolean(),
});
export type SignUpInput = z.infer<typeof signUpInputSchema>;

export type SignUpField = "birthDate" | "username" | "email" | "password" | "stylePreference" | "countryCode";

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
  const username = input.username.trim();
  if (!isWellFormedUsername(username)) return invalid("username");
  const email = input.email.trim();
  if (!EMAIL_PATTERN.test(email)) return invalid("email");
  if (input.password.length < PASSWORD_MIN_LENGTH || input.password.length > PASSWORD_MAX_LENGTH) return invalid("password");
  if (!isStylePreference(input.stylePreference)) return invalid("stylePreference");
  const country = findCountry(input.countryCode);
  if (!country) return invalid("countryCode");

  const body = {
    name: username,
    username,
    displayUsername: username,
    email,
    password: input.password,
    stylePreference: input.stylePreference,
    countryCode: country.code,
    // Not a user field: the sign-up hooks check it and keep only its year and month.
    birthDate: formatBirthDate(birthDate),
  };
  const answer = await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.signUp, body);
  if (answer.ok) return { ok: true };
  switch (answer.code) {
    case "UNDER_18":
      return { ok: false, refusal: "under-18" };
    case AUTH_ERROR_CODES.signUpsPaused:
      return { ok: false, refusal: "sign-ups-paused" };
    case "USERNAME_IS_ALREADY_TAKEN":
      return { ok: false, refusal: "username-taken" };
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return { ok: false, refusal: "email-taken" };
    case "USERNAME_TOO_SHORT":
    case "USERNAME_TOO_LONG":
    case "INVALID_USERNAME":
      return invalid("username");
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

function isStylePreference(value: string): value is StylePreference {
  return (STYLE_PREFERENCES as readonly string[]).includes(value);
}
