import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as z from "zod";

import {
  DEFAULT_BUDGET_TIER,
  PHOTO_LINK_LIFETIME_SECONDS,
  PHOTO_TYPES,
  type PhotoStyleWords,
  type PhotoType,
} from "@/config/consultations";
import type { PhotoCheckResult } from "@/server/ai/provider";
import { ageGroupAt } from "@/server/consultations/age-group";
import { judgePhotoCheck, type PhotoRejection } from "@/server/consultations/photo-check";
import { PHOTO_EXTENSIONS, readPhotoFile } from "@/server/consultations/photo-file";
import { consultation } from "@/server/db/schema";
import type { OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";

/** The shape of what "Get my Outfits" sends. The server action parses its form with this. */
export const startConsultationInputSchema = z.object({
  photo: z.instanceof(Blob),
  photoType: z.enum(PHOTO_TYPES),
});
export type StartConsultationInput = z.infer<typeof startConsultationInputSchema>;

export type StartConsultationRefusal =
  | { refusal: "signed-out" | "unusable-file" | "check-errored" }
  | { refusal: "photo-rejected"; rejection: PhotoRejection };

/**
 * "Get my Outfits": checks the request, has the AI check the photo against the Photo Type rules,
 * then stores an accepted photo privately and creates the Consultation. A rejected photo, or a check
 * that errors, stores nothing. Its checks run in the spec's order; the file is the last of them.
 */
export async function startConsultation(
  ctx: OperationContext,
  input: StartConsultationInput,
): Promise<Result<{ consultationId: string }, StartConsultationRefusal>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };

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
  try {
    const now = ctx.clock.now();
    await ctx.db.insert(consultation).values({
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
      budgetTier: input.photoType === "face" ? null : DEFAULT_BUDGET_TIER,
      stylePreference: user.stylePreference,
      countryCode: user.countryCode,
      ageGroup: ageGroupAt(user.birthYear, user.birthMonth, now),
    });
  } catch (error) {
    await ctx.blob.delete(photoPathname).catch(() => {});
    throw error;
  }
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
  const linkValidUntil = new Date(ctx.clock.now().getTime() + PHOTO_LINK_LIFETIME_SECONDS * 1000);
  return {
    id: row.id,
    photoUrl: await ctx.blob.signedUrl(row.photoPathname, linkValidUntil),
    photoType: row.photoType,
    createdAt: row.createdAt,
    photoStyle: row.photoStyle,
  };
}
