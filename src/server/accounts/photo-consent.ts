import { eq } from "drizzle-orm";

import { PHOTO_NOTICE_VERSION } from "@/config/accounts";
import { deleteConsultationOf } from "@/server/consultations/deletion";
import type { Database, Transaction } from "@/server/db/database";
import { consultation, user } from "@/server/db/schema";
import type { OperationContext } from "@/server/operations/context";
import type { SignedInUser } from "@/server/operations/session";

/**
 * Whether the consent sheet must come before the user's next Consultation: they've never agreed to
 * the photo notice, have withdrawn photo consent, or agreed to an older photo notice. On the Demo
 * Account it always comes, so each judge's agreement is their own, kept on the Consultation it's for.
 */
export function needsPhotoConsent(signedIn: Pick<SignedInUser, "photoConsent" | "isDemoAccount">): boolean {
  return signedIn.isDemoAccount || signedIn.photoConsent?.noticeVersion !== PHOTO_NOTICE_VERSION;
}

/** Records the user's agreement to the current photo notice, made at `at`. */
export async function recordPhotoConsent(db: Database, userId: string, at: Date): Promise<void> {
  await db.update(user).set({ acceptedPhotoNoticeVersion: PHOTO_NOTICE_VERSION, photoNoticeAcceptedAt: at }).where(eq(user.id, userId));
}

/**
 * Whether the user's agreement to the current photo notice still stands, as their Consultation is
 * created in this transaction. It holds the user's row until the transaction ends, so a withdrawal
 * under way waits for the Consultation and then deletes it with the rest.
 */
export async function photoConsentStands(tx: Transaction, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ noticeVersion: user.acceptedPhotoNoticeVersion })
    .from(user)
    .where(eq(user.id, userId))
    .for("share");
  return row?.noticeVersion === PHOTO_NOTICE_VERSION;
}

/**
 * Withdraws the user's photo consent: forgets their agreement to the photo notice, then deletes
 * every one of their Consultations for good, as deleting each would, stopping any Styling first.
 * The agreement goes first, so no new Consultation can start meanwhile (see `photoConsentStands`),
 * and withdrawing again finishes the job if a Consultation's Blob objects couldn't go. It's behind
 * withdrawing photo consent and deleting the account, for a user the caller has already found.
 */
export async function withdrawPhotoConsentOf(
  ctx: Pick<OperationContext, "db" | "blob" | "clock" | "stylings">,
  userId: string,
): Promise<void> {
  await ctx.db.update(user).set({ acceptedPhotoNoticeVersion: null, photoNoticeAcceptedAt: null }).where(eq(user.id, userId));
  const consultations = await ctx.db.select({ id: consultation.id }).from(consultation).where(eq(consultation.userId, userId));
  for (const { id } of consultations) await deleteConsultationOf(ctx, { userId, consultationId: id });
}
