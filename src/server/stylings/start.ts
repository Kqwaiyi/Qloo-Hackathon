import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { BudgetTier, PhotoStyleWords } from "@/config/consultations";
import { OUTFITS_PER_STYLING, type StylingKind } from "@/config/stylings";
import type { Transaction } from "@/server/db/database";
import { consultation, styling } from "@/server/db/schema";
import type { OperationContext } from "@/server/operations/context";
import type { SignedInUser } from "@/server/operations/session";

import { finishStyling } from "./steps";

/**
 * Why a Styling can't start, one refusal per rule. None yet: the region gate (ticket 24), the
 * Styling locks (ticket 30) and the limits (tickets 22 and 23) each add theirs here.
 */
export type StylingStartRefusal = { refusal: never };

/**
 * The check every operation that starts a Styling runs first, before anything that costs, so each
 * rule that can stop a Styling lives in this one place. Null when a Styling may start.
 */
export async function checkStylingStart(_ctx: OperationContext, _user: SignedInUser): Promise<StylingStartRefusal | null> {
  return null;
}

export interface NewStyling {
  consultationId: string;
  userId: string;
  kind: StylingKind;
  /** What it builds for. */
  budgetTier: BudgetTier | null;
  photoStyle: PhotoStyleWords;
}

/**
 * Creates a running Styling in the caller's transaction, and shows its Consultation as Styling.
 * Once the transaction commits, `launchStyling` sets it going.
 */
export async function createStyling(tx: Transaction, now: Date, newStyling: NewStyling): Promise<string> {
  const id = randomUUID();
  await tx.insert(styling).values({
    id,
    ...newStyling,
    status: "running",
    // A first Styling starts by picking its Consultation's Style Icons.
    stage: "style_icons",
    stageMovedAt: now,
    outfitsWanted: OUTFITS_PER_STYLING,
    outfitsMade: 0,
    tailoringFailures: 0,
    startedAt: now,
  });
  await tx.update(consultation).set({ state: "styling" }).where(eq(consultation.id, newStyling.consultationId));
  return id;
}

/** Starts a created Styling's run in the background. A Styling whose run can't start has broken. */
export async function launchStyling(ctx: Pick<OperationContext, "db" | "clock" | "stylings">, stylingId: string): Promise<void> {
  let workflowRunId: string;
  try {
    workflowRunId = await ctx.stylings.start(stylingId);
  } catch (error) {
    console.error("A Styling couldn't start:", error instanceof Error ? error.message : "unknown error");
    await finishStyling(ctx, stylingId, "broke");
    return;
  }
  await ctx.db.update(styling).set({ workflowRunId }).where(eq(styling.id, stylingId));
}
