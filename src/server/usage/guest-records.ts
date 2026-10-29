import { and, asc, eq, lte, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { GUEST_USAGE_LIMITS, GUEST_USAGE_RECORD_LIFETIME_HOURS, type GuestUsageKind } from "@/config/limits";
import type { Database, Transaction } from "@/server/db/database";
import { guestUsageRecord, outfit, user } from "@/server/db/schema";

import { inUsageWindow, type UsageLeft, usageLeftOf } from "./records";

// Guest usage records, which the Guest Page's daily limit counts: one internet address's Guest
// Consultations and photo checks, by the address's IP hash.

/** One kind of guest usage from one internet address, by its IP hash, at a time: what a guest usage record holds. */
export interface GuestUsage {
  kind: GuestUsageKind;
  ipHash: string;
  at: Date;
}

/** Records one use. */
export async function recordGuestUsage(db: Database | Transaction, { kind, ipHash, at }: GuestUsage): Promise<void> {
  await db.insert(guestUsageRecord).values({ id: randomUUID(), kind, ipHash, usedAt: at });
}

/** What the address's uses of this kind in the rolling window up to `at` leave of its limit. */
export async function readGuestUsageLeft(db: Database | Transaction, { kind, ipHash, at }: GuestUsage): Promise<UsageLeft> {
  const counted = await db
    .select({ usedAt: guestUsageRecord.usedAt })
    .from(guestUsageRecord)
    .where(and(eq(guestUsageRecord.ipHash, ipHash), eq(guestUsageRecord.kind, kind), inUsageWindow(guestUsageRecord.usedAt, at)))
    .orderBy(asc(guestUsageRecord.usedAt));
  return usageLeftOf(counted, GUEST_USAGE_LIMITS[kind]);
}

/** Purges the guest usage records GUEST_USAGE_RECORD_LIFETIME_HOURS old or more at `now`, which no limit counts any more, returning how many. */
export async function purgeGuestUsageRecords(db: Database, now: Date): Promise<number> {
  const purged = await db
    .delete(guestUsageRecord)
    .where(lte(guestUsageRecord.usedAt, new Date(now.getTime() - GUEST_USAGE_RECORD_LIFETIME_HOURS * 60 * 60 * 1000)))
    .returning({ id: guestUsageRecord.id });
  return purged.length;
}

/**
 * As a Styling's Outfits are shown at `at`, in the transaction recording their Outfit usage: counts
 * a guest user's Guest Consultation against the address it was made from, when they're its first
 * Outfits shown, a first Styling's or a Try again's. An account's Consultation counts nothing here.
 */
export async function countGuestConsultation(
  tx: Transaction,
  { userId, consultationId, stylingId }: { userId: string; consultationId: string; stylingId: string },
  at: Date,
): Promise<void> {
  const [guest] = await tx.select({ ipHash: user.guestIpHash }).from(user).where(and(eq(user.id, userId), eq(user.isGuest, true)));
  if (!guest?.ipHash) return;
  // Only a Styling that made Outfits has any, so another Styling's were shown before.
  const shownBefore = await tx.$count(outfit, and(eq(outfit.consultationId, consultationId), ne(outfit.stylingId, stylingId)));
  if (shownBefore === 0) await recordGuestUsage(tx, { kind: "guest_consultation", ipHash: guest.ipHash, at });
}
