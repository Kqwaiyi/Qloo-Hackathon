import type { Database } from "@/server/db/database";
import { qlooLimitState } from "@/server/db/schema";

/** What Qloo last reported of this month's calls, which the Qloo backstop reads. */
export interface QlooLimitState {
  /** The calls left this month. */
  remainingCalls: number;
  /** When they reset, or null when Qloo didn't say. */
  resetsAt: Date | null;
  /** When Qloo reported it. */
  observedAt: Date;
}

/** Keeps Qloo's newest report in place of the last. */
export async function saveQlooLimitState(db: Database, state: QlooLimitState): Promise<void> {
  await db.insert(qlooLimitState).values(state).onConflictDoUpdate({ target: qlooLimitState.id, set: state });
}

/** What Qloo last reported, or null until a live response has said. */
export async function readQlooLimitState(db: Database): Promise<QlooLimitState | null> {
  const [row] = await db
    .select({ remainingCalls: qlooLimitState.remainingCalls, resetsAt: qlooLimitState.resetsAt, observedAt: qlooLimitState.observedAt })
    .from(qlooLimitState);
  return row ?? null;
}
