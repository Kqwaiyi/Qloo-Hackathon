import { judgeAge, parseIsoBirthDate } from "@/server/accounts/birth-date";
import { type AccountDeletionContext, deleteAccountOf } from "@/server/accounts/deletion";
import type { OperationContext, Result } from "@/server/operations/context";

// The team's own operations, which its scripts run by hand. There's no request and no sign-in:
// whoever runs a script holds the production credentials.

/** What a team script's operations need. */
export type TeamContext = AccountDeletionContext & Pick<OperationContext, "auth">;

export type DeleteAccountByEmailRefusal = { refusal: "no-such-account" };

/**
 * Deletes the account using this email for good, for an emailed request or an under-18 report, as
 * the user's own deletion does: every Consultation with its photo and Previews, any Styling stopped.
 */
export async function deleteAccountByEmail(ctx: TeamContext, email: string): Promise<Result<object, DeleteAccountByEmailRefusal>> {
  const userId = await findUserIdByEmail(ctx, email);
  if (!userId) return { ok: false, refusal: "no-such-account" };
  await deleteAccountOf(ctx, userId);
  return { ok: true };
}

/** The date of birth the user emailed the team, for the account using this email. */
export interface BirthDateCorrection {
  email: string;
  /** "YYYY-MM-DD", as sign-up sends it. */
  birthDate: string;
}

export type CorrectBirthDateRefusal = { refusal: "no-such-account" | "invalid-birth-date" };

/**
 * Corrects the birth year and month of the account using this email, when its user writes in to say
 * they're wrong. It takes the whole date of birth and judges it as sign-up does: 18 to the day, in
 * every time zone. If the user isn't, the account is deleted instead, with everything in it
 * (ADR-0004), as `deleteAccountByEmail` does. Otherwise only the year and month are kept.
 */
export async function correctBirthDate(
  ctx: TeamContext,
  correction: BirthDateCorrection,
): Promise<Result<{ accountDeleted: boolean }, CorrectBirthDateRefusal>> {
  const now = ctx.clock.now();
  const birthDate = parseIsoBirthDate(correction.birthDate);
  // A date still to come is a typo, which would otherwise count as under 18 and delete the account.
  if (!birthDate || Date.UTC(birthDate.year, birthDate.month - 1, birthDate.day) > now.getTime()) {
    return { ok: false, refusal: "invalid-birth-date" };
  }
  const userId = await findUserIdByEmail(ctx, correction.email);
  if (!userId) return { ok: false, refusal: "no-such-account" };
  if (judgeAge(birthDate, now) !== "adult") {
    await deleteAccountOf(ctx, userId);
    return { ok: true, accountDeleted: true };
  }
  // Better Auth's update-user endpoint refuses the birth fields, but its own update doesn't.
  const { internalAdapter } = await ctx.auth.$context;
  await internalAdapter.updateUser(userId, { birthYear: birthDate.year, birthMonth: birthDate.month });
  return { ok: true, accountDeleted: false };
}

/** The account using this email, as Better Auth finds it at sign-in: ignoring case. */
async function findUserIdByEmail(ctx: Pick<TeamContext, "auth">, email: string): Promise<string | null> {
  const { internalAdapter } = await ctx.auth.$context;
  const found = await internalAdapter.findUserByEmail(email.trim());
  return found?.user.id ?? null;
}
