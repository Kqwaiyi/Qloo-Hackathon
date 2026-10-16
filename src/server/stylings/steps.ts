import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { type BudgetTier, byCategoryOrder, isBrandCategory } from "@/config/consultations";
import {
  BRAND_FETCHES_UP_FRONT,
  MAX_BRAND_FETCHES_PER_STYLING,
  MAX_TAILORING_SUBSTITUTES,
  type PreviewRefusalReason,
  QLOO_CALLS_AT_ONCE,
  type StylingStage,
  TAILORING_ATTEMPTS,
} from "@/config/stylings";
import { type AiProvider, isPhotoMediaType, type Photo, type TailoringBrand } from "@/server/ai/provider";
import { checkTailoredPieces } from "@/server/ai/tailoring";
import type { BlobStore } from "@/server/blob/store";
import type { Clock } from "@/server/clock";
import type { Database, Transaction } from "@/server/db/database";
import { consultation, outfit, piece, styleIcon, styling } from "@/server/db/schema";
import {
  brandPriceRange,
  brandQueries,
  brandsUsedBy,
  fullestPool,
  isThinPool,
  needsBrands,
  type PickedBrand,
  pieceBrand,
  planOutfitBrands,
} from "@/server/outfit-assembly/brands";
import { outfitCategories } from "@/server/outfit-assembly/categories";
import { rankStyleIcons, styleIconLines, styleIconQuery } from "@/server/outfit-assembly/style-icons";
import type { QlooBrand, QlooClient } from "@/server/qloo/client";

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
      const { photoType, hairCovered } = await readRunningStyling(ctx.db, stylingId);
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
        // A body photo's Outfits are built on Brands, fetched next.
        await moveStage(tx, ctx.clock, stylingId, needsBrands(outfitCategories({ photoType, hairCovered })) ? "brands" : "building_outfits");
      });
    },

    async planOutfits(stylingId, brandsByStyleIcon) {
      return whileRunning(ctx.db, stylingId, async (tx, running) => {
        const [planning] = await tx
          .select({
            kind: styling.kind,
            budgetTier: styling.budgetTier,
            stage: styling.stage,
            tailoringFailures: styling.tailoringFailures,
            photoType: consultation.photoType,
            hairCovered: consultation.hairCovered,
          })
          .from(styling)
          .innerJoin(consultation, eq(consultation.id, styling.consultationId))
          .where(eq(styling.id, stylingId));
        const made = await tx
          .select({ position: outfit.position, top: outfit.topBrandEntityId, bottom: outfit.bottomBrandEntityId, shoes: outfit.shoesBrandEntityId })
          .from(outfit)
          .where(eq(outfit.stylingId, stylingId));
        const filled = new Set(made.map((outfitMade) => outfitMade.position));
        const open = Array.from({ length: running.outfitsWanted }, (_, index) => index + 1).filter((position) => !filled.has(position));
        // Each failed tailoring was a try beyond the Outfits wanted: a substitute.
        const triesLeft = running.outfitsWanted + MAX_TAILORING_SUBSTITUTES - made.length - planning!.tailoringFailures;
        const count = Math.min(open.length, triesLeft);
        if (count <= 0) return { fetchBrandsFor: [], tries: [] };
        const icons = await tx
          .select({ id: styleIcon.id, line: styleIcon.line })
          .from(styleIcon)
          .where(and(eq(styleIcon.stylingId, stylingId), eq(styleIcon.status, "unused")))
          .orderBy(asc(styleIcon.position));
        if (!needsBrands(outfitCategories(planning!))) {
          return { fetchBrandsFor: [], tries: icons.slice(0, count).map((icon, index) => ({ position: open[index]!, styleIconId: icon.id, brands: null })) };
        }

        const budgetTier = brandsBudgetTier(stylingId, planning!.budgetTier);
        // Style Icons are planned in order, so one whose Brands haven't come back holds up the rest.
        const firstUnfetched = icons.findIndex((icon) => !(icon.id in brandsByStyleIcon));
        const ready = firstUnfetched === -1 ? icons : icons.slice(0, firstUnfetched);
        const plan = planOutfitBrands(
          ready.map((icon) => ({ styleIconId: icon.id, line: icon.line, brands: brandsByStyleIcon[icon.id]! })),
          budgetTier,
          count,
          brandsUsedBy(made),
        );
        // Skipped quietly, and not a tailoring failure: the next Style Icon takes its place.
        if (plan.skipped.length > 0) await tx.update(styleIcon).set({ status: "skipped" }).where(inArray(styleIcon.id, plan.skipped));
        const stillWanted = count - plan.picked.length;
        if (stillWanted > 0) {
          const fetchedSoFar = Object.keys(brandsByStyleIcon).length;
          // A first Styling fetches a spare up front, in case a Style Icon can't complete an Outfit.
          const fetchCount = Math.min(
            fetchedSoFar === 0 && planning!.kind === "first" ? BRAND_FETCHES_UP_FRONT : stillWanted,
            MAX_BRAND_FETCHES_PER_STYLING - fetchedSoFar,
            QLOO_CALLS_AT_ONCE,
          );
          const toFetch = icons.slice(ready.length, ready.length + Math.max(fetchCount, 0)).map((icon) => icon.id);
          if (toFetch.length > 0) return { fetchBrandsFor: toFetch, tries: [] };
        }
        if (plan.picked.length > 0 && planning!.stage === "brands") await moveStage(tx, ctx.clock, stylingId, "building_outfits");
        return {
          fetchBrandsFor: [],
          tries: plan.picked.map((picked, index) => ({ position: open[index]!, styleIconId: picked.styleIconId, brands: picked.brands })),
        };
      });
    },

    // The search uses the profile stored on the Consultation, the Budget Tier the Styling builds
    // for, and the line of the Style Icon's Outfit. A thin pool widens within this one fetch: each
    // wider query is tried in turn until one gives enough usable Brands, or none is left.
    async fetchBrands(stylingId, styleIconId) {
      const running = await readRunningStyling(ctx.db, stylingId);
      const { consultationId, ageGroup, countryCode } = running;
      const budgetTier = brandsBudgetTier(stylingId, running.budgetTier);
      const [icon] = await ctx.db
        .select({ entityId: styleIcon.qlooEntityId, line: styleIcon.line })
        .from(styleIcon)
        .where(and(eq(styleIcon.id, styleIconId), eq(styleIcon.consultationId, consultationId)));
      if (!icon) throw new Error(`Style Icon ${styleIconId} isn't one of the Styling's Consultation's.`);
      const tried: QlooBrand[][] = [];
      for (const query of brandQueries({ ageGroup, countryCode, budgetTier }, icon)) {
        // A Styling that stopped meanwhile spends no more of Qloo's calls.
        if (tried.length > 0) await readRunningStyling(ctx.db, stylingId);
        const brands = await ctx.qloo.brands(query);
        tried.push(brands);
        if (!isThinPool(brands, icon.line, budgetTier)) break;
      }
      return fullestPool(tried, icon.line, budgetTier);
    },

    async tailorOutfit(stylingId, { position, styleIconId, brands }, attempt) {
      const toTailor = await readOutfitToTailor(ctx.db, stylingId, styleIconId);
      // A retry after the save went through has nothing left to do.
      if (toTailor.styleIconStatus !== "unused") return "saved";
      const categories = outfitCategories(toTailor);
      if (needsBrands(categories) !== (brands !== null)) throw new Error("An Outfit's Brands don't match its Categories.");
      const pieces = checkTailoredPieces(
        await ctx.ai.tailorPieces({
          photo: await readPhoto(ctx.blob, toTailor.photoPathname),
          photoType: toTailor.photoType,
          ageGroup: toTailor.ageGroup,
          photoStyle: toTailor.photoStyle,
          line: toTailor.line,
          styleIconName: toTailor.styleIconName,
          pieces: categories.map((category) =>
            isBrandCategory(category) ? { category, brand: tailoringBrand(brands![category]) } : { category },
          ),
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
          topBrandEntityId: brands?.top.entityId,
          bottomBrandEntityId: brands?.bottom.entityId,
          shoesBrandEntityId: brands?.shoes.entityId,
        });
        await tx.insert(piece).values(
          pieces.map((tailored) => {
            const brand = brands && pieceBrand(tailored.category, brands);
            return {
              id: randomUUID(),
              outfitId,
              ...tailored,
              brandEntityId: brand?.entityId,
              brandName: brand?.name,
              brandOfficialSite: brand?.officialSite,
              brandPriceUsdMin: brand?.priceRangeUsdMin,
              brandPriceUsdMax: brand?.priceRangeUsdMax,
            };
          }),
        );
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
        const pending = await tx
          .select({ id: outfit.id })
          .from(outfit)
          .where(and(eq(outfit.stylingId, stylingId), eq(outfit.previewState, "pending")))
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

/** The Budget Tier a Styling's Brands are fetched and picked at. Only a Face Photo's Styling has none, and it has no Brands. */
function brandsBudgetTier(stylingId: string, budgetTier: BudgetTier | null): BudgetTier {
  if (!budgetTier) throw new Error(`Styling ${stylingId} has no Budget Tier for its Brands.`);
  return budgetTier;
}

/** What tailoring is told about a picked Brand: never its entity ID or official site. */
function tailoringBrand({ name, categoryTags, priceRangeUsdMin, priceRangeUsdMax }: PickedBrand): TailoringBrand {
  return { name, categoryTags, priceRangeUsd: brandPriceRange(priceRangeUsdMin, priceRangeUsdMax) };
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
      consultationId: styling.consultationId,
      photoStyle: styling.photoStyle,
      budgetTier: styling.budgetTier,
      stylePreference: consultation.stylePreference,
      countryCode: consultation.countryCode,
      ageGroup: consultation.ageGroup,
      photoType: consultation.photoType,
      hairCovered: consultation.hairCovered,
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
