import { and, eq, ne, sql } from "drizzle-orm";
import * as z from "zod";

import { type BudgetTier, type ConsultationState, isSamePhotoStyle, PHOTO_STYLES, type PhotoStyleWords } from "@/config/consultations";
import { SLOW_STEP_MS, type StylingKind, type StylingStage } from "@/config/stylings";
import type { Transaction } from "@/server/db/database";
import { consultation, outfit, styling } from "@/server/db/schema";
import type { OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import type { PhotoCategoryFacts } from "@/server/outfit-assembly/categories";
import { productSearchMarket } from "@/server/outfit-assembly/markets";
import { hasCurrentStyleIconLeft, readCurrentStyleIconList } from "@/server/stylings/current-outfits";
import { readLatestFailedStyling } from "@/server/stylings/failed";
import {
  AlreadyStylingError,
  checkStylingStart,
  createStyling,
  launchStyling,
  type NewStyling,
  type StylingStartRefusal,
} from "@/server/stylings/start";
import { outfitsStage } from "@/server/stylings/steps";
import { finishStuckStylings } from "@/server/stylings/stop";

/**
 * Why a Styling on a Consultation didn't start, whatever its kind. A Consultation that isn't the
 * user's is not found, just like one that doesn't exist.
 */
export type ConsultationStylingRefusal = { refusal: "signed-out" | "not-found" } | StylingStartRefusal;

/** Why "Show 2 more Outfits" didn't start. */
export type ShowMoreOutfitsRefusal =
  | ConsultationStylingRefusal
  /** Every one of the Consultation's current Style Icons has inspired an Outfit or been passed over. */
  | { refusal: "every-outfit-built" };

/**
 * "Show 2 more Outfits": through the shared start check, starts a Styling that builds as many more
 * Outfits as that check allows from the Consultation's next unused Style Icons. They're added below
 * its current Outfits, which stay meanwhile, all at once when it finishes.
 */
export async function showMoreOutfits(ctx: OperationContext, consultationId: string): Promise<Result<object, ShowMoreOutfitsRefusal>> {
  return startStylingOn(ctx, consultationId, async (tx, current) => {
    if (!(await hasCurrentStyleIconLeft(tx, consultationId))) return { ok: false, refusal: "every-outfit-built" };
    return { ok: true, kind: "more", budgetTier: current.budgetTier, photoStyle: current.photoStyle, stage: outfitsStage(current) };
  });
}

/** What "Change the Photo Style" sends: 1 or 2 different words from the list, strongest first. */
export const photoStyleWordsSchema = z
  .union([z.tuple([z.enum(PHOTO_STYLES)]), z.tuple([z.enum(PHOTO_STYLES), z.enum(PHOTO_STYLES)])])
  .refine((words) => new Set(words).size === words.length, "The words must be different.");

/** Why a Photo Style change didn't start. */
export type ChangePhotoStyleRefusal =
  | ConsultationStylingRefusal
  /** It's the Consultation's Photo Style already, in whatever order: there's nothing to change. */
  | { refusal: "same-photo-style" };

/**
 * Changes the Photo Style: through the shared start check, starts a Styling that asks Qloo for new
 * Style Icons in tune with `photoStyle` and builds as many Outfits from them as that check allows.
 * If it builds any, they replace the current Outfits, with its Style Icons and the Photo Style, all
 * at once when it finishes. If it builds none, the Consultation keeps what it had.
 */
export async function changePhotoStyle(
  ctx: OperationContext,
  consultationId: string,
  photoStyle: PhotoStyleWords,
): Promise<Result<object, ChangePhotoStyleRefusal>> {
  return startStylingOn(ctx, consultationId, async (_tx, current) => {
    if (isSamePhotoStyle(current.photoStyle, photoStyle)) return { ok: false, refusal: "same-photo-style" };
    return { ok: true, kind: "photo_style_change", budgetTier: current.budgetTier, photoStyle, stage: "style_icons" };
  });
}

/** Why a Budget Tier change didn't start. */
export type ChangeBudgetTierRefusal =
  | ConsultationStylingRefusal
  /** It's a Face Photo's: a Hairstyle has no price, so there's no Budget Tier to change. */
  | { refusal: "no-budget-tier" }
  /** It's the Consultation's Budget Tier already: there's nothing to change. */
  | { refusal: "same-budget-tier" };

/**
 * Changes the Budget Tier: through the shared start check, starts a Styling that builds as many
 * Outfits as that check allows at `budgetTier`, from the top of the current Style Icons. If it
 * builds any, they replace the current Outfits, with the Budget Tier, all at once when it
 * finishes. If it builds none, the Consultation keeps what it had.
 */
export async function changeBudgetTier(
  ctx: OperationContext,
  consultationId: string,
  budgetTier: BudgetTier,
): Promise<Result<object, ChangeBudgetTierRefusal>> {
  return startStylingOn<ChangeBudgetTierRefusal>(ctx, consultationId, async (tx, current) => {
    if (current.budgetTier === null) return { ok: false, refusal: "no-budget-tier" };
    if (current.budgetTier === budgetTier) return { ok: false, refusal: "same-budget-tier" };
    const change = { kind: "budget_tier_change", budgetTier, photoStyle: current.photoStyle } as const;
    const currentList = await readCurrentStyleIconList(tx, consultationId);
    // With none to build from, it finds its own, as a first Styling does.
    if (!currentList) return { ok: true, ...change, stage: "style_icons" };
    return { ok: true, ...change, stage: outfitsStage(current), copiesStyleIconList: { from: currentList, statuses: "unused" } };
  });
}

/** Why Try again didn't start. */
export type TryAgainRefusal =
  | ConsultationStylingRefusal
  /**
   * The Consultation's latest Styling didn't break, or was "Show 2 more Outfits", whose failure
   * only ends it: there's nothing to try again.
   */
  | { refusal: "nothing-to-try-again" };

/**
 * Try again, once the Consultation's latest Styling broke: through the shared start check, starts a
 * Styling that picks up where that one stopped, never checking the photo again. It finds Style
 * Icons only if the broken one hadn't, and otherwise carries on down its list, for the same Budget
 * Tier and Photo Style. Its Outfits switch in as the broken one's would have.
 */
export async function tryAgain(ctx: OperationContext, consultationId: string): Promise<Result<object, TryAgainRefusal>> {
  return startStylingOn<TryAgainRefusal>(ctx, consultationId, async (tx, current) => {
    const failed = await readLatestFailedStyling(tx, consultationId);
    if (failed?.reason !== "something_broke") return { ok: false, refusal: "nothing-to-try-again" };
    const tryingAgain = { kind: "try_again", budgetTier: failed.budgetTier, photoStyle: failed.photoStyle } as const;
    // It broke before saving any Style Icons: find them, as it would have.
    if (failed.stage === "style_icons") return { ok: true, ...tryingAgain, stage: "style_icons" };
    // Brands aren't saved, so a body photo's are fetched again, from Qloo's cache, even if it broke
    // tailoring: Brands and tailoring are both the checklist's Building Outfits.
    return { ok: true, ...tryingAgain, stage: outfitsStage(current), copiesStyleIconList: { from: failed.stylingId, statuses: "kept" } };
  });
}

/** What a Styling on a Consultation builds, as the operation starting it decides. */
type StylingPlan = Pick<NewStyling, "kind" | "budgetTier" | "photoStyle" | "stage" | "copiesStyleIconList">;

/** What an operation starting a Styling decides from: the Consultation as it stands. */
type CurrentConsultation = PhotoCategoryFacts & Pick<NewStyling, "budgetTier" | "photoStyle">;

/**
 * Starts a Styling on one of the signed-in user's own Consultations, after the shared start check,
 * once no Styling runs on it. `plan` says what it builds, or why it can't start, holding the
 * Consultation's row to the end of the transaction, so of two presses at once the second finds it
 * Styling. One started meanwhile on another of the user's Consultations, past the shared start
 * check's lock, is caught by the database's.
 */
async function startStylingOn<R extends { refusal: string }>(
  ctx: OperationContext,
  consultationId: string,
  plan: (tx: Transaction, current: CurrentConsultation) => Promise<Result<StylingPlan, R>>,
): Promise<Result<object, ConsultationStylingRefusal | R>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };
  const stylingStart = await checkStylingStart(ctx, user);
  if (!stylingStart.ok) return stylingStart;
  let started: Result<{ stylingId: string }, ConsultationStylingRefusal | R>;
  try {
    started = await ctx.db.transaction(async (tx): Promise<typeof started> => {
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
      const planned = await plan(tx, row);
      if (!planned.ok) return planned;
      const { ok: _, ...stylingPlan } = planned;
      const stylingId = await createStyling(tx, ctx.clock.now(), {
        ...stylingPlan,
        consultationId,
        userId: user.id,
        onDemoAccount: user.isDemoAccount,
        outfitsWanted: stylingStart.outfitsWanted,
        market: productSearchMarket(user.countryCode),
      });
      return { ok: true, stylingId };
    });
  } catch (error) {
    // A Styling on another of the user's Consultations started since the shared start check.
    if (!(error instanceof AlreadyStylingError)) throw error;
    started = { ok: false, refusal: "already-styling" };
  }
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
  ctx: Pick<OperationContext, "auth" | "db" | "clock" | "stylings" | "requestHeaders">,
  consultationId: string,
): Promise<StylingStatusView | null> {
  const user = await readSignedInUser(ctx);
  if (!user) return null;
  // Its Styling, if it's stuck, finishes: the page polling it then shows how it ended.
  await finishStuckStylings(ctx, { userId: user.id, consultationId });
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
