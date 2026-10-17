import { and, asc, count, eq, gt, gte, lte, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { APP_WIDE_24_HOUR_CAP, APP_WIDE_MONTHLY_CAP, type UsageKind, USAGE_LIMITS, USAGE_WINDOW_HOURS } from "@/config/limits";
import { startOfUtcMonth } from "@/server/clock";
import type { Database, Transaction } from "@/server/db/database";
import { usageRecord } from "@/server/db/schema";

const WINDOW_MS = USAGE_WINDOW_HOURS * 60 * 60 * 1000;

/** One kind of usage by one user at a time: what a usage record holds. */
export interface Usage {
  kind: UsageKind;
  userId: string;
  at: Date;
}

/** Records `count` uses: one usage record each. */
export async function recordUsage(db: Database | Transaction, { kind, userId, at }: Usage, count = 1): Promise<void> {
  await db.insert(usageRecord).values(Array.from({ length: count }, () => ({ id: randomUUID(), kind, userId, usedAt: at })));
}

/**
 * What's left of one limit over the rolling window now: some, or none until `moreFrom`. More become
 * available once the use holding the limit leaves the window, which is the oldest counted while
 * the limit isn't exceeded. `moreFrom` is null only while nothing counts.
 */
export type UsageLeft = { usedUp: false; left: number; moreFrom: Date | null } | { usedUp: true; left: 0; moreFrom: Date };

/** What the user's uses of this kind in the rolling window up to `at` leave of its limit. */
export function readUsageLeft(db: Database | Transaction, { kind, userId, at }: Usage): Promise<UsageLeft> {
  return readLeftInWindow(db, and(eq(usageRecord.userId, userId), eq(usageRecord.kind, kind)), USAGE_LIMITS[kind], at);
}

/** What the app-wide caps leave of the Outfits every user together may have made, up to `at`. */
export interface AppWideOutfitsLeft {
  /** What the 24-hour cap leaves, in the rolling window. */
  inWindow: UsageLeft;
  /** How many the monthly cap leaves, in `at`'s UTC calendar month. */
  inMonth: number;
}

/** What every user's Outfits up to `at`, deleted accounts' included, leave of the app-wide caps. */
export async function readAppWideOutfitsLeft(db: Database | Transaction, at: Date): Promise<AppWideOutfitsLeft> {
  const outfits = eq(usageRecord.kind, "outfit");
  const [inWindow, [inMonth]] = await Promise.all([
    readLeftInWindow(db, outfits, APP_WIDE_24_HOUR_CAP, at),
    db
      .select({ made: count() })
      .from(usageRecord)
      .where(and(outfits, gte(usageRecord.usedAt, startOfUtcMonth(at)), lte(usageRecord.usedAt, at))),
  ]);
  return { inWindow, inMonth: Math.max(0, APP_WIDE_MONTHLY_CAP - (inMonth?.made ?? 0)) };
}

/** What the uses `counting` selects in the rolling window up to `at` leave of `limit`. */
async function readLeftInWindow(db: Database | Transaction, counting: SQL | undefined, limit: number, at: Date): Promise<UsageLeft> {
  const counted = await db
    .select({ usedAt: usageRecord.usedAt })
    .from(usageRecord)
    .where(and(counting, gt(usageRecord.usedAt, new Date(at.getTime() - WINDOW_MS)), lte(usageRecord.usedAt, at)))
    .orderBy(asc(usageRecord.usedAt));
  const holding = counted[Math.max(0, counted.length - limit)];
  const moreFrom = holding ? new Date(holding.usedAt.getTime() + WINDOW_MS) : null;
  if (counted.length >= limit && moreFrom) return { usedUp: true, left: 0, moreFrom };
  return { usedUp: false, left: limit - counted.length, moreFrom };
}
