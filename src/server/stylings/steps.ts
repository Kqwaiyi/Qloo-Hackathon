import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { type BudgetTier, byCategoryOrder, CATEGORY_LABELS, type PhotoType, type PieceCategory } from "@/config/consultations";
import type { ProductSearchMarket } from "@/config/product-search";
import {
  addsToCurrentOutfits,
  isStuck,
  PREVIEW_REDRAW_STATES,
  type PreviewRedrawOutcome,
  type PreviewRefusalReason,
  stylingLimitsFor,
  type StylingStage,
} from "@/config/stylings";
import { type AiProvider, isPhotoMediaType, type Photo, type PreviewPiece, type PreviewResult, UnretryableAiError } from "@/server/ai/provider";
import type { BlobStore } from "@/server/blob/store";
import type { Clock } from "@/server/clock";
import { previewPathnameFor, previewRedrawPathnameFor } from "@/server/consultations/blob-pathnames";
import type { Database, Transaction } from "@/server/db/database";
import { consultation, outfit, piece, pieceCandidates, styleIcon, styleIconBrands, styling } from "@/server/db/schema";
import { needsBrands } from "@/server/outfit-assembly/brands";
import { outfitCategories, type PhotoCategoryFacts } from "@/server/outfit-assembly/categories";
import { productSearchMarket } from "@/server/outfit-assembly/markets";
import { rankStyleIcons, styleIconLines, styleIconQuery } from "@/server/outfit-assembly/style-icons";
import type { ProductPhotos } from "@/server/product-photos/photos";
import type { ProductSearch } from "@/server/product-search/provider";
import type { QlooClient } from "@/server/qloo/client";
import { recordUsage } from "@/server/usage/records";

import { readBuildingBeside } from "./current-outfits";
import type { PreviewToCheck, SellerPhotoLink, StylingOutcome, StylistSteps } from "./stylist";
import { addSteps, deleteStylistNotesNoLongerShown, STEPS } from "./stylist-notes";

/** What the steps run on. The Workflow gives them the app's services; tests give them fakes. */
export interface StylingContext {
  db: Database;
  clock: Clock;
  qloo: QlooClient;
  ai: AiProvider;
  /** Where the Consultation's photo and Previews are kept. Steps pass their pathnames, never their bytes. */
  blob: BlobStore;
  productSearch: ProductSearch;
  /** Where each Preview step fetches its Products' photos, which are never kept. */
  productPhotos: ProductPhotos;
}

/** The Styling has finished, been cancelled or deleted, so its steps stop without saving. */
export class StylingNotRunningError extends Error {
  constructor(stylingId: string) {
    super(`Styling ${stylingId} is no longer running.`);
    this.name = "StylingNotRunningError";
  }
}

/** Every product search the Styling sent still errored after its retries, none answering: the product search is down. */
export class ProductSearchDownError extends Error {
  constructor(stylingId: string) {
    super(`Every product search Styling ${stylingId} sent still failed after its retries: the product search is down.`);
    this.name = "ProductSearchDownError";
  }
}

/** How a step is being tried. */
export interface StepTry {
  /**
   * Whether this is the step's last try, so that throwing now leaves it failed rather than tried
   * again. Only the Preview and product search steps read it, and their runners say. Unsaid, every
   * try counts as the last, as when tests' inline runner retries nothing.
   */
  lastTry?: boolean;
}

/** The steps every Styling shares, whatever its photo, running on `ctx`, as this try of them. */
export type SharedStylingSteps = Pick<
  StylistSteps,
  "ranksStyleIcons" | "styleIconLines" | "fetchStyleIcons" | "saveStyleIcons" | "renderPreview" | "redrawPreview" | "finish"
>;

/** The steps every Styling shares, running on `ctx`, as this try of them. */
export function stylingSteps(ctx: StylingContext, { lastTry = true }: StepTry = {}): SharedStylingSteps {
  return {
    async ranksStyleIcons(stylingId) {
      const { stage } = await readRunningStyling(ctx.db, stylingId);
      // Any other has Style Icons already: the current ones, or its own copy of them.
      return stage === "style_icons";
    },

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
      const { photoType, hairCovered, countryCode, photoStyle } = await readRunningStyling(ctx.db, stylingId);
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
        await moveStage(tx, ctx.clock, stylingId, outfitsStage({ photoType, hairCovered }));
        await addSteps(tx, stylingId, STEPS.styleIconsFound({ countryCode, photoStyle, found: ranked.length }));
      });
    },

    async renderPreview(stylingId, outfitId) {
      const toRender = await readOutfitToRender(ctx.db, stylingId, outfitId);
      const pieces = await readPiecesToDraw(ctx.db, outfitId);
      // The Preview drawn goes back to the Stylist to check, read from Blob, beside its Products'
      // seller photos by their links, never the photos themselves.
      const toCheck = async (pathname: string): Promise<PreviewToCheck> => ({
        state: "ready",
        image: await readPhoto(ctx.blob, pathname),
        sellerPhotos: sellerPhotoLinks(pieces),
      });
      // A retry after the save went through has nothing left to draw. Only finishing marks a Preview failed.
      if (toRender.previewState !== "pending") return toRender.previewPathname ? toCheck(toRender.previewPathname) : { state: "refused" };
      let preview: PreviewResult;
      try {
        preview = await drawPreview(ctx, { lastTry }, toRender, pieces);
      } catch (error) {
        // Still failing on the last try, or failing for good, the Outfit is left without a Preview, as the Stylist's Notes say.
        if (lastTry || error instanceof UnretryableAiError) await savePreviewFailed(ctx.db, stylingId, outfitId).catch(() => {});
        throw error;
      }
      if (preview.refused) {
        await savePreview(ctx.db, stylingId, outfitId, { previewState: "refused", previewRefusalReason: preview.reason });
        return { state: "refused" };
      }
      const pathname = previewPathnameFor(toRender.consultationId, outfitId);
      await storePreview(ctx, stylingId, pathname, preview.image, () =>
        savePreview(ctx.db, stylingId, outfitId, { previewState: "ready", previewPathname: pathname }),
      );
      return toCheck(pathname);
    },

    async redrawPreview(stylingId, outfitId, correction) {
      const toRender = await readOutfitToRender(ctx.db, stylingId, outfitId);
      const pathname = previewRedrawPathnameFor(toRender.consultationId, outfitId);
      // A retry after the save went through has nothing left to draw.
      if (toRender.previewRedraw === "ready") return { state: "ready", image: await readPhoto(ctx.blob, pathname) };
      if (toRender.previewRedraw === "refused") return { state: "refused" };
      if (toRender.previewRedraw !== "pending") throw new Error(`Outfit ${outfitId} has no redraw of its Preview to draw.`);
      let preview: PreviewResult;
      try {
        preview = await drawPreview(ctx, { lastTry }, toRender, await readPiecesToDraw(ctx.db, outfitId), correction);
      } catch (error) {
        // Still failing on the last try, or failing for good, the redraw has failed, as the Stylist's Notes say.
        if (lastTry || error instanceof UnretryableAiError) await saveRedraw(ctx.db, stylingId, outfitId, "failed").catch(() => {});
        throw error;
      }
      if (preview.refused) {
        await saveRedraw(ctx.db, stylingId, outfitId, "refused");
        return { state: "refused" };
      }
      await storePreview(ctx, stylingId, pathname, preview.image, () => saveRedraw(ctx.db, stylingId, outfitId, "ready"));
      return { state: "ready", image: await readPhoto(ctx.blob, pathname) };
    },

    async finish(stylingId, outcome) {
      await finishStyling(ctx, stylingId, outcome);
      // A redrawn Preview none of whose images the Stylist kept is left without a Preview as its
      // Styling finishes, so both images go. A retry deletes them again, which does no harm.
      const unkept = await ctx.db
        .select({ id: outfit.id, consultationId: outfit.consultationId })
        .from(outfit)
        .where(and(eq(outfit.stylingId, stylingId), inArray(outfit.previewRedraw, UNKEPT_REDRAWS), eq(outfit.previewState, "failed")));
      await Promise.all(
        unkept
          .flatMap(({ id, consultationId }) => [previewPathnameFor(consultationId, id), previewRedrawPathnameFor(consultationId, id)])
          .map((pathname) => ctx.blob.delete(pathname)),
      );
    },
  };
}

/**
 * Where a Styling's Outfits start: at Brands for a body photo, whose Outfits are built on them, or
 * straight at Building Outfits. The checklist shows both as Building Outfits.
 */
export function outfitsStage(photo: PhotoCategoryFacts): StylingStage {
  return needsBrands(outfitCategories(photo)) ? "brands" : "building_outfits";
}

/** The Budget Tier a Styling's Brands are fetched and picked at. Only a Face Photo's Styling has none, and it has no Brands. */
export function brandsBudgetTier(stylingId: string, budgetTier: BudgetTier | null): BudgetTier {
  if (!budgetTier) throw new Error(`Styling ${stylingId} has no Budget Tier for its Brands.`);
  return budgetTier;
}

/**
 * The market a Styling's Products come from: the one it chose as it started, or for a Styling
 * started before Products existed, its Consultation's Country's.
 */
export function stylingMarket({ market, countryCode }: { market: ProductSearchMarket | null; countryCode: string }): ProductSearchMarket {
  return market ?? productSearchMarket(countryCode);
}

/** An Outfit's Pieces, as its Preview is drawn from them. */
async function readPiecesToDraw(db: Database, outfitId: string) {
  return db
    .select({ category: piece.category, item: piece.item, details: piece.details, productPhotoUrl: piece.productPhotoUrl })
    .from(piece)
    .where(eq(piece.outfitId, outfitId));
}

/**
 * One AI call drawing an Outfit's Preview from the photo and its Pieces, with a redraw's correction.
 * Each Product's photo is fetched here, inside the step, so no image passes between steps, and goes
 * to the model inline. One that can't be fetched fails a try the step will retry, before the model is
 * asked, as it may come then; on the last try, its Product is drawn from its title instead.
 */
async function drawPreview(
  ctx: StylingContext,
  { lastTry }: { lastTry: boolean },
  toRender: { photoPathname: string; photoType: PhotoType },
  pieces: Awaited<ReturnType<typeof readPiecesToDraw>>,
  correction?: string,
): Promise<PreviewResult> {
  const productPhoto = async (category: PieceCategory, url: string): Promise<Photo | null> => {
    try {
      return await ctx.productPhotos.fetch(url);
    } catch (error) {
      const failure = `The ${CATEGORY_LABELS[category]}'s Product photo couldn't be fetched: ${error instanceof Error ? error.message : "unknown error"}`;
      if (!lastTry) throw new Error(failure);
      console.warn(`${failure} It's drawn from its title.`);
      return null;
    }
  };
  const drawn = await Promise.all(
    pieces.toSorted(byCategoryOrder).map(async ({ category, item, details, productPhotoUrl }): Promise<PreviewPiece> => {
      if (category === "hairstyle") return { category, details: details ?? item };
      return { category, title: item, photo: productPhotoUrl ? await productPhoto(category, productPhotoUrl) : null };
    }),
  );
  // Never the Style Icon: only what the user is shown wearing.
  return ctx.ai.renderPreview({
    photo: await readPhoto(ctx.blob, toRender.photoPathname),
    photoType: toRender.photoType,
    pieces: drawn,
    ...(correction && { correction }),
  });
}

/** Stores a Preview the image model drew at `pathname`, as WebP, then saves it with `save`. */
async function storePreview(ctx: StylingContext, stylingId: string, pathname: string, image: Uint8Array, save: () => Promise<void>): Promise<void> {
  // The image model took a while: a Styling stopped or deleted meanwhile stores no Preview.
  await readRunningStyling(ctx.db, stylingId);
  // A try cut short between storing the Preview and saving it leaves it behind: store it afresh.
  await ctx.blob.delete(pathname);
  await ctx.blob.put(pathname, new Uint8Array(await sharp(image).webp().toBuffer()), "image/webp");
  try {
    await save();
  } catch (error) {
    // Never saved, nothing would show or delete it. Any other failure may have saved it after
    // all, so it stays for the retry to find.
    if (error instanceof StylingNotRunningError) await ctx.blob.delete(pathname).catch(() => {});
    throw error;
  }
}

/** Saves how an Outfit's pending redraw came out, with its step in the Stylist's Notes, only while its Styling runs. */
async function saveRedraw(db: Database, stylingId: string, outfitId: string, outcome: PreviewRedrawOutcome): Promise<void> {
  await whileRunning(db, stylingId, async (tx) => {
    const [saved] = await tx
      .update(outfit)
      .set({ previewRedraw: outcome })
      .where(and(eq(outfit.id, outfitId), eq(outfit.previewRedraw, "pending")))
      .returning({ position: outfit.position });
    if (saved) await addSteps(tx, stylingId, STEPS.previewRedrawn(saved.position, outcome));
  });
}

/** Saves a pending Preview's outcome, with its step in the Stylist's Notes, only while its Styling runs. */
async function savePreview(
  db: Database,
  stylingId: string,
  outfitId: string,
  outcome: { previewState: "ready"; previewPathname: string } | { previewState: "refused"; previewRefusalReason: PreviewRefusalReason },
): Promise<void> {
  await whileRunning(db, stylingId, async (tx) => {
    const [saved] = await tx
      .update(outfit)
      .set(outcome)
      .where(and(eq(outfit.id, outfitId), eq(outfit.previewState, "pending")))
      .returning({ position: outfit.position });
    if (saved) await addSteps(tx, stylingId, STEPS.previewDrawn(saved.position, outcome.previewState === "ready"));
  });
}

/** Adds the step saying a pending Preview couldn't be drawn, only while its Styling runs. Finishing the Styling marks it failed. */
async function savePreviewFailed(db: Database, stylingId: string, outfitId: string): Promise<void> {
  await whileRunning(db, stylingId, async (tx) => {
    const [pending] = await tx
      .select({ position: outfit.position })
      .from(outfit)
      .where(and(eq(outfit.id, outfitId), eq(outfit.previewState, "pending")));
    if (pending) await addSteps(tx, stylingId, STEPS.previewFailed(pending.position));
  });
}

/** Where a redraw is until the Stylist keeps one of its Preview's images. */
const UNKEPT_REDRAWS = PREVIEW_REDRAW_STATES.filter((state) => state !== "kept");

/**
 * How a Styling finishes: after its steps, which all completed or one of which broke, or as stuck,
 * its stage not having moved for STUCK_STYLING_MS.
 */
export type StylingFinish = StylingOutcome | "stuck";

/**
 * Finishes a running Styling, returning whether it did. Whatever Outfits it made switch in at once,
 * after any it adds to, and the Consultation is ready; a Preview not ready by then never will be, so
 * it's marked failed, as is one the Stylist redrew without keeping either image (the finish step
 * deletes those images). One that made none has failed, as nothing could be built if its steps all
 * completed, and otherwise as broken: nothing switches, and the Consultation keeps whatever it
 * showed before, or shows No Outfits. A Styling that isn't running any more is left as it is, and
 * so is one finishing as stuck whose stage has moved since it was found.
 */
export async function finishStyling(ctx: Pick<StylingContext, "db" | "clock">, stylingId: string, how: StylingFinish): Promise<boolean> {
  const finishedAt = ctx.clock.now();
  return ctx.db.transaction(async (tx) => {
    const running = await lockRunningStyling(tx, stylingId);
    if (!running || (how === "stuck" && !isStuck(running.stageMovedAt, finishedAt))) return false;
    // Its Brands and its searches' candidates go, however it finishes: nothing is reused by a later Styling.
    await tx.delete(pieceCandidates).where(eq(pieceCandidates.stylingId, stylingId));
    await tx.delete(styleIconBrands).where(eq(styleIconBrands.stylingId, stylingId));
    const beside = await readBuildingBeside(tx, { stylingId, kind: running.kind, consultationId: running.consultationId });
    const made = await tx
      .select({ id: outfit.id, position: outfit.position })
      .from(outfit)
      .where(eq(outfit.stylingId, stylingId))
      .orderBy(asc(outfit.position));
    if (made.length > 0) {
      // Outfits are numbered as they're saved, so there's no gap; should one appear, the rest move up, in order.
      for (const [index, outfitMade] of made.entries()) {
        const position = beside.firstPosition + index;
        if (outfitMade.position !== position) await tx.update(outfit).set({ position }).where(eq(outfit.id, outfitMade.id));
      }
      await tx
        .update(outfit)
        .set({ previewState: "failed" })
        .where(and(eq(outfit.stylingId, stylingId), eq(outfit.previewState, "pending")));
      // Nor will one the Stylist redrew without keeping either image, as when it ran out of turns:
      // nobody chose which shows the user as they are. The Stylist's Notes say so.
      const unkept = await tx
        .update(outfit)
        .set({ previewState: "failed", previewPathname: null })
        .where(and(eq(outfit.stylingId, stylingId), inArray(outfit.previewRedraw, UNKEPT_REDRAWS)))
        .returning({ position: outfit.position });
      await addSteps(tx, stylingId, ...unkept.toSorted((a, b) => a.position - b.position).map(({ position }) => STEPS.previewLeftUnkept(position)));
      // Any other replaces the current Outfits, and with them their Style Icons.
      if (!addsToCurrentOutfits(running.kind)) {
        await tx
          .update(outfit)
          .set({ current: false })
          .where(and(eq(outfit.consultationId, running.consultationId), eq(outfit.current, true)));
      }
      await tx.update(outfit).set({ current: true }).where(eq(outfit.stylingId, stylingId));
      // Each counts against the Outfit Allowance and the app-wide caps from now, Preview or not, even
      // if later replaced or deleted. The Demo Account's count against nothing.
      if (!running.onDemoAccount) await recordUsage(tx, { kind: "outfit", userId: running.userId, at: finishedAt }, made.length);
      await tx.update(styling).set({ status: "succeeded", outfitsMade: made.length, finishedAt }).where(eq(styling.id, stylingId));
      // What it built for becomes the Consultation's, together with its Outfits.
      await tx
        .update(consultation)
        .set({ state: "ready", photoStyle: running.photoStyle, budgetTier: running.budgetTier })
        .where(eq(consultation.id, running.consultationId));
      // The Stylist's Notes of the Outfits it replaced, if any, go with them, as do a failed Styling's with its line.
      await deleteStylistNotesNoLongerShown(tx, running.consultationId);
      return true;
    }
    const failureReason = how === "completed" ? "nothing_built" : "something_broke";
    await tx.update(styling).set({ status: "failed", failureReason, finishedAt }).where(eq(styling.id, stylingId));
    // A failed "Show 2 more Outfits" passes over the rest of the current Style Icons: that's every
    // Outfit it can build for the photo, until a re-styling builds new ones.
    if (addsToCurrentOutfits(running.kind) && beside.styleIconList) {
      await tx
        .update(styleIcon)
        .set({ status: "skipped" })
        .where(and(eq(styleIcon.stylingId, beside.styleIconList), eq(styleIcon.status, "unused")));
    }
    const [shown] = await tx
      .select({ id: outfit.id })
      .from(outfit)
      .where(and(eq(outfit.consultationId, running.consultationId), eq(outfit.current, true)))
      .limit(1);
    await tx
      .update(consultation)
      .set({ state: shown ? "ready" : "no_outfits" })
      .where(eq(consultation.id, running.consultationId));
    // Its own line takes the place of any earlier failed Styling's, whose notes go with it. A failed
    // "Show 2 more Outfits" has no line, so its notes go too.
    await deleteStylistNotesNoLongerShown(tx, running.consultationId);
    return true;
  });
}

/** The running Styling with what its steps build from, and its limits, or throws if it isn't running. */
export async function readRunningStyling(db: Database, stylingId: string) {
  const [row] = await db
    .select({
      consultationId: styling.consultationId,
      onDemoAccount: styling.onDemoAccount,
      kind: styling.kind,
      stage: styling.stage,
      photoStyle: styling.photoStyle,
      budgetTier: styling.budgetTier,
      market: styling.market,
      outfitsWanted: styling.outfitsWanted,
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
  const { onDemoAccount, ...running } = row;
  return { ...running, limits: stylingLimitsFor(onDemoAccount) };
}

/** The links to the seller photos of an Outfit's Products, in Piece order: those that have one. */
function sellerPhotoLinks(pieces: readonly { category: PieceCategory; item: string; productPhotoUrl: string | null }[]): SellerPhotoLink[] {
  return pieces
    .toSorted(byCategoryOrder)
    .flatMap(({ category, item, productPhotoUrl }) => (category !== "hairstyle" && productPhotoUrl ? [{ category, title: item, url: productPhotoUrl }] : []));
}

/** What one Outfit's Preview is rendered from, and whether it, or its redraw, is still to render. Throws if the Styling isn't running. */
async function readOutfitToRender(db: Database, stylingId: string, outfitId: string) {
  const [row] = await db
    .select({
      consultationId: outfit.consultationId,
      previewState: outfit.previewState,
      previewPathname: outfit.previewPathname,
      previewRedraw: outfit.previewRedraw,
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

/** The Consultation's photo, or one of its Previews, exactly as it was stored. */
export async function readPhoto(blob: BlobStore, pathname: string): Promise<Photo> {
  const { bytes, contentType } = await blob.get(pathname);
  if (!isPhotoMediaType(contentType)) throw new Error("The stored photo isn't a JPEG, PNG or WebP image.");
  return { bytes, mediaType: contentType };
}

/** Saves in one transaction, holding the Styling so it can't finish meanwhile, and only while it runs. */
export async function whileRunning<T>(
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
    .select({
      consultationId: styling.consultationId,
      userId: styling.userId,
      onDemoAccount: styling.onDemoAccount,
      kind: styling.kind,
      budgetTier: styling.budgetTier,
      photoStyle: styling.photoStyle,
      outfitsWanted: styling.outfitsWanted,
      stageMovedAt: styling.stageMovedAt,
    })
    .from(styling)
    .where(and(eq(styling.id, stylingId), eq(styling.status, "running")))
    .for("update");
  return row;
}

/** A tool step's refusal, which the Stylist reads and corrects on its next turn. */
export function refused(refusal: string): { ok: false; refusal: string } {
  return { ok: false, refusal };
}

export async function moveStage(tx: Transaction, clock: Clock, stylingId: string, stage: StylingStage): Promise<void> {
  await tx.update(styling).set({ stage, stageMovedAt: clock.now() }).where(eq(styling.id, stylingId));
}
