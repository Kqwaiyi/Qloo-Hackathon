import { eq } from "drizzle-orm";

import { PHOTO_NOTICE_VERSION } from "@/config/accounts";
import type { Database, Transaction } from "@/server/db/database";
import { user } from "@/server/db/schema";
import type { SignedInUser } from "@/server/operations/session";

/**
 * Whether the consent sheet must come before the user's next Consultation: they've never agreed to
 * the photo notice, have withdrawn photo consent, or agreed to an older photo notice.
 */
export function needsPhotoConsent(signedIn: Pick<SignedInUser, "photoConsent">): boolean {
  return signedIn.photoConsent?.noticeVersion !== PHOTO_NOTICE_VERSION;
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

/** Forgets the user's agreement, so the consent sheet comes back before their next Consultation. */
export async function clearPhotoConsent(db: Database, userId: string): Promise<void> {
  await db.update(user).set({ acceptedPhotoNoticeVersion: null, photoNoticeAcceptedAt: null }).where(eq(user.id, userId));
}
