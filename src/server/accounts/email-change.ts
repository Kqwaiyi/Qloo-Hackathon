import { and, eq, gt } from "drizzle-orm";

import { type EmailChangeStep, VERIFICATION_LINK_LIFETIME_SECONDS } from "@/config/accounts";
import type { Database } from "@/server/db/database";
import { emailChange } from "@/server/db/schema";

/** A verified user's email change, waiting on the link of its step. */
export interface PendingEmailChange {
  newEmail: string;
  step: EmailChangeStep;
}

/** The user's email change while its step's link still works, or null. */
export async function findPendingEmailChange(db: Database, userId: string, now: Date): Promise<PendingEmailChange | null> {
  const linksSentSince = new Date(now.getTime() - VERIFICATION_LINK_LIFETIME_SECONDS * 1000);
  const [pending] = await db
    .select({ newEmail: emailChange.newEmail, step: emailChange.step })
    .from(emailChange)
    .where(and(eq(emailChange.userId, userId), gt(emailChange.linkSentAt, linksSentSince)));
  return pending ?? null;
}

/** Records that a step's link went out, replacing any earlier change of this user's. */
export async function recordEmailChangeStep(
  db: Database,
  { userId, newEmail, step, at }: { userId: string; newEmail: string; step: EmailChangeStep; at: Date },
): Promise<void> {
  const values = { newEmail: newEmail.toLowerCase(), step, linkSentAt: at };
  await db
    .insert(emailChange)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: emailChange.userId, set: values });
}

/** Once the email has changed, nothing waits any more. */
export async function endEmailChange(db: Database, userId: string): Promise<void> {
  await db.delete(emailChange).where(eq(emailChange.userId, userId));
}
