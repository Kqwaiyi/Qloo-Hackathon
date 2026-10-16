import { and, eq, ne, sql } from "drizzle-orm";

import type { ConsultationState } from "@/config/consultations";
import { SLOW_STEP_MS, type StylingStage } from "@/config/stylings";
import { consultation, outfit, styling } from "@/server/db/schema";
import type { OperationContext } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";

/** What a page waiting on a Consultation's Styling polls. */
export interface StylingStatusView {
  state: ConsultationState;
  /** The running Styling's progress, or null when none is running. */
  progress: StylingProgressView | null;
}

/** What the Styling checklist shows. */
export interface StylingProgressView {
  stage: StylingStage;
  previews: PreviewsProgress;
  /** The stage has run longer than SLOW_STEP_MS: "This is taking longer than usual." */
  slow: boolean;
}

/** "Generating Previews (n of N)": the Previews done so far, of the Outfits the Styling will make. */
export interface PreviewsProgress {
  done: number;
  of: number;
}

/** The Styling status of one of the signed-in user's own Consultations, or null for anyone else's. */
export async function readStylingStatus(
  ctx: Pick<OperationContext, "auth" | "db" | "clock" | "requestHeaders">,
  consultationId: string,
): Promise<StylingStatusView | null> {
  const user = await readSignedInUser(ctx);
  if (!user) return null;
  // One statement, so the state and the running Styling's progress always agree.
  const [row] = await ctx.db
    .select({
      state: consultation.state,
      stage: styling.stage,
      stageMovedAt: styling.stageMovedAt,
      outfitsWanted: styling.outfitsWanted,
      outfitsMade: styling.outfitsMade,
      previewsDone: sql<number>`(
        select count(*)::int from ${outfit}
        where ${and(eq(outfit.stylingId, styling.id), ne(outfit.previewState, "pending"))}
      )`,
    })
    .from(consultation)
    .leftJoin(styling, and(eq(styling.consultationId, consultation.id), eq(styling.status, "running")))
    .where(and(eq(consultation.id, consultationId), eq(consultation.userId, user.id)));
  if (!row) return null;
  const { state, stage, stageMovedAt, outfitsWanted, outfitsMade, previewsDone } = row;
  if (stage === null || stageMovedAt === null || outfitsWanted === null || outfitsMade === null) return { state, progress: null };
  // Every Outfit is built before the Previews start, so from then on it's the Outfits made.
  const outfitCount = stage === "previews" ? outfitsMade : outfitsWanted;
  const slow = ctx.clock.now().getTime() - stageMovedAt.getTime() > SLOW_STEP_MS;
  return { state, progress: { stage, previews: { done: previewsDone, of: outfitCount }, slow } };
}
