import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as z from "zod";

import { PHOTO_NOTICE_VERSION } from "@/config/accounts";
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
  type Price,
  type PriceRangeUsd,
  SIGNED_LINK_LIFETIME_SECONDS,
} from "@/config/consultations";
import type { PreviewState, StylingFailureReason } from "@/config/stylings";
import { needsPhotoConsent, photoConsentStands, recordPhotoConsent } from "@/server/accounts/photo-consent";
import type { PhotoCheckResult } from "@/server/ai/provider";
import type { BlobStore } from "@/server/blob/store";
import type { Clock } from "@/server/clock";
import { photoPathnameFor } from "@/server/consultations/blob-pathnames";
import { deleteConsultationOf } from "@/server/consultations/deletion";
import { judgePhotoCheck, type PhotoRejection } from "@/server/consultations/photo-check";
import { readPhotoFile } from "@/server/consultations/photo-file";
import { consultation, outfit, piece, styleIcon } from "@/server/db/schema";
import type { OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import { ageGroupAt } from "@/server/outfit-assembly/age-group";
import { productSearchMarket } from "@/server/outfit-assembly/markets";
import { sumPrices } from "@/server/outfit-assembly/products";
import { brandPriceRange, outfitPriceRange, visitUrl } from "@/server/outfit-assembly/brands";
import { isFromSupportedRegion } from "@/server/region-gate";
import { hasCurrentStyleIconLeft } from "@/server/stylings/current-outfits";
import { type LatestFailedStyling, readLatestFailedStyling } from "@/server/stylings/failed";
import { AlreadyStylingError, checkStylingStart, createStyling, launchStyling, type StylingStartRefusal } from "@/server/stylings/start";
import { finishStuckStylings } from "@/server/stylings/stop";
import { readUsageLeft, recordUsage } from "@/server/usage/records";

/** The consent sheet's two boxes, as the user left them when they pressed Continue. */
const photoConsentTicksSchema = z.object({
  /** Storing their photos and having AI process their face and body. */
  storeAndProcess: z.boolean(),
  /** Sending their photos to Google's Gemini. */
  sendToGemini: z.boolean(),
});
export type PhotoConsentTicks = z.infer<typeof photoConsentTicksSchema>;

/** The shape of what "Get my Outfits" sends. The server action parses its form with this. */
export const startConsultationInputSchema = z.object({
  photo: z.instanceof(Blob),
  photoType: z.enum(PHOTO_TYPES),
  /** A body photo's chosen Budget Tier, No Budget when none is sent. A Face Photo has none. */
  budgetTier: z.enum(BUDGET_TIERS).optional(),
  /** The consent sheet's boxes. Left out or not both ticked, the user must already have agreed to the current photo notice. */
  consent: photoConsentTicksSchema.optional(),
});
export type StartConsultationInput = z.infer<typeof startConsultationInputSchema>;

export type StartConsultationRefusal =
  | { refusal: "signed-out" | "unverified" | "unusable-file" | "check-errored" }
  /** The user hasn't agreed to the current photo notice, and didn't tick both of the consent sheet's boxes. */
  | { refusal: "photo-consent-needed" }
  /** The user has had every photo the photo-check limit allows checked in the rolling window, until `moreFrom`. */
  | { refusal: "photo-check-limit"; moreFrom: Date }
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
  // Verification is a soft gate: an unverified user can look around, but can't start a Consultation.
  if (!user.emailVerified) return { ok: false, refusal: "unverified" };
  // The region gate comes before consent, so nothing is recorded from where the app isn't
  // available. The shared start check below runs it again for every other start, at no cost.
  if (!isFromSupportedRegion(ctx.requestHeaders)) return { ok: false, refusal: "unsupported-region" };
  // Both of the consent sheet's ticks are the user's agreement to the current photo notice, which
  // otherwise they must already have given. They're recorded on the user, except on the Demo
  // Account, where each judge agrees before every Consultation, which keeps it instead.
  const consentedAt = ctx.clock.now();
  const ticked = input.consent?.storeAndProcess === true && input.consent.sendToGemini;
  if (!ticked && needsPhotoConsent(user)) return { ok: false, refusal: "photo-consent-needed" };
  if (ticked && !user.isDemoAccount) await recordPhotoConsent(ctx.db, user.id, consentedAt);
  const stylingStart = await checkStylingStart(ctx, user);
  if (!stylingStart.ok) return stylingStart;
  // The Demo Account has no photo-check limit, as it has no other, so none of its usage is recorded.
  const countsUsage = !user.isDemoAccount;
  if (countsUsage) {
    const photoChecks = await readUsageLeft(ctx.db, { kind: "photo_check", userId: user.id, at: ctx.clock.now() });
    if (photoChecks.usedUp) return { ok: false, refusal: "photo-check-limit", moreFrom: photoChecks.moreFrom };
  }

  // Only requests that skipped the browser's redraw fail here, so it isn't a photo check.
  const photo = await readPhotoFile(input.photo);
  if (!photo) return { ok: false, refusal: "unusable-file" };

  let photoCheck: PhotoCheckResult;
  try {
    photoCheck = await ctx.ai.checkPhoto({ photo, photoType: input.photoType });
  } catch (error) {
    // Only the message: a provider's error can carry the request, and with it the photo. A check
    // that errors doesn't count towards the limit.
    console.error("The photo check errored:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, refusal: "check-errored" };
  }
  // Counted whether the photo is accepted or rejected.
  if (countsUsage) await recordUsage(ctx.db, { kind: "photo_check", userId: user.id, at: ctx.clock.now() });
  const verdict = judgePhotoCheck(photoCheck, input.photoType);
  if (!verdict.accepted) return { ok: false, refusal: "photo-rejected", rejection: verdict.rejection };
  const { report } = verdict;

  const id = randomUUID();
  const photoPathname = photoPathnameFor(id, photo.mediaType);
  await ctx.blob.put(photoPathname, photo.bytes, photo.mediaType);
  let stylingId: string | null;
  try {
    stylingId = await ctx.db.transaction(async (tx) => {
      // Consent withdrawn in another tab while the photo was checked leaves nothing behind. The Demo
      // Account's came with this request, and nobody can withdraw it.
      if (!user.isDemoAccount && !(await photoConsentStands(tx, user.id))) return null;
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
        // The Demo Account's judge agreed to the photo notice for this Consultation alone.
        ...(user.isDemoAccount ? { acceptedPhotoNoticeVersion: PHOTO_NOTICE_VERSION, photoNoticeAcceptedAt: consentedAt } : {}),
      });
      return createStyling(tx, now, {
        consultationId: id,
        userId: user.id,
        onDemoAccount: user.isDemoAccount,
        kind: "first",
        budgetTier,
        photoStyle: report.photoStyle,
        outfitsWanted: stylingStart.outfitsWanted,
        market: productSearchMarket(user.countryCode),
        stage: "style_icons",
      });
    });
  } catch (error) {
    await ctx.blob.delete(photoPathname).catch(() => {});
    // Another "Get my Outfits", or another Styling, started while the photo was checked.
    if (error instanceof AlreadyStylingError) return { ok: false, refusal: "already-styling" };
    throw error;
  }
  if (!stylingId) {
    await ctx.blob.delete(photoPathname);
    return { ok: false, refusal: "photo-consent-needed" };
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
  /**
   * "Show 2 more Outfits" has nothing left to build from: every one of the current Style Icons has
   * inspired an Outfit or been passed over. "That's every Outfit we can build for this photo."
   */
  everyOutfitBuilt: boolean;
  /**
   * What the Consultation's latest Styling tried to build for, when it made no Outfit, or null. The
   * Consultation kept what it had, so its Outfits, if any, are still from before it. A failed "Show
   * 2 more Outfits" isn't one: `everyOutfitBuilt` says it.
   */
  failedStyling: FailedStyling | null;
}

/**
 * A Styling that made no Outfit: "We couldn't build Outfits … for this photo.", or, when it broke,
 * "Something went wrong while styling.", with Try again. A Try again's kind is the one it tried
 * again.
 */
export type FailedStyling = { reason: StylingFailureReason } & (
  /** A new Consultation's: its Budget Tier, or null for a Face Photo, which has none. */
  | { kind: "first"; budgetTier: BudgetTier | null }
  | { kind: "photo_style_change"; photoStyle: PhotoStyleWords }
  | { kind: "budget_tier_change"; budgetTier: BudgetTier }
);

export interface OutfitView {
  id: string;
  /** Shown as "Outfit N". */
  position: number;
  /** Shown by name, never with Qloo's image. */
  styleIconName: string;
  preview: PreviewView;
  /** "Whole Outfit about …", or null when there's nothing to add up. */
  total: OutfitTotal | null;
  /** One row per Piece, in Category order, whether or not there's a Preview: a One-Piece is one row. */
  pieces: PieceView[];
}

/**
 * What a whole Outfit costs: its Products' prices added up, in their currency; or for an older
 * Outfit, the sums of its Brand Pieces' price ranges, in US dollars. A One-Piece's left-out Bottom
 * Brand isn't one of them.
 */
export type OutfitTotal = { kind: "products"; price: Price } | { kind: "brand_ranges"; usdRange: PriceRangeUsd };

/** What an Outfit's card shows beside its Preview. */
export type OutfitCardContent = Pick<OutfitView, "position" | "styleIconName" | "total" | "pieces">;

/** The Outfit's Preview: a signed link to it, valid for 1 hour from now, or why there's none. */
export type PreviewView = { state: "ready"; url: string } | { state: "refused" | "failed" };

/** A Piece's row. Its `details` are for the Preview, never shown. */
export interface PieceView {
  category: PieceCategory;
  /** A Product's title; for the Hairstyle, the cut; for an older Piece, the item the AI described. */
  item: string;
  why: string;
  /** The Brand it's built on, or null for the Hairstyle, which isn't something to buy. */
  brand: BrandView | null;
  /** The Product it is, or null for the Hairstyle and older Pieces. */
  product: ProductView | null;
}

export interface BrandView {
  name: string;
  /**
   * An older Piece's price: its Brand's `price_range_usd_min`–`max`, or null when Qloo has no price
   * for it. Null for a Product, which shows its own price.
   */
  priceRange: PriceRangeUsd | null;
  /**
   * Where an older Piece's "Visit <Brand>" goes: its official site when that's an https URL, or null
   * for no link. Null for a Product, which links to its own page.
   */
  visitUrl: string | null;
}

/** What a Product Piece's row shows of its Product, beside its title: its price, dated, and where to buy it. */
export interface ProductView {
  /** Its offer's price, in the offer's own currency. */
  price: Price;
  /** The UTC date its price was found, as YYYY-MM-DD: "on 21 Oct". */
  pricedOn: string;
  /** Its offer's page, where "View at <shop domain>" goes. */
  url: string;
  shopDomain: string;
}

/** The columns of a Piece that its row shows. */
export const pieceViewColumns = {
  category: piece.category,
  item: piece.item,
  why: piece.why,
  brandName: piece.brandName,
  brandOfficialSite: piece.brandOfficialSite,
  brandPriceUsdMin: piece.brandPriceUsdMin,
  brandPriceUsdMax: piece.brandPriceUsdMax,
  offerUrl: piece.offerUrl,
  offerShopDomain: piece.offerShopDomain,
  price: piece.price,
  currency: piece.currency,
  pricedAt: piece.pricedAt,
};

/** A Piece's row, from its `pieceViewColumns`. */
export function pieceView({
  category,
  item,
  why,
  brandName,
  brandOfficialSite,
  brandPriceUsdMin,
  brandPriceUsdMax,
  offerUrl,
  offerShopDomain,
  price,
  currency,
  pricedAt,
}: {
  category: PieceCategory;
  item: string;
  why: string;
  brandName: string | null;
  brandOfficialSite: string | null;
  brandPriceUsdMin: number | null;
  brandPriceUsdMax: number | null;
  offerUrl: string | null;
  offerShopDomain: string | null;
  price: number | null;
  currency: string | null;
  pricedAt: Date | null;
}): PieceView {
  // The check constraint keeps a Product Piece's fields all set, and any other Piece's all empty.
  const product: ProductView | null =
    offerUrl === null || offerShopDomain === null || price === null || currency === null || pricedAt === null
      ? null
      : { price: { amount: price, currency }, pricedOn: pricedAt.toISOString().slice(0, 10), url: offerUrl, shopDomain: offerShopDomain };
  let brand: BrandView | null = null;
  if (brandName !== null) {
    brand = product
      ? { name: brandName, priceRange: null, visitUrl: null }
      : { name: brandName, priceRange: brandPriceRange(brandPriceUsdMin, brandPriceUsdMax), visitUrl: visitUrl(brandOfficialSite) };
  }
  return { category, item, why, brand, product };
}

/**
 * "Whole Outfit about …" for an Outfit's Pieces: its Products' prices added up, when it has
 * Products, or else its Brand Pieces' price ranges. Null when there's nothing to add up, as for a
 * Hairstyle-only Outfit, or until prices convert, when its Products are priced in different
 * currencies.
 */
export function outfitTotal(pieces: readonly PieceView[]): OutfitTotal | null {
  const productPrices = pieces.flatMap((pieceView) => (pieceView.product ? [pieceView.product.price] : []));
  if (productPrices.length > 0) {
    const price = sumPrices(productPrices);
    return price && { kind: "products", price };
  }
  const usdRange = outfitPriceRange(pieces.map((pieceView) => pieceView.brand?.priceRange ?? null));
  return usdRange && { kind: "brand_ranges", usdRange };
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
          .select({ outfitId: piece.outfitId, ...pieceViewColumns })
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
        .map(pieceView);
      return {
        id,
        position,
        styleIconName,
        preview: await previewView(ctx.blob, previewState, previewPathname, linkValidUntil),
        total: outfitTotal(pieces),
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
    everyOutfitBuilt: !(await hasCurrentStyleIconLeft(ctx.db, row.id)),
    failedStyling: failedStylingView(await readLatestFailedStyling(ctx.db, row.id)),
  };
}

/** What the page says of the Consultation's latest Styling, if it failed: what it tried to build for. */
function failedStylingView(failed: LatestFailedStyling | null): FailedStyling | null {
  if (!failed) return null;
  const { kind, budgetTier, photoStyle, reason } = failed;
  switch (kind) {
    case "first":
      return { kind, budgetTier, reason };
    case "photo_style_change":
      return { kind, photoStyle, reason };
    case "budget_tier_change":
      // A Budget Tier change always has a Budget Tier to build at.
      return budgetTier && { kind, budgetTier, reason };
  }
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
  ctx: Pick<OperationContext, "auth" | "db" | "blob" | "clock" | "stylings" | "requestHeaders">,
): Promise<ConsultationSummary[]> {
  const user = await readSignedInUser(ctx);
  if (!user) return [];
  // Any stuck Styling finishes, so its row shows how it ended rather than "Styling…".
  await finishStuckStylings(ctx, { userId: user.id });
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
 * Deletes one of the signed-in user's own Consultations for good, even while it's Styling, as
 * `deleteConsultationOf` describes.
 */
export async function deleteConsultation(
  ctx: Pick<OperationContext, "auth" | "db" | "blob" | "clock" | "stylings" | "requestHeaders">,
  consultationId: string,
): Promise<Result<object, DeleteConsultationRefusal>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };
  const deleted = await deleteConsultationOf(ctx, { userId: user.id, consultationId });
  return deleted ? { ok: true } : { ok: false, refusal: "not-found" };
}

/** When a signed link made now stops working. */
export function signedLinkValidUntil(clock: Clock): Date {
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
