import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as z from "zod";

import {
  BUDGET_TIERS,
  type BudgetTier,
  byCategoryOrder,
  type ConsultationState,
  DEFAULT_BUDGET_TIER,
  hasBudgetTier,
  PHOTO_TYPES,
  type PhotoStyleWords,
  type PhotoType,
  type PieceCategory,
  type PriceRangeUsd,
  SIGNED_LINK_LIFETIME_SECONDS,
} from "@/config/consultations";
import type { PreviewState } from "@/config/stylings";
import type { PhotoCheckResult } from "@/server/ai/provider";
import type { BlobStore } from "@/server/blob/store";
import type { Clock } from "@/server/clock";
import { consultationFolder, photoPathnameFor } from "@/server/consultations/blob-pathnames";
import { judgePhotoCheck, type PhotoRejection } from "@/server/consultations/photo-check";
import { readPhotoFile } from "@/server/consultations/photo-file";
import { consultation, outfit, piece, styleIcon, styling } from "@/server/db/schema";
import type { OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import { ageGroupAt } from "@/server/outfit-assembly/age-group";
import { brandPriceRange, outfitPriceRange, visitUrl } from "@/server/outfit-assembly/brands";
import { checkStylingStart, createStyling, launchStyling, type StylingStartRefusal } from "@/server/stylings/start";
import { finishStyling } from "@/server/stylings/steps";

/** The shape of what "Get my Outfits" sends. The server action parses its form with this. */
export const startConsultationInputSchema = z.object({
  photo: z.instanceof(Blob),
  photoType: z.enum(PHOTO_TYPES),
  /** A body photo's chosen Budget Tier, No Budget when none is sent. A Face Photo has none. */
  budgetTier: z.enum(BUDGET_TIERS).optional(),
});
export type StartConsultationInput = z.infer<typeof startConsultationInputSchema>;

export type StartConsultationRefusal =
  | { refusal: "signed-out" | "unusable-file" | "check-errored" }
  | { refusal: "photo-rejected"; rejection: PhotoRejection }
  | StylingStartRefusal;

/**
 * "Get my Outfits": checks the request, has the AI check the photo against the Photo Type rules,
 * then stores an accepted photo privately, creates the Consultation and starts its first Styling.
 * A rejected photo, or a check that errors, stores nothing. Its checks run in the spec's order; the
 * file is the last of them.
 */
export async function startConsultation(
  ctx: OperationContext,
  input: StartConsultationInput,
): Promise<Result<{ consultationId: string }, StartConsultationRefusal>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };
  const stylingRefusal = await checkStylingStart(ctx, user);
  if (stylingRefusal) return { ok: false, ...stylingRefusal };

  // Only requests that skipped the browser's redraw fail here, so it isn't a photo check.
  const photo = await readPhotoFile(input.photo);
  if (!photo) return { ok: false, refusal: "unusable-file" };

  let photoCheck: PhotoCheckResult;
  try {
    photoCheck = await ctx.ai.checkPhoto({ photo, photoType: input.photoType });
  } catch (error) {
    // Only the message: a provider's error can carry the request, and with it the photo.
    console.error("The photo check errored:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, refusal: "check-errored" };
  }
  const verdict = judgePhotoCheck(photoCheck, input.photoType);
  if (!verdict.accepted) return { ok: false, refusal: "photo-rejected", rejection: verdict.rejection };
  const { report } = verdict;

  const id = randomUUID();
  const photoPathname = photoPathnameFor(id, photo.mediaType);
  await ctx.blob.put(photoPathname, photo.bytes, photo.mediaType);
  let stylingId: string;
  try {
    stylingId = await ctx.db.transaction(async (tx) => {
      const now = ctx.clock.now();
      const budgetTier = hasBudgetTier(input.photoType) ? (input.budgetTier ?? DEFAULT_BUDGET_TIER) : null;
      await tx.insert(consultation).values({
        id,
        userId: user.id,
        createdAt: now,
        photoType: input.photoType,
        photoPathname,
        faceVisible: report.visible.face,
        hairVisible: report.visible.hair,
        upperBodyVisible: report.visible.upperBody,
        legsVisible: report.visible.legs,
        feetVisible: report.visible.feet,
        hairCovered: report.hairCovered,
        photoStyle: report.photoStyle,
        budgetTier,
        stylePreference: user.stylePreference,
        countryCode: user.countryCode,
        ageGroup: ageGroupAt(user.birthYear, user.birthMonth, now),
        state: "styling",
      });
      return createStyling(tx, now, { consultationId: id, userId: user.id, kind: "first", budgetTier, photoStyle: report.photoStyle });
    });
  } catch (error) {
    await ctx.blob.delete(photoPathname).catch(() => {});
    throw error;
  }
  await launchStyling(ctx, stylingId);
  return { ok: true, consultationId: id };
}

/** What the Consultation's page shows. */
export interface ConsultationView {
  id: string;
  /** A signed link to the photo, valid for 1 hour from now. */
  photoUrl: string;
  photoType: PhotoType;
  createdAt: Date;
  /** The current Budget Tier, or null for a Face Photo, which has none. */
  budgetTier: BudgetTier | null;
  photoStyle: PhotoStyleWords;
  state: ConsultationState;
  /** The current Outfits, in order. */
  outfits: OutfitView[];
  /** The image model refused every current Outfit's Preview, so a different photo may work better. */
  everyPreviewRefused: boolean;
}

export interface OutfitView {
  id: string;
  /** Shown as "Outfit N". */
  position: number;
  /** Shown by name, never with Qloo's image. */
  styleIconName: string;
  preview: PreviewView;
  /**
   * The whole Outfit's price range, from its Brand Pieces' price data, or null when none has any. A
   * One-Piece's left-out Bottom Brand isn't one of them.
   */
  priceRange: PriceRangeUsd | null;
  /** One row per Piece, in Category order, whether or not there's a Preview: a One-Piece is one row. */
  pieces: PieceView[];
}

/** The Outfit's Preview: a signed link to it, valid for 1 hour from now, or why there's none. */
export type PreviewView = { state: "ready"; url: string } | { state: "refused" | "failed" };

/** A Piece's row. Its `details` are for the Preview, never shown. */
export interface PieceView {
  category: PieceCategory;
  /** For the Hairstyle, the cut. */
  item: string;
  why: string;
  /** The Brand it's built on, or null for the Hairstyle, which isn't something to buy. */
  brand: BrandView | null;
}

export interface BrandView {
  name: string;
  /** Its `price_range_usd_min`–`max`, or null when Qloo has no price for it. */
  priceRange: PriceRangeUsd | null;
  /** Where "Visit <Brand>" goes: its official site when that's an https URL, or null for no link. */
  visitUrl: string | null;
}

/** One of the signed-in user's own Consultations, or null for anyone else's or one that doesn't exist. */
export async function readConsultation(
  ctx: Pick<OperationContext, "auth" | "db" | "blob" | "clock" | "requestHeaders">,
  consultationId: string,
): Promise<ConsultationView | null> {
  const user = await readSignedInUser(ctx);
  if (!user) return null;
  const [row] = await ctx.db
    .select()
    .from(consultation)
    .where(and(eq(consultation.id, consultationId), eq(consultation.userId, user.id)));
  if (!row) return null;
  const linkValidUntil = signedLinkValidUntil(ctx.clock);
  const outfitRows = await ctx.db
    .select({
      id: outfit.id,
      position: outfit.position,
      styleIconName: styleIcon.name,
      previewState: outfit.previewState,
      previewPathname: outfit.previewPathname,
    })
    .from(outfit)
    .innerJoin(styleIcon, eq(styleIcon.id, outfit.styleIconId))
    .where(and(eq(outfit.consultationId, row.id), eq(outfit.current, true)))
    .orderBy(asc(outfit.position));
  const pieceRows =
    outfitRows.length === 0
      ? []
      : await ctx.db
          .select({
            outfitId: piece.outfitId,
            category: piece.category,
            item: piece.item,
            why: piece.why,
            brandName: piece.brandName,
            brandOfficialSite: piece.brandOfficialSite,
            brandPriceUsdMin: piece.brandPriceUsdMin,
            brandPriceUsdMax: piece.brandPriceUsdMax,
          })
          .from(piece)
          .where(
            inArray(
              piece.outfitId,
              outfitRows.map((outfitRow) => outfitRow.id),
            ),
          );
  const outfits = await Promise.all(
    outfitRows.map(async ({ id, position, styleIconName, previewState, previewPathname }): Promise<OutfitView> => {
      const pieces = pieceRows
        .filter((pieceRow) => pieceRow.outfitId === id)
        .toSorted(byCategoryOrder)
        .map(({ category, item, why, brandName, brandOfficialSite, brandPriceUsdMin, brandPriceUsdMax }) => ({
          category,
          item,
          why,
          brand:
            brandName === null
              ? null
              : { name: brandName, priceRange: brandPriceRange(brandPriceUsdMin, brandPriceUsdMax), visitUrl: visitUrl(brandOfficialSite) },
        }));
      return {
        id,
        position,
        styleIconName,
        preview: await previewView(ctx.blob, previewState, previewPathname, linkValidUntil),
        priceRange: outfitPriceRange(pieces.filter((pieceView) => pieceView.brand).map((pieceView) => pieceView.brand!.priceRange)),
        pieces,
      };
    }),
  );
  return {
    id: row.id,
    photoUrl: await ctx.blob.signedUrl(row.photoPathname, linkValidUntil),
    photoType: row.photoType,
    createdAt: row.createdAt,
    budgetTier: row.budgetTier,
    photoStyle: row.photoStyle,
    state: row.state,
    outfits,
    everyPreviewRefused: outfits.length > 0 && outfits.every((outfitView) => outfitView.preview.state === "refused"),
  };
}

/** One row of My Consultations. */
export interface ConsultationSummary {
  id: string;
  /** A signed link to the photo, valid for 1 hour from now. */
  photoUrl: string;
  photoType: PhotoType;
  createdAt: Date;
  /** The current Budget Tier, or null for a Face Photo, which has none. */
  budgetTier: BudgetTier | null;
  state: ConsultationState;
  /** How many Outfits it shows now. */
  outfitCount: number;
}

/** My Consultations: the signed-in user's own Consultations, newest first. None for a signed-out visitor. */
export async function listConsultations(
  ctx: Pick<OperationContext, "auth" | "db" | "blob" | "clock" | "requestHeaders">,
): Promise<ConsultationSummary[]> {
  const user = await readSignedInUser(ctx);
  if (!user) return [];
  const rows = await ctx.db
    .select({
      id: consultation.id,
      photoPathname: consultation.photoPathname,
      photoType: consultation.photoType,
      createdAt: consultation.createdAt,
      budgetTier: consultation.budgetTier,
      state: consultation.state,
      outfitCount: sql<number>`(
        select count(*)::int from ${outfit}
        where ${and(eq(outfit.consultationId, consultation.id), eq(outfit.current, true))}
      )`,
    })
    .from(consultation)
    .where(eq(consultation.userId, user.id))
    .orderBy(desc(consultation.createdAt));
  const linkValidUntil = signedLinkValidUntil(ctx.clock);
  return Promise.all(
    rows.map(async ({ photoPathname, ...row }) => ({ ...row, photoUrl: await ctx.blob.signedUrl(photoPathname, linkValidUntil) })),
  );
}

/** A Consultation that isn't the user's is not found, just like one that doesn't exist. */
export type DeleteConsultationRefusal = { refusal: "signed-out" | "not-found" };

/**
 * Deletes one of the signed-in user's own Consultations for good, even while it's Styling. A running
 * Styling's Workflow run is cancelled first. Then its Stylings, Style Icons, Outfits and Pieces go,
 * with everything in its Blob folder, its photo and Previews included.
 */
export async function deleteConsultation(
  ctx: Pick<OperationContext, "auth" | "db" | "blob" | "clock" | "stylings" | "requestHeaders">,
  consultationId: string,
): Promise<Result<object, DeleteConsultationRefusal>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };
  const [owned] = await ctx.db
    .select({ id: consultation.id })
    .from(consultation)
    .where(and(eq(consultation.id, consultationId), eq(consultation.userId, user.id)));
  if (!owned) return { ok: false, refusal: "not-found" };

  // A running Styling stops first, as a stuck one does: its run is cancelled, so it starts no more
  // steps, and it's finished, so a step under way saves nothing. A run that can't be cancelled
  // doesn't keep the Consultation, since its steps find the Styling no longer running.
  const runningStylings = await ctx.db
    .select({ id: styling.id, workflowRunId: styling.workflowRunId })
    .from(styling)
    .where(and(eq(styling.consultationId, consultationId), eq(styling.status, "running")));
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
  const deleted = await ctx.db.transaction(async (tx) => {
    // Its Stylings, Style Icons, Outfits and Pieces go with it.
    const [row] = await tx
      .delete(consultation)
      .where(and(eq(consultation.id, consultationId), eq(consultation.userId, user.id)))
      .returning({ id: consultation.id });
    if (!row) return false;
    await ctx.blob.deleteFolder(consultationFolder(consultationId));
    return true;
  });
  return deleted ? { ok: true } : { ok: false, refusal: "not-found" };
}

/** When a signed link made now stops working. */
function signedLinkValidUntil(clock: Clock): Date {
  return new Date(clock.now().getTime() + SIGNED_LINK_LIFETIME_SECONDS * 1000);
}

async function previewView(
  blob: BlobStore,
  state: PreviewState,
  pathname: string | null,
  validUntil: Date,
): Promise<PreviewView> {
  if (state === "ready" && pathname) return { state, url: await blob.signedUrl(pathname, validUntil) };
  // Finishing a Styling marks every Preview not ready failed, so a current Outfit's is never pending.
  return { state: state === "refused" ? "refused" : "failed" };
}
