import { and, eq, like } from "drizzle-orm";

import type { Clock } from "@/server/clock";
import type { Database } from "@/server/db/database";
import { user, verification } from "@/server/db/schema";

/**
 * Better Auth keeps each reset link as a verification row: this prefix and the token, holding the
 * user's id. That holds while `verification.storeIdentifier` stays unset, as the reset tests check.
 */
const RESET_TOKEN_PREFIX = "reset-password:";

/**
 * Better Auth's `onPasswordReset`, after a reset by our form or a direct call. Better Auth has
 * already set the password, spent the link and revoked every session. Opening the link proved the
 * user gets the address's mail, and any other reset link they were sent stops working.
 */
export function passwordResetFinisher(db: Database, clock: Clock) {
  return async ({ user: { id } }: { user: { id: string } }): Promise<void> => {
    await db.transaction(async (tx) => {
      await tx.update(user).set({ emailVerified: true, updatedAt: clock.now() }).where(eq(user.id, id));
      await tx.delete(verification).where(and(like(verification.identifier, `${RESET_TOKEN_PREFIX}%`), eq(verification.value, id)));
    });
  };
}
