import { eq } from "drizzle-orm";

import { user } from "@/server/db/schema";
import type { OperationContext } from "@/server/operations/context";

/**
 * Better Auth's session hooks: a session of the user's was just created (signing up or in, or a
 * verification link) or refreshed (using the app, at most once a day), so the user is active now.
 * The daily sweep's inactivity rules count from this, and any inactivity warning no longer holds.
 */
export async function recordActivity(ctx: Pick<OperationContext, "db" | "clock">, userId: string): Promise<void> {
  await ctx.db.update(user).set({ lastActiveAt: ctx.clock.now(), inactivityWarningSentAt: null }).where(eq(user.id, userId));
}
