import { and, eq } from "drizzle-orm";

import { isStuck } from "@/config/stylings";
import { styling } from "@/server/db/schema";
import type { OperationContext } from "@/server/operations/context";

import { finishStyling } from "./steps";

/**
 * Cancels a Styling's Workflow run, so it starts no more steps. A run that can't be cancelled, such
 * as one that has already ended, is logged and left: its steps find the Styling no longer running.
 */
export async function cancelWorkflowRun(ctx: Pick<OperationContext, "stylings">, workflowRunId: string): Promise<void> {
  await ctx.stylings.cancel(workflowRunId).catch((error: unknown) => {
    console.error("A Styling's Workflow run couldn't be cancelled:", error instanceof Error ? error.message : "unknown error");
  });
}

/**
 * The stuck check, which runs whenever something reads a Styling's status: finishes the user's
 * running Stylings whose stage hasn't moved for STUCK_STYLING_MS, or only the one on
 * `consultationId`. Each finishes as any Styling does, keeping what it made, and its Workflow run
 * is cancelled if it's still alive. That releases both Styling locks without a cron job.
 */
export async function finishStuckStylings(
  ctx: Pick<OperationContext, "db" | "clock" | "stylings">,
  { userId, consultationId }: { userId: string; consultationId?: string },
): Promise<void> {
  const now = ctx.clock.now();
  const running = await ctx.db
    .select({ id: styling.id, stageMovedAt: styling.stageMovedAt, workflowRunId: styling.workflowRunId })
    .from(styling)
    .where(
      and(
        eq(styling.userId, userId),
        consultationId === undefined ? undefined : eq(styling.consultationId, consultationId),
        eq(styling.status, "running"),
      ),
    );
  for (const stuck of running.filter(({ stageMovedAt }) => isStuck(stageMovedAt, now))) {
    // Finished first, holding the Styling, so one whose stage has just moved carries on, its
    // Workflow run too. Once finished, a step still under way saves nothing.
    const finished = await finishStyling(ctx, stuck.id, "stuck");
    if (finished && stuck.workflowRunId) await cancelWorkflowRun(ctx, stuck.workflowRunId);
  }
}
