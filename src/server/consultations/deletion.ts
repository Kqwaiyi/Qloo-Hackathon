import { and, eq } from "drizzle-orm";

import { consultationFolder } from "@/server/consultations/blob-pathnames";
import { consultation, styling } from "@/server/db/schema";
import type { OperationContext } from "@/server/operations/context";
import { finishStyling } from "@/server/stylings/steps";

/**
 * Deletes a Consultation of this user's for good, even while it's Styling, returning false if they
 * have no such Consultation (any more). It's the deletion behind deleting a Consultation and
 * withdrawing photo consent, for a user the caller has already found: it checks no sign-in.
 *
 * A running Styling's Workflow run is cancelled first. Then its Stylings, Style Icons, Outfits and
 * Pieces go, with everything in its Blob folder, its photo and Previews included. Throws, keeping the
 * Consultation with its Styling stopped, when its Blob objects can't be deleted.
 */
export async function deleteConsultationOf(
  ctx: Pick<OperationContext, "db" | "blob" | "clock" | "stylings">,
  { userId, consultationId }: { userId: string; consultationId: string },
): Promise<boolean> {
  // A running Styling stops first, as a stuck one does: its run is cancelled, so it starts no more
  // steps, and it's finished, so a step under way saves nothing. A run that can't be cancelled
  // doesn't keep the Consultation, since its steps find the Styling no longer running.
  const runningStylings = await ctx.db
    .select({ id: styling.id, workflowRunId: styling.workflowRunId })
    .from(styling)
    .where(and(eq(styling.consultationId, consultationId), eq(styling.userId, userId), eq(styling.status, "running")));
  for (const runningStyling of runningStylings) {
    if (runningStyling.workflowRunId) {
      await ctx.stylings.cancel(runningStyling.workflowRunId).catch((error: unknown) => {
        console.error("A Styling's run couldn't be cancelled:", error instanceof Error ? error.message : "unknown error");
      });
    }
    await finishStyling(ctx, runningStyling.id, "broke");
  }

  // The Blob folder goes in the rows' transaction, which holds them meanwhile: a Blob delete that
  // fails keeps the Consultation, its Styling stopped, to delete again. A Preview that a step under
  // way stores after the folder goes is deleted by that step, which finds its Styling gone.
  return ctx.db.transaction(async (tx) => {
    // Its Stylings, Style Icons, Outfits and Pieces go with it.
    const [row] = await tx
      .delete(consultation)
      .where(and(eq(consultation.id, consultationId), eq(consultation.userId, userId)))
      .returning({ id: consultation.id });
    if (!row) return false;
    await ctx.blob.deleteFolder(consultationFolder(consultationId));
    return true;
  });
}
