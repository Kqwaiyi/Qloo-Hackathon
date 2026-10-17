import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { BudgetTier, PhotoStyleWords } from "@/config/consultations";
import { QLOO_BACKSTOP_CALLS } from "@/config/limits";
import { OUTFITS_PER_STYLING, type StylingKind, type StylingStage } from "@/config/stylings";
import { startOfNextUtcMonth } from "@/server/clock";
import type { Transaction } from "@/server/db/database";
import { consultation, styling } from "@/server/db/schema";
import type { OperationContext, Result } from "@/server/operations/context";
import type { SignedInUser } from "@/server/operations/session";
import { type QlooLimitState, readQlooLimitState } from "@/server/qloo/limit-state";
import { isFromSupportedRegion } from "@/server/region-gate";
import { readAppWideOutfitsLeft, readUsageLeft } from "@/server/usage/records";

import { finishStyling } from "./steps";

/** Why a Styling can't start, one refusal per rule. The Styling locks (ticket 30) add theirs here. */
export type StylingStartRefusal =
  /** The request comes from a country Gemini doesn't serve, by its IP address. */
  | { refusal: "unsupported-region" }
  /** The user has made every Outfit their Outfit Allowance allows in the rolling window, until `moreFrom`. */
  | { refusal: "allowance-used"; moreFrom: Date }
  /** Every user together has made as many Outfits in the rolling window as the app-wide 24-hour cap allows. */
  | { refusal: "app-wide-24-hour-cap" }
  /** Every user together has made as many Outfits this UTC calendar month as the monthly cap allows, until `backOn`, when the next starts. */
  | { refusal: "app-wide-monthly-cap"; backOn: Date }
  /** Qloo last reported fewer calls left this month than the Qloo backstop needs, until `backOn`, when they reset. */
  | { refusal: "qloo-backstop"; backOn: Date };

/** A Styling may start, making at most `outfitsWanted` Outfits, or the reason it can't. */
export type StylingStart = Result<{ outfitsWanted: number }, StylingStartRefusal>;

/**
 * The check every operation that starts a Styling runs first, before anything that costs, so each
 * rule that can stop a Styling, or limit how many Outfits it makes, lives in this one place. The
 * usage summary runs it too, so the UI says what the operations will do.
 *
 * The region gate comes first, since every Styling calls Gemini, and it holds wherever the request
 * comes from rather than until a time. Start a Consultation also runs it itself, just before this,
 * since photo consent comes between the region gate and the limits. When several limits are in force, the refusal is the one
 * that lifts last, so a user is never told to come back while another still holds. The 24-hour
 * cap's wording gives no time, but it lifts as the Outfit Allowance does, once the Outfit holding it
 * has counted for 24 hours. On a tie, the app-wide limits come first: they're not the user's doing.
 */
export async function checkStylingStart(
  ctx: Pick<OperationContext, "db" | "clock" | "requestHeaders">,
  user: SignedInUser,
): Promise<StylingStart> {
  if (!isFromSupportedRegion(ctx.requestHeaders)) return { ok: false, refusal: "unsupported-region" };
  const now = ctx.clock.now();
  const [outfits, appWide, qloo] = await Promise.all([
    readUsageLeft(ctx.db, { kind: "outfit", userId: user.id, at: now }),
    readAppWideOutfitsLeft(ctx.db, now),
    readQlooLimitState(ctx.db),
  ]);
  const inForce: { liftsAt: Date; refusal: StylingStartRefusal }[] = [];
  if (appWide.inMonth === 0) {
    const backOn = startOfNextUtcMonth(now);
    inForce.push({ liftsAt: backOn, refusal: { refusal: "app-wide-monthly-cap", backOn } });
  }
  const qlooResets = qlooBackstopLiftsAt(qloo, now);
  if (qlooResets) inForce.push({ liftsAt: qlooResets, refusal: { refusal: "qloo-backstop", backOn: qlooResets } });
  if (appWide.inWindow.usedUp) inForce.push({ liftsAt: appWide.inWindow.moreFrom, refusal: { refusal: "app-wide-24-hour-cap" } });
  if (outfits.usedUp) inForce.push({ liftsAt: outfits.moreFrom, refusal: { refusal: "allowance-used", moreFrom: outfits.moreFrom } });
  const liftsLast = inForce.sort((a, b) => b.liftsAt.getTime() - a.liftsAt.getTime())[0];
  if (liftsLast) return { ok: false, ...liftsLast.refusal };
  // A Styling's usual number of Outfits, or what the allowance or the caps leave if that's fewer.
  return { ok: true, outfitsWanted: Math.min(OUTFITS_PER_STYLING, outfits.left, appWide.inWindow.left, appWide.inMonth) };
}

/**
 * When the Qloo backstop lifts, while Qloo's last report leaves fewer calls than it needs, or null.
 * That's when Qloo's calls reset, or the next UTC calendar month after the report when Qloo didn't
 * say: no Styling calls Qloo while it holds, so no newer report would come to lift it.
 */
function qlooBackstopLiftsAt(state: QlooLimitState | null, now: Date): Date | null {
  if (!state || state.remainingCalls >= QLOO_BACKSTOP_CALLS) return null;
  const liftsAt = state.resetsAt ?? startOfNextUtcMonth(state.observedAt);
  return now < liftsAt ? liftsAt : null;
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
  /**
   * Where it starts: a first Styling ranks its Consultation's Style Icons, and "Show 2 more Outfits"
   * carries on down them from Brands, or from Building Outfits for a Face Photo.
   */
  stage: StylingStage;
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
