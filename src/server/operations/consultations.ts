import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as z from "zod";

import {
  byCategoryOrder,
  type Category,
  type ConsultationState,
  DEFAULT_BUDGET_TIER,
  PHOTO_TYPES,
  type PhotoStyleWords,
  type PhotoType,
  SIGNED_LINK_LIFETIME_SECONDS,
} from "@/config/consultations";
import type { PreviewState } from "@/config/stylings";
import type { PhotoCheckResult } from "@/server/ai/provider";
import type { BlobStore } from "@/server/blob/store";
import { judgePhotoCheck, type PhotoRejection } from "@/server/consultations/photo-check";
import { PHOTO_EXTENSIONS, readPhotoFile } from "@/server/consultations/photo-file";
import { consultation, outfit, piece, styleIcon } from "@/server/db/schema";
import type { OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import { ageGroupAt } from "@/server/outfit-assembly/age-group";
import { checkStylingStart, createStyling, launchStyling, type StylingStartRefusal } from "@/server/stylings/start";

/** The shape of what "Get my Outfits" sends. The server action parses its form with this. */
export const startConsultationInputSchema = z.object({
  photo: z.instanceof(Blob),
  photoType: z.enum(PHOTO_TYPES),
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
  const photoPathname = `consultations/${id}/photo.${PHOTO_EXTENSIONS[photo.mediaType]}`;
  await ctx.blob.put(photoPathname, photo.bytes, photo.mediaType);
  let stylingId: string;
  try {
    stylingId = await ctx.db.transaction(async (tx) => {
      const now = ctx.clock.now();
      const budgetTier = input.photoType === "face" ? null : DEFAULT_BUDGET_TIER;
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
  /** One row per Piece, in Category order, whether or not there's a Preview. */
  pieces: PieceView[];
}

/** The Outfit's Preview: a signed link to it, valid for 1 hour from now, or why there's none. */
export type PreviewView = { state: "ready"; url: string } | { state: "refused" | "failed" };

/** A Piece's row. Its `details` are for the Preview, never shown. */
export interface PieceView {
  category: Category;
  /** For the Hairstyle, the cut. */
  item: string;
  why: string;
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
  const linkValidUntil = new Date(ctx.clock.now().getTime() + SIGNED_LINK_LIFETIME_SECONDS * 1000);
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
          .select({ outfitId: piece.outfitId, category: piece.category, item: piece.item, why: piece.why })
          .from(piece)
          .where(
            inArray(
              piece.outfitId,
              outfitRows.map((outfitRow) => outfitRow.id),
            ),
          );
  const outfits = await Promise.all(
    outfitRows.map(async ({ id, position, styleIconName, previewState, previewPathname }) => ({
      id,
      position,
      styleIconName,
      preview: await previewView(ctx.blob, previewState, previewPathname, linkValidUntil),
      pieces: pieceRows
        .filter((pieceRow) => pieceRow.outfitId === id)
        .toSorted(byCategoryOrder)
        .map(({ category, item, why }) => ({ category, item, why })),
    })),
  );
  return {
    id: row.id,
    photoUrl: await ctx.blob.signedUrl(row.photoPathname, linkValidUntil),
    photoType: row.photoType,
    createdAt: row.createdAt,
    photoStyle: row.photoStyle,
    state: row.state,
    outfits,
    everyPreviewRefused: outfits.length > 0 && outfits.every((outfitView) => outfitView.preview.state === "refused"),
  };
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
