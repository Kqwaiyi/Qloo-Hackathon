import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

import {
  type BrandCategory,
  type BudgetTier,
  byCategoryOrder,
  CATEGORY_LABELS,
  isBrandCategory,
  type PieceCategory,
} from "@/config/consultations";
import type { ProductSearchMarket } from "@/config/product-search";
import {
  addsToCurrentOutfits,
  BRAND_FETCHES_UP_FRONT,
  isStuck,
  MAX_BRAND_FETCHES_PER_STYLING,
  MAX_TAILORING_SUBSTITUTES,
  type PreviewRefusalReason,
  PRODUCT_CALLS_AT_ONCE,
  QLOO_CALLS_AT_ONCE,
  type StylingStage,
  TAILORING_ATTEMPTS,
} from "@/config/stylings";
import {
  type AiProvider,
  isPhotoMediaType,
  type Photo,
  type PreviewPiece,
  type TailoringBrand,
  type TailoringCandidate,
  type TailoringPiece,
} from "@/server/ai/provider";
import { checkTailoredPieces } from "@/server/ai/tailoring";
import type { BlobStore } from "@/server/blob/store";
import type { Clock } from "@/server/clock";
import { previewPathnameFor } from "@/server/consultations/blob-pathnames";
import type { Database, Transaction } from "@/server/db/database";
import { consultation, outfit, piece, pieceCandidates, styleIcon, styling } from "@/server/db/schema";
import {
  type BrandPicks,
  brandQueries,
  brandsUsedBy,
  fullestPool,
  isThinPool,
  needsBrands,
  type PickedBrand,
  type PieceSearchMade,
  planOutfitBrands,
} from "@/server/outfit-assembly/brands";
import { outfitCategories, type PhotoCategoryFacts } from "@/server/outfit-assembly/categories";
import { productSearchMarket } from "@/server/outfit-assembly/markets";
import { type Candidate, qualifyingCandidates, searchPriceFilter } from "@/server/outfit-assembly/products";
import { rankStyleIcons, styleIconLines, styleIconQuery } from "@/server/outfit-assembly/style-icons";
import type { ProductPhotos } from "@/server/product-photos/photos";
import { lookUpBrandMatch, readBrandMatches } from "@/server/product-search/brand-matches";
import { type ProductSearch, UnretryableProductSearchError } from "@/server/product-search/provider";
import type { QlooBrand, QlooClient } from "@/server/qloo/client";
import { recordUsage } from "@/server/usage/records";

import type { BuildOutfitsSteps, OutfitPlan, OutfitTry, StylingOutcome } from "./build-outfits";
import { readBuildingBeside } from "./current-outfits";

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

/** The "build Outfits" steps, running on `ctx`, as this try of them. */
export function stylingSteps(ctx: StylingContext, { lastTry = true }: StepTry = {}): BuildOutfitsSteps {
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
        await moveStage(tx, ctx.clock, stylingId, outfitsStage({ photoType, hairCovered }));
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
        const beside = await readBuildingBeside(tx, { stylingId, kind: planning!.kind, consultationId: running.consultationId });
        const filled = new Set(made.map((outfitMade) => outfitMade.position));
        const open = Array.from({ length: running.outfitsWanted }, (_, index) => beside.firstPosition + index).filter(
          (position) => !filled.has(position),
        );
        // Each failed tailoring was a try beyond the Outfits wanted: a substitute.
        const triesLeft = running.outfitsWanted + MAX_TAILORING_SUBSTITUTES - made.length - planning!.tailoringFailures;
        const count = Math.min(open.length, triesLeft);
        if (count <= 0 || !beside.styleIconList) return tailoring([]);
        const icons = await tx
          .select({ id: styleIcon.id, line: styleIcon.line })
          .from(styleIcon)
          .where(and(eq(styleIcon.stylingId, beside.styleIconList), eq(styleIcon.status, "unused")))
          .orderBy(asc(styleIcon.position));
        if (!needsBrands(outfitCategories(planning!))) {
          return tailoring(icons.slice(0, count).map((icon, index) => ({ position: open[index]!, styleIconId: icon.id, brands: null })));
        }

        const budgetTier = brandsBudgetTier(stylingId, planning!.budgetTier);
        // Style Icons are planned in order, so one whose Brands haven't come back holds up the rest.
        const firstUnfetched = icons.findIndex((icon) => !(icon.id in brandsByStyleIcon));
        const ready = (firstUnfetched === -1 ? icons : icons.slice(0, firstUnfetched)).map((icon) => ({
          styleIconId: icon.id,
          line: icon.line,
          brands: brandsByStyleIcon[icon.id]!,
        }));
        const matches = await readBrandMatches(
          tx,
          ctx.clock.now(),
          ready.flatMap(({ brands }) => brands.map((brand) => brand.entityId)),
        );
        const searched = await readPieceSearches(tx, stylingId);
        // Brands are never passed over for a product search that's down, every search the Styling
        // sent having failed, none answering: it breaks instead, for Try again.
        if (searched.length > 0 && searched.every((search) => !search.answered)) throw new ProductSearchDownError(stylingId);
        const plan = planOutfitBrands(ready, budgetTier, count, brandsUsedBy([...beside.outfits, ...made]), matches, searched);
        // Skipped quietly, and not a tailoring failure: the next Style Icon takes its place.
        if (plan.skipped.length > 0) await tx.update(styleIcon).set({ status: "skipped" }).where(inArray(styleIcon.id, plan.skipped));
        // The picks' Brands are looked up a few at a time, in the order the picks use them: a later
        // pick may change once an earlier pick's Brand turns out unknown. Their Pieces are searched
        // the same way once they're all known: a later pick may change once an earlier one's
        // search finds nothing.
        const lookUpBrands = plan.lookUpBrands.slice(0, PRODUCT_CALLS_AT_ONCE);
        const searchProducts = plan.searches.slice(0, PRODUCT_CALLS_AT_ONCE);
        const stillWanted = count - plan.picked.length;
        let fetchBrandsFor: string[] = [];
        if (stillWanted > 0) {
          const fetchedSoFar = Object.keys(brandsByStyleIcon).length;
          // A first Styling fetches a spare up front, in case a Style Icon can't complete an Outfit.
          const fetchCount = Math.min(
            fetchedSoFar === 0 && planning!.kind === "first" ? BRAND_FETCHES_UP_FRONT : stillWanted,
            MAX_BRAND_FETCHES_PER_STYLING - fetchedSoFar,
            QLOO_CALLS_AT_ONCE,
          );
          fetchBrandsFor = icons.slice(ready.length, ready.length + Math.max(fetchCount, 0)).map((icon) => icon.id);
        }
        if (fetchBrandsFor.length > 0 || lookUpBrands.length > 0 || searchProducts.length > 0) {
          return { fetchBrandsFor, lookUpBrands, searchProducts, tries: [] };
        }
        if (plan.picked.length > 0 && planning!.stage === "brands") await moveStage(tx, ctx.clock, stylingId, "building_outfits");
        return tailoring(plan.picked.map((picked, index) => ({ position: open[index]!, styleIconId: picked.styleIconId, brands: picked.brands })));
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

    async lookUpBrand(stylingId, brand) {
      // A Styling that stopped meanwhile makes no more product-search calls.
      await readRunningStyling(ctx.db, stylingId);
      await lookUpBrandMatch(ctx, brand);
    },

    // The search is in the Styling's market, the Outfit's line and the Piece's Category, for the
    // Brand alone, new and in stock. It's never loosened: one that finds nothing, or still errors
    // on the step's last try, passes the Brand over for the Category instead.
    async searchProducts(stylingId, { styleIconId, category, brand }) {
      const running = await readRunningStyling(ctx.db, stylingId);
      const [icon] = await ctx.db
        .select({ line: styleIcon.line })
        .from(styleIcon)
        .where(and(eq(styleIcon.id, styleIconId), eq(styleIcon.consultationId, running.consultationId)));
      if (!icon) throw new Error(`Style Icon ${styleIconId} isn't one of the Styling's Consultation's.`);
      const brandId = (await readBrandMatches(ctx.db, ctx.clock.now(), [brand.entityId])).get(brand.entityId);
      if (!brandId) throw new Error(`The product search doesn't know Brand ${brand.entityId}, or it hasn't been looked up.`);
      const market = stylingMarket(running);
      const priceFilter = searchPriceFilter(brand, market);
      let candidates: Candidate[] | null;
      try {
        const products = await ctx.productSearch.searchProducts({ brandId, category, line: icon.line, market, priceRange: priceFilter });
        candidates = qualifyingCandidates(products, { brandId, line: icon.line, priceFilter, officialSite: brand.officialSite });
      } catch (error) {
        // A refused key fails the Styling at once; any other error is the step's to retry first.
        if (!lastTry || error instanceof UnretryableProductSearchError) throw error;
        console.warn(
          `A ${CATEGORY_LABELS[category]} search still failed after its retries, so its Brand is passed over: ${error instanceof Error ? error.message : "unknown error"}`,
        );
        candidates = null;
      }
      await whileRunning(ctx.db, stylingId, async (tx) => {
        await tx
          .insert(pieceCandidates)
          .values({ stylingId, styleIconId, category, brandEntityId: brand.entityId, candidates, searchedAt: ctx.clock.now() })
          // A retry after the save went through keeps the first search's candidates.
          .onConflictDoNothing();
      });
    },

    async tailorOutfit(stylingId, { position, styleIconId, brands }, attempt) {
      const toTailor = await readOutfitToTailor(ctx.db, stylingId, styleIconId);
      // A retry after the save went through has nothing left to do.
      if (toTailor.styleIconStatus !== "unused") return "saved";
      const categories = outfitCategories(toTailor);
      if (needsBrands(categories) !== (brands !== null)) throw new Error("An Outfit's Brands don't match its Categories.");
      const searches = brands && (await readCandidates(ctx.db, stylingId, styleIconId, brands));
      const asked: TailoringPiece[] = categories.map((category) =>
        isBrandCategory(category)
          ? { category, brand: tailoringBrand(brands![category]), candidates: searches![category].candidates.map(tailoringCandidate) }
          : { category },
      );
      const pieces = checkTailoredPieces(
        await ctx.ai.tailorPieces({
          photo: await readPhoto(ctx.blob, toTailor.photoPathname),
          photoType: toTailor.photoType,
          ageGroup: toTailor.ageGroup,
          photoStyle: toTailor.photoStyle,
          line: toTailor.line,
          styleIconName: toTailor.styleIconName,
          pieces: asked,
        }),
        asked,
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
            if (tailored.category === "hairstyle") {
              const { category, item, details, why, unknownCut } = tailored;
              return { id: randomUUID(), outfitId, category, item, details, why, unknownCut };
            }
            // A Product Piece: the candidate picked, as its search found it in the Styling's market.
            const { category, productId, why } = tailored;
            const brand = brands![category];
            const { candidates, searchedAt } = searches![category];
            const product = candidates.find((candidate) => candidate.id === productId)!;
            return {
              id: randomUUID(),
              outfitId,
              category,
              item: product.title,
              why,
              brandEntityId: brand.entityId,
              brandName: brand.name,
              brandOfficialSite: brand.officialSite,
              brandPriceUsdMin: brand.priceRangeUsdMin,
              brandPriceUsdMax: brand.priceRangeUsdMax,
              productId: product.id,
              productPhotoUrl: product.photoUrl,
              offerUrl: product.offer.url,
              offerShopDomain: product.offer.shopDomain,
              price: product.offer.price,
              currency: product.offer.currency,
              market: stylingMarket(toTailor),
              pricedAt: searchedAt,
              available: true,
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
      const pieces = await ctx.db
        .select({ category: piece.category, item: piece.item, details: piece.details, productPhotoUrl: piece.productPhotoUrl })
        .from(piece)
        .where(eq(piece.outfitId, outfitId));
      // Each Product's photo is fetched here, inside the step, so no image passes between steps,
      // and goes to the model inline. One that can't be fetched fails a try the step will retry,
      // before the model is asked, as it may come then; on the last try, its Product is drawn from
      // its title instead.
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
      const preview = await ctx.ai.renderPreview({
        photo: await readPhoto(ctx.blob, toRender.photoPathname),
        photoType: toRender.photoType,
        pieces: drawn,
      });
      if (preview.refused) {
        await savePreview(ctx.db, stylingId, outfitId, { previewState: "refused", previewRefusalReason: preview.reason });
        return;
      }
      // The image model took a while: a Styling stopped or deleted meanwhile stores no Preview.
      await readRunningStyling(ctx.db, stylingId);
      const pathname = previewPathnameFor(toRender.consultationId, outfitId);
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

    async finish(stylingId, outcome) {
      await finishStyling(ctx, stylingId, outcome);
    },
  };
}

/** Where a Styling's Outfits start: at Brands for a body photo, whose Outfits are built on them, or straight at Building Outfits. */
export function outfitsStage(photo: PhotoCategoryFacts): StylingStage {
  return needsBrands(outfitCategories(photo)) ? "brands" : "building_outfits";
}

/** A plan that tailors these Outfits, with nothing to fetch, look up or search first. With none, Building Outfits is done. */
function tailoring(tries: OutfitTry[]): OutfitPlan {
  return { fetchBrandsFor: [], lookUpBrands: [], searchProducts: [], tries };
}

/** The Budget Tier a Styling's Brands are fetched and picked at. Only a Face Photo's Styling has none, and it has no Brands. */
function brandsBudgetTier(stylingId: string, budgetTier: BudgetTier | null): BudgetTier {
  if (!budgetTier) throw new Error(`Styling ${stylingId} has no Budget Tier for its Brands.`);
  return budgetTier;
}

/**
 * The market a Styling's Products come from: the one it chose as it started, or for a Styling
 * started before Products existed, its Consultation's Country's.
 */
function stylingMarket({ market, countryCode }: { market: ProductSearchMarket | null; countryCode: string }): ProductSearchMarket {
  return market ?? productSearchMarket(countryCode);
}

/**
 * The Styling's Pieces' searches so far, whether each found a Product that qualified, and whether it
 * answered at all rather than still erroring after its retries.
 */
async function readPieceSearches(tx: Transaction, stylingId: string): Promise<(PieceSearchMade & { answered: boolean })[]> {
  const rows = await tx
    .select({
      styleIconId: pieceCandidates.styleIconId,
      category: pieceCandidates.category,
      brandEntityId: pieceCandidates.brandEntityId,
      found: sql<boolean>`coalesce(jsonb_array_length(${pieceCandidates.candidates}), 0) > 0`,
      answered: sql<boolean>`${pieceCandidates.candidates} is not null`,
    })
    .from(pieceCandidates)
    .where(eq(pieceCandidates.stylingId, stylingId));
  return rows.flatMap(({ category, ...search }) => (category === "hairstyle" ? [] : [{ ...search, category }]));
}

/**
 * Each Brand Piece's candidates, as its search for the Outfit's Brand found them, and when. Throws
 * for a Piece not yet searched, or whose search never answered.
 */
async function readCandidates(db: Database, stylingId: string, styleIconId: string, brands: BrandPicks) {
  const rows = await db
    .select({
      category: pieceCandidates.category,
      brandEntityId: pieceCandidates.brandEntityId,
      candidates: pieceCandidates.candidates,
      searchedAt: pieceCandidates.searchedAt,
    })
    .from(pieceCandidates)
    .where(and(eq(pieceCandidates.stylingId, stylingId), eq(pieceCandidates.styleIconId, styleIconId)));
  const searchFor = (category: BrandCategory) => {
    const found = rows.find((row) => row.category === category && row.brandEntityId === brands[category].entityId);
    if (!found?.candidates) throw new Error(`The ${category} of Style Icon ${styleIconId}'s Outfit hasn't been searched, or its search never answered.`);
    return { candidates: found.candidates, searchedAt: found.searchedAt };
  };
  return { top: searchFor("top"), bottom: searchFor("bottom"), shoes: searchFor("shoes") };
}

/** What tailoring is told about a picked Brand: never its entity ID, official site or prices. */
function tailoringBrand({ name, categoryTags }: PickedBrand): TailoringBrand {
  return { name, categoryTags };
}

/** What tailoring is told about a candidate Product: its words, never its photo or offer. */
function tailoringCandidate({ id, title, description, colours }: Candidate): TailoringCandidate {
  return { id, title, description, colours };
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
 * How a Styling finishes: after its steps, which all completed or one of which broke, or as stuck,
 * its stage not having moved for STUCK_STYLING_MS.
 */
export type StylingFinish = StylingOutcome | "stuck";

/**
 * Finishes a running Styling, returning whether it did. Whatever Outfits it made switch in at once,
 * after any it adds to, and the Consultation is ready; a Preview not ready by then never will be, so
 * it's marked failed. One that made none has failed, as nothing could be built if its steps all
 * completed, and otherwise as broken: nothing switches, and the Consultation keeps whatever it
 * showed before, or shows No Outfits. A Styling that isn't running any more is left as it is, and
 * so is one finishing as stuck whose stage has moved since it was found.
 */
export async function finishStyling(ctx: Pick<StylingContext, "db" | "clock">, stylingId: string, how: StylingFinish): Promise<boolean> {
  const finishedAt = ctx.clock.now();
  return ctx.db.transaction(async (tx) => {
    const running = await lockRunningStyling(tx, stylingId);
    if (!running || (how === "stuck" && !isStuck(running.stageMovedAt, finishedAt))) return false;
    // Its searches' candidates go, however it finishes: nothing is reused by a later Styling.
    await tx.delete(pieceCandidates).where(eq(pieceCandidates.stylingId, stylingId));
    const beside = await readBuildingBeside(tx, { stylingId, kind: running.kind, consultationId: running.consultationId });
    const made = await tx
      .select({ id: outfit.id, position: outfit.position })
      .from(outfit)
      .where(eq(outfit.stylingId, stylingId))
      .orderBy(asc(outfit.position));
    if (made.length > 0) {
      // A position whose Style Icons all failed tailoring leaves a gap: the rest move up, in order.
      for (const [index, outfitMade] of made.entries()) {
        const position = beside.firstPosition + index;
        if (outfitMade.position !== position) await tx.update(outfit).set({ position }).where(eq(outfit.id, outfitMade.id));
      }
      await tx
        .update(outfit)
        .set({ previewState: "failed" })
        .where(and(eq(outfit.stylingId, stylingId), eq(outfit.previewState, "pending")));
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
    return true;
  });
}

/** The running Styling with what its steps build from, or throws if it isn't running. */
async function readRunningStyling(db: Database, stylingId: string) {
  const [row] = await db
    .select({
      consultationId: styling.consultationId,
      kind: styling.kind,
      stage: styling.stage,
      photoStyle: styling.photoStyle,
      budgetTier: styling.budgetTier,
      market: styling.market,
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
      market: styling.market,
      countryCode: consultation.countryCode,
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

async function moveStage(tx: Transaction, clock: Clock, stylingId: string, stage: StylingStage): Promise<void> {
  await tx.update(styling).set({ stage, stageMovedAt: clock.now() }).where(eq(styling.id, stylingId));
}
