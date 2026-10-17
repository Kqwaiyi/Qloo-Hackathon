import { and, eq, ne, sql } from "drizzle-orm";

import type { ConsultationState } from "@/config/consultations";
import { SLOW_STEP_MS, type StylingKind, type StylingStage } from "@/config/stylings";
import { consultation, outfit, styling } from "@/server/db/schema";
import type { OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import { hasCurrentStyleIconLeft } from "@/server/stylings/current-outfits";
import { checkStylingStart, createStyling, launchStyling, type StylingStartRefusal } from "@/server/stylings/start";
import { outfitsStage } from "@/server/stylings/steps";

/** Why "Show 2 more Outfits" didn't start. A Consultation that isn't the user's is not found, just like one that doesn't exist. */
export type ShowMoreOutfitsRefusal =
  | { refusal: "signed-out" | "not-found" }
  /** A Styling is already running on the Consultation. */
  | { refusal: "already-styling" }
  /** Every one of the Consultation's current Style Icons has inspired an Outfit or been passed over. */
  | { refusal: "every-outfit-built" }
  | StylingStartRefusal;

/**
 * "Show 2 more Outfits": through the shared start check, starts a Styling that builds as many more
 * Outfits as that check allows from the Consultation's next unused Style Icons. They're added below
 * its current Outfits, which stay meanwhile, all at once when it finishes.
 */
export async function showMoreOutfits(ctx: OperationContext, consultationId: string): Promise<Result<object, ShowMoreOutfitsRefusal>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };
  const stylingStart = await checkStylingStart(ctx, user);
  if (!stylingStart.ok) return stylingStart;
  const started = await ctx.db.transaction(async (tx): Promise<Result<{ stylingId: string }, ShowMoreOutfitsRefusal>> => {
    // Held to the end of the transaction, so of two presses at once, the second finds it Styling.
    const [row] = await tx
      .select({
        state: consultation.state,
        photoType: consultation.photoType,
        hairCovered: consultation.hairCovered,
        budgetTier: consultation.budgetTier,
        photoStyle: consultation.photoStyle,
      })
      .from(consultation)
      .where(and(eq(consultation.id, consultationId), eq(consultation.userId, user.id)))
      .for("update");
    if (!row) return { ok: false, refusal: "not-found" };
    if (row.state === "styling") return { ok: false, refusal: "already-styling" };
    if (!(await hasCurrentStyleIconLeft(tx, consultationId))) return { ok: false, refusal: "every-outfit-built" };
    const stylingId = await createStyling(tx, ctx.clock.now(), {
      consultationId,
      userId: user.id,
      kind: "more",
      budgetTier: row.budgetTier,
      photoStyle: row.photoStyle,
      outfitsWanted: stylingStart.outfitsWanted,
      stage: outfitsStage(row),
    });
    return { ok: true, stylingId };
  });
  if (!started.ok) return started;
  await launchStyling(ctx, started.stylingId);
  return { ok: true };
}

/** What a page waiting on a Consultation's Styling polls. */
export interface StylingStatusView {
  state: ConsultationState;
  /** The running Styling's progress, or null when none is running. */
  progress: StylingProgressView | null;
}

/** What the Styling checklist shows. */
export interface StylingProgressView {
  /** "Show 2 more Outfits" keeps the current Outfits in view, with a compact checklist in its place. */
  kind: StylingKind;
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
      kind: styling.kind,
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
  const { state, kind, stage, stageMovedAt, outfitsWanted, outfitsMade, previewsDone } = row;
  if (kind === null || stage === null || stageMovedAt === null || outfitsWanted === null || outfitsMade === null) {
    return { state, progress: null };
  }
  // Every Outfit is built before the Previews start, so from then on it's the Outfits made.
  const outfitCount = stage === "previews" ? outfitsMade : outfitsWanted;
  const slow = ctx.clock.now().getTime() - stageMovedAt.getTime() > SLOW_STEP_MS;
  return { state, progress: { kind, stage, previews: { done: previewsDone, of: outfitCount }, slow } };
}
