import { and, asc, eq, gt, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { type UsageKind, USAGE_LIMITS, USAGE_WINDOW_HOURS } from "@/config/limits";
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
 * What a user has left of one limit now: some, or none until `moreFrom`. More become available
 * once the use holding the limit leaves the rolling window, which is the oldest counted while the
 * limit isn't exceeded. `moreFrom` is null only while nothing counts.
 */
export type UsageLeft = { usedUp: false; left: number; moreFrom: Date | null } | { usedUp: true; left: 0; moreFrom: Date };

/** What the user's uses of this kind in the rolling window up to `at` leave of its limit. */
export async function readUsageLeft(db: Database | Transaction, { kind, userId, at }: Usage): Promise<UsageLeft> {
  const counted = await db
    .select({ usedAt: usageRecord.usedAt })
    .from(usageRecord)
    .where(
      and(
        eq(usageRecord.userId, userId),
        eq(usageRecord.kind, kind),
        gt(usageRecord.usedAt, new Date(at.getTime() - WINDOW_MS)),
        lte(usageRecord.usedAt, at),
      ),
    )
    .orderBy(asc(usageRecord.usedAt));
  const limit = USAGE_LIMITS[kind];
  const holding = counted[Math.max(0, counted.length - limit)];
  const moreFrom = holding ? new Date(holding.usedAt.getTime() + WINDOW_MS) : null;
  if (counted.length >= limit && moreFrom) return { usedUp: true, left: 0, moreFrom };
  return { usedUp: false, left: limit - counted.length, moreFrom };
}
