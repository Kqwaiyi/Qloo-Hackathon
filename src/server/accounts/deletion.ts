import { eq } from "drizzle-orm";

import { withdrawPhotoConsentOf } from "@/server/accounts/photo-consent";
import { verification } from "@/server/db/schema";
import type { OperationContext } from "@/server/operations/context";

/** What deleting an account touches besides Better Auth's own tables. */
export type AccountDeletionContext = Pick<OperationContext, "db" | "blob" | "clock" | "stylings">;

/**
 * Better Auth's `beforeDelete`, while the user still exists: withdraws their photo consent, which
 * deletes every Consultation with its Blob objects, any Styling stopped first. Withdrawing first
 * means a "Get my Outfits" still checking its photo leaves no Consultation behind. Throws, keeping
 * the account, when a Consultation's Blob objects can't be deleted: deleting again finishes the job.
 */
export async function beforeAccountDeletion(ctx: AccountDeletionContext, userId: string): Promise<void> {
  await withdrawPhotoConsentOf(ctx, userId);
}

/**
 * Better Auth's `afterDelete`, once the user, their sessions and sign-in are gone, and the database
 * has stripped them from the usage records and the email log: deletes the links still waiting in
 * Better Auth's verification table, which hold the user's ID, such as a password reset link.
 */
export async function afterAccountDeletion(ctx: Pick<OperationContext, "db">, userId: string): Promise<void> {
  await ctx.db.delete(verification).where(eq(verification.value, userId));
}

/**
 * Deletes an account for good with no password, for the team's scripts and the daily sweep:
 * Better Auth's own deletion with the same hooks around it. Deleting the user deletes their
 * sessions and sign-in too.
 */
export async function deleteAccountOf(ctx: AccountDeletionContext & Pick<OperationContext, "auth">, userId: string): Promise<void> {
  await beforeAccountDeletion(ctx, userId);
  const { internalAdapter } = await ctx.auth.$context;
  await internalAdapter.deleteUser(userId);
  await afterAccountDeletion(ctx, userId);
}
