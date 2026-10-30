import { and, asc, eq, lte } from "drizzle-orm";

import { GUEST_CONSULTATION_LIFETIME_SECONDS } from "@/config/guests";
import { type AccountDeletionContext, deleteAccountOf } from "@/server/accounts/deletion";
import { styling, user } from "@/server/db/schema";
import type { OperationContext } from "@/server/operations/context";
import { finishStuckStylings } from "@/server/stylings/stop";
import { purgeGuestUsageRecords } from "@/server/usage/guest-records";

// The guest cleanup (ADR-0013): a Guest Consultation is kept for an hour, then deleted with
// everything in it. There's no hourly cron, so opening the Guest Page and starting a Guest
// Consultation leave it for once their response has gone, and the daily sweep runs it too, so
// deletion always comes within 24 hours.

/** What the guest cleanup needs: an account's deletion, which a guest user's reuses. */
export type GuestCleanupContext = AccountDeletionContext & Pick<OperationContext, "auth">;

/** What a guest cleanup did. */
export interface GuestCleanup {
  guestUsersDeleted: number;
  /** The Guest Page's guest usage records, with the IP hashes they hold, once 24 hours old. */
  guestUsageRecordsPurged: number;
  /** Guest users it couldn't delete, each logged. They're still due, so the next cleanup tries them again. */
  failures: number;
}

/**
 * Deletes every guest user whose Guest Consultation is GUEST_CONSULTATION_LIFETIME_SECONDS old or
 * more, as an account's deletion does, which deletes the Consultation with its photo and Previews.
 * The guest user is made with its Guest Consultation, in one transaction, so it's as old. One whose
 * Styling is running stays until it has finished, so no Workflow is broken: the stuck check finishes
 * a stuck one first, as it would for the Guest, so a Styling stuck past its threshold doesn't count.
 * Then purges the guest usage records GUEST_USAGE_RECORD_LIFETIME_HOURS old, which no limit counts.
 */
export async function cleanUpGuests(ctx: GuestCleanupContext): Promise<GuestCleanup> {
  const now = ctx.clock.now();
  const madeBy = new Date(now.getTime() - GUEST_CONSULTATION_LIFETIME_SECONDS * 1000);
  const due = await ctx.db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.isGuest, true), lte(user.createdAt, madeBy)))
    .orderBy(asc(user.createdAt));
  const cleanup = { guestUsersDeleted: 0, guestUsageRecordsPurged: 0, failures: 0 };
  for (const { id } of due) {
    try {
      await finishStuckStylings(ctx, { userId: id });
      if ((await ctx.db.$count(styling, and(eq(styling.userId, id), eq(styling.status, "running")))) > 0) continue;
      await deleteAccountOf(ctx, id);
      cleanup.guestUsersDeleted += 1;
    } catch (error) {
      // Such as Blob storage failing this one: the others may still go. Logged without whose it was.
      cleanup.failures += 1;
      console.error("The guest cleanup couldn't delete a guest user:", error instanceof Error ? error.message : "unknown error");
    }
  }
  cleanup.guestUsageRecordsPurged = await purgeGuestUsageRecords(ctx.db, now);
  return cleanup;
}

/** Leaves the guest cleanup for once the response has gone, so the Guest never waits on it. */
export function cleanUpGuestsAfterResponse(ctx: GuestCleanupContext & Pick<OperationContext, "afterResponse">): void {
  ctx.afterResponse(async () => {
    await cleanUpGuests(ctx);
  });
}
