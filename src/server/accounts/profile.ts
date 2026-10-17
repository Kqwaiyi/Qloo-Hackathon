import * as z from "zod";

import { isStylePreference, isWellFormedUsername, type StylePreference } from "@/config/accounts";
import { findCountry } from "@/config/countries";

/** The profile fields that sign-up and Settings both take, as sent, unchecked. Server actions parse their input with this. */
export const profileInputSchema = z.object({ username: z.string(), stylePreference: z.string(), countryCode: z.string() });
export type ProfileInput = z.infer<typeof profileInputSchema>;

export type ProfileField = keyof ProfileInput;

/**
 * A checked profile, as Better Auth's sign-up and update-user endpoints store it: the username
 * as `name` too, and `displayUsername` keeping it as typed.
 */
export interface ProfileBody {
  name: string;
  username: string;
  displayUsername: string;
  stylePreference: StylePreference;
  countryCode: string;
}

/** Checks the username against Better Auth's rules, and the Style Preference and Country against their lists. */
export function checkProfile(input: ProfileInput): { ok: true; body: ProfileBody } | { ok: false; field: ProfileField } {
  const username = input.username.trim();
  if (!isWellFormedUsername(username)) return { ok: false, field: "username" };
  if (!isStylePreference(input.stylePreference)) return { ok: false, field: "stylePreference" };
  const country = findCountry(input.countryCode);
  if (!country) return { ok: false, field: "countryCode" };
  return {
    ok: true,
    body: { name: username, username, displayUsername: username, stylePreference: input.stylePreference, countryCode: country.code },
  };
}

/** What one of Better Auth's error codes says about the username sent, if anything. */
export function usernameProblem(code: string | undefined): "taken" | "invalid" | null {
  switch (code) {
    case "USERNAME_IS_ALREADY_TAKEN":
      return "taken";
    case "USERNAME_TOO_SHORT":
    case "USERNAME_TOO_LONG":
    case "INVALID_USERNAME":
      return "invalid";
  }
  return null;
}
