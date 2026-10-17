import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { BudgetTier, PhotoStyleWords } from "@/config/consultations";
import { OUTFITS_PER_STYLING, type StylingKind } from "@/config/stylings";
import type { Transaction } from "@/server/db/database";
import { consultation, styling } from "@/server/db/schema";
import type { OperationContext, Result } from "@/server/operations/context";
import type { SignedInUser } from "@/server/operations/session";
import { readUsageLeft } from "@/server/usage/records";

import { finishStyling } from "./steps";

/**
 * Why a Styling can't start, one refusal per rule. The region gate (ticket 24), the Styling locks
 * (ticket 30) and the app-wide caps and Qloo backstop (ticket 23) each add theirs here.
 */
export type StylingStartRefusal =
  /** The user has made every Outfit their Outfit Allowance allows in the rolling window, until `moreFrom`. */
  { refusal: "allowance-used"; moreFrom: Date };

/** A Styling may start, making at most `outfitsWanted` Outfits, or the reason it can't. */
export type StylingStart = Result<{ outfitsWanted: number }, StylingStartRefusal>;

/**
 * The check every operation that starts a Styling runs first, before anything that costs, so each
 * rule that can stop a Styling, or limit how many Outfits it makes, lives in this one place. The
 * usage summary runs it too, so the UI says what the operations will do.
 */
export async function checkStylingStart(ctx: Pick<OperationContext, "db" | "clock">, user: SignedInUser): Promise<StylingStart> {
  const outfits = await readUsageLeft(ctx.db, { kind: "outfit", userId: user.id, at: ctx.clock.now() });
  if (outfits.usedUp) return { ok: false, refusal: "allowance-used", moreFrom: outfits.moreFrom };
  // A Styling's usual number of Outfits, or what the allowance leaves if that's fewer.
  return { ok: true, outfitsWanted: Math.min(OUTFITS_PER_STYLING, outfits.left) };
}

export interface NewStyling {
  consultationId: string;
  userId: string;
  kind: StylingKind;
  /** What it builds for. */
  budgetTier: BudgetTier | null;
  photoStyle: PhotoStyleWords;
  /** How many Outfits it makes, at most: what `checkStylingStart` allowed. */
  outfitsWanted: number;
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
