import { and, asc, eq, exists, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { byCategoryOrder } from "@/config/consultations";
import { MAX_TAILORING_SUBSTITUTES, type PreviewRefusalReason, type StylingStage, TAILORING_ATTEMPTS } from "@/config/stylings";
import { type AiProvider, isPhotoMediaType, type Photo } from "@/server/ai/provider";
import { checkTailoredPieces } from "@/server/ai/tailoring";
import type { BlobStore } from "@/server/blob/store";
import type { Clock } from "@/server/clock";
import type { Database, Transaction } from "@/server/db/database";
import { consultation, outfit, piece, styleIcon, styling } from "@/server/db/schema";
import { outfitCategories } from "@/server/outfit-assembly/categories";
import { rankStyleIcons, styleIconLines, styleIconQuery } from "@/server/outfit-assembly/style-icons";
import type { QlooClient } from "@/server/qloo/client";

import type { BuildOutfitsSteps, StylingOutcome } from "./build-outfits";

/** What the steps run on. The Workflow gives them the app's services; tests give them fakes. */
export interface StylingContext {
  db: Database;
  clock: Clock;
  qloo: QlooClient;
  ai: AiProvider;
  /** Where the Consultation's photo and Previews are kept. Steps pass their pathnames, never their bytes. */
  blob: BlobStore;
}

/** The Styling has finished, been cancelled or deleted, so its steps stop without saving. */
export class StylingNotRunningError extends Error {
  constructor(stylingId: string) {
    super(`Styling ${stylingId} is no longer running.`);
    this.name = "StylingNotRunningError";
  }
}

/** The "build Outfits" steps, running on `ctx`. */
export function stylingSteps(ctx: StylingContext): BuildOutfitsSteps {
  return {
    async styleIconLines(stylingId) {
      const { stylePreference } = await readRunningStyling(ctx.db, stylingId);
      return styleIconLines(stylePreference);
    },

    // The search uses the profile stored on the Consultation, and the Photo Style the Styling builds for.
    async fetchStyleIcons(stylingId, line) {
      const { ageGroup, countryCode, photoStyle } = await readRunningStyling(ctx.db, stylingId);
      return ctx.qloo.people(styleIconQuery({ ageGroup, countryCode, photoStyle }, line));
    },

    async saveStyleIcons(stylingId, peopleByLine) {
      const ranked = rankStyleIcons(peopleByLine);
      await whileRunning(ctx.db, stylingId, async (tx, running) => {
        // A retry after the save went through has nothing left to do.
        const [saved] = await tx.select({ id: styleIcon.id }).from(styleIcon).where(eq(styleIcon.stylingId, stylingId)).limit(1);
        if (saved) return;
        if (ranked.length > 0) {
          await tx.insert(styleIcon).values(
            ranked.map((icon, index) => ({
              id: randomUUID(),
              consultationId: running.consultationId,
              stylingId,
              position: index + 1,
              qlooEntityId: icon.entityId,
              name: icon.name,
              line: icon.line,
              status: "unused" as const,
            })),
          );
        }
        await moveStage(tx, ctx.clock, stylingId, "building_outfits");
      });
    },

    async planOutfits(stylingId) {
      const running = await readRunningStyling(ctx.db, stylingId);
      const made = await ctx.db.select({ position: outfit.position }).from(outfit).where(eq(outfit.stylingId, stylingId));
      const filled = new Set(made.map((outfitMade) => outfitMade.position));
      const open = Array.from({ length: running.outfitsWanted }, (_, index) => index + 1).filter((position) => !filled.has(position));
      // Each failed tailoring was a try beyond the Outfits wanted: a substitute.
      const triesLeft = running.outfitsWanted + MAX_TAILORING_SUBSTITUTES - made.length - running.tailoringFailures;
      const count = Math.min(open.length, triesLeft);
      if (count <= 0) return [];
      const icons = await ctx.db
        .select({ id: styleIcon.id })
        .from(styleIcon)
        .where(and(eq(styleIcon.stylingId, stylingId), eq(styleIcon.status, "unused")))
        .orderBy(asc(styleIcon.position))
        .limit(count);
      return icons.map((icon, index) => ({ position: open[index]!, styleIconId: icon.id }));
    },

    async tailorOutfit(stylingId, { position, styleIconId }, attempt) {
      const toTailor = await readOutfitToTailor(ctx.db, stylingId, styleIconId);
      // A retry after the save went through has nothing left to do.
      if (toTailor.styleIconStatus !== "unused") return "saved";
      // Only the Hairstyle until the Brands stage (ticket 14) gives body photos their Top, Bottom and Shoes.
      const categories = outfitCategories(toTailor).filter((category) => category === "hairstyle");
      const pieces =
        categories.length === 0
          ? []
          : checkTailoredPieces(
              await ctx.ai.tailorPieces({
                photo: await readPhoto(ctx.blob, toTailor.photoPathname),
                photoType: toTailor.photoType,
                ageGroup: toTailor.ageGroup,
                photoStyle: toTailor.photoStyle,
                line: toTailor.line,
                styleIconName: toTailor.styleIconName,
                pieces: categories.map((category) => ({ category })),
              }),
              categories,
            );
      // A bad reply is asked again, as its own AI call, before tailoring counts as failed.
      if (!pieces && attempt < TAILORING_ATTEMPTS) return "ask-again";
      await whileRunning(ctx.db, stylingId, async (tx, running) => {
        const [icon] = await tx.select({ status: styleIcon.status }).from(styleIcon).where(eq(styleIcon.id, styleIconId));
        if (icon?.status !== "unused") return;
        if (!pieces) {
          // Skipped quietly: the next unused Style Icon takes its place, if a substitute is left.
          await tx.update(styleIcon).set({ status: "skipped" }).where(eq(styleIcon.id, styleIconId));
          await tx
            .update(styling)
            .set({ tailoringFailures: sql`${styling.tailoringFailures} + 1` })
            .where(eq(styling.id, stylingId));
          return;
        }
        const outfitId = randomUUID();
        await tx.insert(outfit).values({
          id: outfitId,
          consultationId: running.consultationId,
          stylingId,
          position,
          styleIconId,
          current: false,
          previewState: "pending",
        });
        if (pieces.length > 0) {
          await tx.insert(piece).values(pieces.map((tailored) => ({ id: randomUUID(), outfitId, ...tailored })));
        }
        await tx.update(styleIcon).set({ status: "used" }).where(eq(styleIcon.id, styleIconId));
        await tx
          .update(styling)
          .set({ outfitsMade: sql`${styling.outfitsMade} + 1` })
          .where(eq(styling.id, stylingId));
      });
      return "saved";
    },

    async planPreviews(stylingId) {
      return whileRunning(ctx.db, stylingId, async (tx) => {
        // An Outfit with no Pieces would have the image model change nothing, so it's left to fail.
        const pending = await tx
          .select({ id: outfit.id })
          .from(outfit)
          .where(
            and(
              eq(outfit.stylingId, stylingId),
              eq(outfit.previewState, "pending"),
              exists(tx.select({ id: piece.id }).from(piece).where(eq(piece.outfitId, outfit.id))),
            ),
          )
          .orderBy(asc(outfit.position));
        if (pending.length > 0) await moveStage(tx, ctx.clock, stylingId, "previews");
        return pending.map(({ id }) => id);
      });
    },

    async renderPreview(stylingId, outfitId) {
      const toRender = await readOutfitToRender(ctx.db, stylingId, outfitId);
      // A retry after the save went through has nothing left to do.
      if (toRender.previewState !== "pending") return;
      const pieces = await ctx.db.select({ category: piece.category, details: piece.details }).from(piece).where(eq(piece.outfitId, outfitId));
      // Never the Style Icon: only what the user is shown wearing.
      const preview = await ctx.ai.renderPreview({
        photo: await readPhoto(ctx.blob, toRender.photoPathname),
        photoType: toRender.photoType,
        pieces: pieces.toSorted(byCategoryOrder),
      });
      if (preview.refused) {
        await savePreview(ctx.db, stylingId, outfitId, { previewState: "refused", previewRefusalReason: preview.reason });
        return;
      }
      const pathname = previewPathname(toRender.consultationId, outfitId);
      // A try cut short between storing the Preview and saving it leaves it behind: store it afresh.
      await ctx.blob.delete(pathname);
      await ctx.blob.put(pathname, new Uint8Array(await sharp(preview.image).webp().toBuffer()), "image/webp");
      try {
        await savePreview(ctx.db, stylingId, outfitId, { previewState: "ready", previewPathname: pathname });
      } catch (error) {
        // Never saved, nothing would show or delete it. Any other failure may have saved it after
        // all, so it stays for the retry to find.
        if (error instanceof StylingNotRunningError) await ctx.blob.delete(pathname).catch(() => {});
        throw error;
      }
    },

    finish: (stylingId, outcome) => finishStyling(ctx, stylingId, outcome),
  };
}

/** Where an Outfit's Preview is stored: beside its Consultation's photo. */
function previewPathname(consultationId: string, outfitId: string): string {
  return `consultations/${consultationId}/previews/${outfitId}.webp`;
}

/** Saves a pending Preview's outcome, only while its Styling runs. */
async function savePreview(
  db: Database,
  stylingId: string,
  outfitId: string,
  outcome: { previewState: "ready"; previewPathname: string } | { previewState: "refused"; previewRefusalReason: PreviewRefusalReason },
): Promise<void> {
  await whileRunning(db, stylingId, async (tx) => {
    await tx
      .update(outfit)
      .set(outcome)
      .where(and(eq(outfit.id, outfitId), eq(outfit.previewState, "pending")));
  });
}

/**
 * Finishes a running Styling. Whatever Outfits it made switch in at once and the Consultation is
 * ready; a Preview not ready by then never will be, so it's marked failed. One that made none has
 * failed: nothing switches, and the Consultation keeps whatever it showed before, or shows No
 * Outfits. A Styling that isn't running any more is left as it is.
 */
export async function finishStyling(ctx: Pick<StylingContext, "db" | "clock">, stylingId: string, outcome: StylingOutcome): Promise<void> {
  const finishedAt = ctx.clock.now();
  await ctx.db.transaction(async (tx) => {
    const running = await lockRunningStyling(tx, stylingId);
    if (!running) return;
    const made = await tx
      .select({ id: outfit.id, position: outfit.position })
      .from(outfit)
      .where(eq(outfit.stylingId, stylingId))
      .orderBy(asc(outfit.position));
    if (made.length > 0) {
      // A position whose Style Icons all failed tailoring leaves a gap: the rest move up, in order.
      for (const [index, outfitMade] of made.entries()) {
        if (outfitMade.position !== index + 1) await tx.update(outfit).set({ position: index + 1 }).where(eq(outfit.id, outfitMade.id));
      }
      await tx
        .update(outfit)
        .set({ previewState: "failed" })
        .where(and(eq(outfit.stylingId, stylingId), eq(outfit.previewState, "pending")));
      await tx.update(outfit).set({ current: true }).where(eq(outfit.stylingId, stylingId));
      await tx.update(styling).set({ status: "succeeded", outfitsMade: made.length, finishedAt }).where(eq(styling.id, stylingId));
      await tx.update(consultation).set({ state: "ready" }).where(eq(consultation.id, running.consultationId));
      return;
    }
    const failureReason = outcome === "broke" ? "something_broke" : "nothing_built";
    await tx.update(styling).set({ status: "failed", failureReason, finishedAt }).where(eq(styling.id, stylingId));
    const [shown] = await tx
      .select({ id: outfit.id })
      .from(outfit)
      .where(and(eq(outfit.consultationId, running.consultationId), eq(outfit.current, true)))
      .limit(1);
    await tx
      .update(consultation)
      .set({ state: shown ? "ready" : "no_outfits" })
      .where(eq(consultation.id, running.consultationId));
  });
}

/** The running Styling with what its steps build from, or throws if it isn't running. */
async function readRunningStyling(db: Database, stylingId: string) {
  const [row] = await db
    .select({
      photoStyle: styling.photoStyle,
      outfitsWanted: styling.outfitsWanted,
      tailoringFailures: styling.tailoringFailures,
      stylePreference: consultation.stylePreference,
      countryCode: consultation.countryCode,
      ageGroup: consultation.ageGroup,
    })
    .from(styling)
    .innerJoin(consultation, eq(consultation.id, styling.consultationId))
    .where(and(eq(styling.id, stylingId), eq(styling.status, "running")));
  if (!row) throw new StylingNotRunningError(stylingId);
  return row;
}

/** What one Outfit is tailored from: its Style Icon, the photo and the Styling's Photo Style. Throws if the Styling isn't running. */
async function readOutfitToTailor(db: Database, stylingId: string, styleIconId: string) {
  const [row] = await db
    .select({
      styleIconName: styleIcon.name,
      styleIconStatus: styleIcon.status,
      line: styleIcon.line,
      photoStyle: styling.photoStyle,
      photoPathname: consultation.photoPathname,
      photoType: consultation.photoType,
      hairCovered: consultation.hairCovered,
      ageGroup: consultation.ageGroup,
    })
    .from(styleIcon)
    .innerJoin(styling, eq(styling.id, stylingId))
    .innerJoin(consultation, eq(consultation.id, styling.consultationId))
    .where(and(eq(styleIcon.id, styleIconId), eq(styleIcon.consultationId, consultation.id), eq(styling.status, "running")));
  if (!row) throw new StylingNotRunningError(stylingId);
  return row;
}

/** What one Outfit's Preview is rendered from, and whether it's still to render. Throws if the Styling isn't running. */
async function readOutfitToRender(db: Database, stylingId: string, outfitId: string) {
  const [row] = await db
    .select({
      consultationId: outfit.consultationId,
      previewState: outfit.previewState,
      photoPathname: consultation.photoPathname,
      photoType: consultation.photoType,
    })
    .from(outfit)
    .innerJoin(styling, eq(styling.id, outfit.stylingId))
    .innerJoin(consultation, eq(consultation.id, outfit.consultationId))
    .where(and(eq(outfit.id, outfitId), eq(outfit.stylingId, stylingId), eq(styling.status, "running")));
  if (!row) throw new StylingNotRunningError(stylingId);
  return row;
}

/** The Consultation's photo, exactly as it was stored. */
async function readPhoto(blob: BlobStore, pathname: string): Promise<Photo> {
  const { bytes, contentType } = await blob.get(pathname);
  if (!isPhotoMediaType(contentType)) throw new Error("The stored photo isn't a JPEG, PNG or WebP image.");
  return { bytes, mediaType: contentType };
}

/** Saves in one transaction, holding the Styling so it can't finish meanwhile, and only while it runs. */
async function whileRunning<T>(
  db: Database,
  stylingId: string,
  save: (tx: Transaction, running: { consultationId: string; outfitsWanted: number }) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const running = await lockRunningStyling(tx, stylingId);
    if (!running) throw new StylingNotRunningError(stylingId);
    return save(tx, running);
  });
}

async function lockRunningStyling(tx: Transaction, stylingId: string) {
  const [row] = await tx
    .select({ consultationId: styling.consultationId, outfitsWanted: styling.outfitsWanted })
    .from(styling)
    .where(and(eq(styling.id, stylingId), eq(styling.status, "running")))
    .for("update");
  return row;
}

async function moveStage(tx: Transaction, clock: Clock, stylingId: string, stage: StylingStage): Promise<void> {
  await tx.update(styling).set({ stage, stageMovedAt: clock.now() }).where(eq(styling.id, stylingId));
}
