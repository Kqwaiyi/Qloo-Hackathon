import { and, eq, sql } from "drizzle-orm";

import type { Database, Transaction } from "@/server/db/database";
import { styling, user } from "@/server/db/schema";
import type { OperationContext, Result } from "@/server/operations/context";
import { finishStuckStylings } from "@/server/stylings/stop";
import { readGuestUsageLeft } from "@/server/usage/guest-records";

// The Guest Page's daily limit: what each internet address, by its IP hash, may have of Guest
// Consultations over the rolling window, since a Guest has no Outfit Allowance.

/** Why an internet address can't have a Guest Consultation now. */
export type GuestLimitRefusal =
  /** The address has had every photo the Guest Page's photo-check limit allows checked in the rolling window, until `moreFrom`. */
  | { refusal: "guest-photo-check-limit"; moreFrom: Date }
  /** The address has had its Guest Consultation in the rolling window, until `moreFrom`. */
  | { refusal: "guest-consultation-used"; moreFrom: Date }
  /**
   * A Guest Consultation of the address's is running: one runs at a time, so two at once can't both
   * show Outfits before either is counted. It lifts once that one's Styling finishes, or is stuck.
   */
  | { refusal: "guest-consultation-running" };

/**
 * Whether the address with this IP hash may have a Guest Consultation now, or why not: its photo
 * checks in the window, its Guest Consultation in the window, then one at a time. The stuck check
 * first finishes any of its Guest Consultations' Stylings that's stuck, so it holds nothing, and
 * what it made counts.
 */
export async function checkGuestLimits(
  ctx: Pick<OperationContext, "db" | "clock" | "stylings">,
  ipHash: string,
): Promise<Result<object, GuestLimitRefusal>> {
  const photoChecks = await readGuestUsageLeft(ctx.db, { kind: "photo_check", ipHash, at: ctx.clock.now() });
  if (photoChecks.usedUp) return { ok: false, refusal: "guest-photo-check-limit", moreFrom: photoChecks.moreFrom };
  for (const { userId } of await runningGuestStylings(ctx.db, ipHash)) await finishStuckStylings(ctx, { userId });
  return readGuestLimits(ctx.db, ipHash, ctx.clock.now());
}

/**
 * The same check again in the transaction creating a Guest Consultation, before its guest user,
 * holding the address's lock until the transaction ends. Of two "Get my Outfits" at once from one
 * address, both past `checkGuestLimits`, the second waits for the first to commit, then finds its
 * Styling running.
 */
export async function lockGuestLimits(tx: Transaction, ipHash: string, now: Date): Promise<Result<object, GuestLimitRefusal>> {
  await tx.execute(sql`select pg_advisory_xact_lock(${GUEST_IP_LOCK}, hashtext(${ipHash}))`);
  return readGuestLimits(tx, ipHash, now);
}

// The first key of each address's lock, the second being its IP hash's. It only has to be unique
// among the app's two-key advisory locks, which never meet its one-key ones.
const GUEST_IP_LOCK = 1_801_200_404;

async function readGuestLimits(db: Database | Transaction, ipHash: string, now: Date): Promise<Result<object, GuestLimitRefusal>> {
  const consultations = await readGuestUsageLeft(db, { kind: "guest_consultation", ipHash, at: now });
  if (consultations.usedUp) return { ok: false, refusal: "guest-consultation-used", moreFrom: consultations.moreFrom };
  if ((await runningGuestStylings(db, ipHash)).length > 0) return { ok: false, refusal: "guest-consultation-running" };
  return { ok: true };
}

/** The running Stylings of the guest users made from the address with this IP hash: at most one each. */
function runningGuestStylings(db: Database | Transaction, ipHash: string): Promise<{ userId: string }[]> {
  return db
    .select({ userId: styling.userId })
    .from(styling)
    .innerJoin(user, eq(user.id, styling.userId))
    .where(and(eq(user.guestIpHash, ipHash), eq(styling.status, "running")));
}
