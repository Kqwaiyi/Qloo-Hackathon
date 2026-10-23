import { and, desc, eq, lte, ne } from "drizzle-orm";

import type { BudgetTier, PhotoStyleWords } from "@/config/consultations";
import type { StylingFailureReason, StylingKind, StylingStage } from "@/config/stylings";
import type { Database, Transaction } from "@/server/db/database";
import { styling } from "@/server/db/schema";

/** A Styling's kind as the results page names it. A Try again builds as the Styling it tried again would have, so it's that one's kind. */
type ShownStylingKind = Exclude<StylingKind, "try_again">;

/** A failed Styling's kind, as the results page says it failed and Try again builds. */
type FailedStylingKind = Exclude<ShownStylingKind, "more">;

/**
 * The Consultation's latest Styling, when it made no Outfit, so the Consultation kept what it had.
 * A failed "Show 2 more Outfits" never is: its failure only ends it, with the run-out line in its
 * place.
 */
export interface LatestFailedStyling {
  stylingId: string;
  /** What it was. A Try again builds as the Styling it tried again would have, so it's that one's kind. */
  kind: FailedStylingKind;
  /** What it built for. */
  budgetTier: BudgetTier | null;
  photoStyle: PhotoStyleWords;
  reason: StylingFailureReason;
  /** Where it stopped. Try again picks up from there. */
  stage: StylingStage;
}

/** The Consultation's latest Styling, if it failed, as `LatestFailedStyling` describes, or null. */
export async function readLatestFailedStyling(db: Database | Transaction, consultationId: string): Promise<LatestFailedStyling | null> {
  const [latest] = await db
    .select({
      stylingId: styling.id,
      kind: styling.kind,
      budgetTier: styling.budgetTier,
      photoStyle: styling.photoStyle,
      reason: styling.failureReason,
      stage: styling.stage,
      startedAt: styling.startedAt,
    })
    .from(styling)
    .where(eq(styling.consultationId, consultationId))
    .orderBy(desc(styling.startedAt))
    .limit(1);
  // Only a failed Styling has a failure reason.
  if (!latest?.reason) return null;
  const { startedAt, ...failed } = latest;
  const kind = await readShownStylingKind(db, consultationId, { kind: failed.kind, startedAt });
  // A failed "Show 2 more Outfits" isn't one.
  return kind && kind !== "more" ? { ...failed, kind, reason: latest.reason } : null;
}

/**
 * What a Styling of `kind`, started at `startedAt`, counts as on the results page. A Try again
 * counts as the Styling it tried again. Try again starts only when the latest Styling broke, so a run
 * of Try agains all try again the Styling just before them: the latest one started by then that
 * isn't a Try again, whose own kind this then reads. Null only when there's none, as can't happen.
 */
export async function readShownStylingKind(
  db: Database | Transaction,
  consultationId: string,
  { kind, startedAt }: { kind: StylingKind; startedAt: Date },
): Promise<ShownStylingKind | null> {
  if (kind !== "try_again") return kind;
  const [triedAgain] = await db
    .select({ kind: styling.kind })
    .from(styling)
    .where(and(eq(styling.consultationId, consultationId), ne(styling.kind, "try_again"), lte(styling.startedAt, startedAt)))
    .orderBy(desc(styling.startedAt))
    .limit(1);
  return triedAgain && triedAgain.kind !== "try_again" ? triedAgain.kind : null;
}
