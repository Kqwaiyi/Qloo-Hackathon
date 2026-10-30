import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as z from "zod";

import { PHOTO_NOTICE_VERSION, type StylePreference } from "@/config/accounts";
import { countryCurrency } from "@/config/currencies";
import {
  type AgeGroup,
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
import type { PreviewRefusalReason, PreviewState, StylingFailureReason } from "@/config/stylings";
import { needsPhotoConsent, photoConsentStands, recordPhotoConsent } from "@/server/accounts/photo-consent";
import type { Photo, PhotoCheckReport, PhotoCheckResult } from "@/server/ai/provider";
import type { BlobStore } from "@/server/blob/store";
import type { Clock } from "@/server/clock";
import { photoPathnameFor } from "@/server/consultations/blob-pathnames";
import { deleteConsultationOf } from "@/server/consultations/deletion";
import { judgePhotoCheck, type PhotoRejection } from "@/server/consultations/photo-check";
import { readPhotoFile } from "@/server/consultations/photo-file";
import type { Database, Transaction } from "@/server/db/database";
import { consultation, outfit, piece, styleIcon, styling } from "@/server/db/schema";
import { readExchangeRates } from "@/server/exchange-rates/rates";
import type { OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import type { StylistNoteView } from "@/server/operations/stylings";
import { viewersConsultation, readViewer } from "@/server/operations/viewer";
import { ageGroupAt } from "@/server/outfit-assembly/age-group";
import { productSearchMarket } from "@/server/outfit-assembly/markets";
import { brandPriceRange, visitUrl } from "@/server/outfit-assembly/brands";
import { isDueForCheck, pricedOn } from "@/server/outfit-assembly/products";
import { outfitTotalText, type PriceViewer, priceText } from "@/server/outfit-assembly/prices";
import { isFromSupportedRegion } from "@/server/region-gate";
import { hasCurrentStyleIconLeft } from "@/server/stylings/current-outfits";
import { type LatestFailedStyling, readLatestFailedStyling, readShownStylingKind } from "@/server/stylings/failed";
import { AlreadyStylingError, checkStylingStart, createStyling, launchStyling, type StylingStartRefusal } from "@/server/stylings/start";
import { finishStuckStylings } from "@/server/stylings/stop";
import { readStylistNotesOf } from "@/server/stylings/stylist-notes";
import { readUsageLeft, recordUsage } from "@/server/usage/records";

/** The consent sheet's two boxes, as the user left them when they pressed Continue. */
const photoConsentTicksSchema = z.object({
  /** Storing their photos and having AI process their face and body. */
  storeAndProcess: z.boolean(),
  /** Sending their photos to Anthropic's Claude and Google's Gemini. */
  sendToAiProviders: z.boolean(),
});
export type PhotoConsentTicks = z.infer<typeof photoConsentTicksSchema>;

/** Whether both of the consent sheet's photo boxes were ticked. */
export function bothPhotoBoxesTicked(consent: PhotoConsentTicks | undefined): boolean {
  return consent?.storeAndProcess === true && consent.sendToAiProviders;
}

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
  const ticked = bothPhotoBoxesTicked(input.consent);
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

  const checked = await checkPhoto(ctx, input, async () => {
    if (countsUsage) await recordUsage(ctx.db, { kind: "photo_check", userId: user.id, at: ctx.clock.now() });
  });
  if (!checked.ok) return checked;
  const created = await createConsultation(ctx, { ...input, ...checked, outfitsWanted: stylingStart.outfitsWanted }, async (tx, now) => {
    // Consent withdrawn in another tab while the photo was checked leaves nothing behind. The Demo
    // Account's came with this request, and nobody can withdraw it.
    if (!user.isDemoAccount && !(await photoConsentStands(tx, user.id))) return null;
    return {
      userId: user.id,
      isDemoAccount: user.isDemoAccount,
      stylePreference: user.stylePreference,
      countryCode: user.countryCode,
      ageGroup: ageGroupAt(user.birthYear, user.birthMonth, now),
      // The Demo Account's judge agreed to the photo notice for this Consultation alone.
      photoNoticeAcceptedAt: user.isDemoAccount ? consentedAt : null,
    };
  });
  if (!created.ok && created.refusal === "abandoned") return { ok: false, refusal: "photo-consent-needed" };
  return created;
}

/** A photo the AI has checked and accepted, as it's stored, and what the check saw in it. */
export interface CheckedPhoto {
  photo: Photo;
  report: PhotoCheckReport;
}

/** Why a photo wasn't accepted: the file, the check itself, or the photo. */
export type PhotoCheckRefusal = { refusal: "unusable-file" | "check-errored" } | { refusal: "photo-rejected"; rejection: PhotoRejection };

/**
 * Has the AI check the photo against the Photo Type rules. `counted` runs once the check has
 * answered, whether it accepted the photo or not, so a photo-check limit counts it. A file the
 * browser didn't redraw, or a check that errors, doesn't count.
 */
export async function checkPhoto(
  ctx: Pick<OperationContext, "ai">,
  input: Pick<StartConsultationInput, "photo" | "photoType">,
  counted: () => Promise<void>,
): Promise<Result<CheckedPhoto, PhotoCheckRefusal>> {
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
  await counted();
  const verdict = judgePhotoCheck(photoCheck, input.photoType);
  if (!verdict.accepted) return { ok: false, refusal: "photo-rejected", rejection: verdict.rejection };
  return { ok: true, photo, report: verdict.report };
}

/** Whose a new Consultation is, and the profile every Styling on it uses, as it starts. */
export interface ConsultationOwner {
  userId: string;
  isDemoAccount: boolean;
  stylePreference: StylePreference;
  countryCode: string;
  ageGroup: AgeGroup;
  /**
   * When the photo notice was agreed to for this Consultation alone, which it then keeps, as the
   * Demo Account's and a Guest's are, or null for an agreement kept on the account.
   */
  photoNoticeAcceptedAt: Date | null;
}

/** A Consultation to create: its accepted photo, the Budget Tier asked for, and how many Outfits its first Styling may make. */
interface NewConsultation extends CheckedPhoto, Pick<StartConsultationInput, "photoType" | "budgetTier"> {
  outfitsWanted: number;
}

/**
 * Stores the accepted photo privately, then creates the Consultation and its first Styling in one
 * transaction, and sets the Styling going. `ownedBy` runs first in that transaction, at its time,
 * and says whose it is, or null to create nothing: `abandoned`. Nothing is left behind when nothing
 * is created, the photo included.
 */
export async function createConsultation(
  ctx: Pick<OperationContext, "db" | "clock" | "blob" | "stylings">,
  { photo, report, photoType, budgetTier: budgetTierAsked, outfitsWanted }: NewConsultation,
  ownedBy: (tx: Transaction, now: Date) => Promise<ConsultationOwner | null>,
): Promise<Result<{ consultationId: string }, { refusal: "already-styling" } | { refusal: "abandoned" }>> {
  const id = randomUUID();
  const photoPathname = photoPathnameFor(id, photo.mediaType);
  await ctx.blob.put(photoPathname, photo.bytes, photo.mediaType);
  let stylingId: string | null;
  try {
    stylingId = await ctx.db.transaction(async (tx) => {
      const now = ctx.clock.now();
      const owner = await ownedBy(tx, now);
      if (!owner) return null;
      const budgetTier = hasBudgetTier(photoType) ? (budgetTierAsked ?? DEFAULT_BUDGET_TIER) : null;
      await tx.insert(consultation).values({
        id,
        userId: owner.userId,
        createdAt: now,
        photoType,
        photoPathname,
        faceVisible: report.visible.face,
        hairVisible: report.visible.hair,
        upperBodyVisible: report.visible.upperBody,
        legsVisible: report.visible.legs,
        feetVisible: report.visible.feet,
        hairCovered: report.hairCovered,
        photoStyle: report.photoStyle,
        budgetTier,
        stylePreference: owner.stylePreference,
        countryCode: owner.countryCode,
        ageGroup: owner.ageGroup,
        state: "styling",
        ...(owner.photoNoticeAcceptedAt
          ? { acceptedPhotoNoticeVersion: PHOTO_NOTICE_VERSION, photoNoticeAcceptedAt: owner.photoNoticeAcceptedAt }
          : {}),
      });
      return createStyling(tx, now, {
        consultationId: id,
        userId: owner.userId,
        onDemoAccount: owner.isDemoAccount,
        kind: "first",
        budgetTier,
        photoStyle: report.photoStyle,
        outfitsWanted,
        market: productSearchMarket(owner.countryCode),
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
    return { ok: false, refusal: "abandoned" };
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
  /**
   * "Your AI Stylist's notes", below the Outfits: an entry for each Styling behind the current
   * Outfits, in the order their Outfits are shown, which is oldest first, with its Stylist's Notes. A
   * Styling made before the Stylist's Notes has none, and no entry, so a Consultation made before
   * them has no entries at all.
   */
  stylistNotes: StylingNotesView[];
  /**
   * One of its Outfits' Products wasn't found or checked today, so once the page has shown their
   * stored prices it asks for the price refresh in the background.
   */
  productsToCheck: boolean;
  /**
   * It's a Guest's Guest Consultation: one Styling's Outfits and no more. The page offers no
   * re-styling, and "Create an account to get more consultations" where "Show 2 more Outfits" would
   * be. A failed Styling can still be tried again.
   */
  isGuestConsultation: boolean;
}

/**
 * A Styling that made no Outfit: "We couldn't build Outfits … for this photo.", or, when it broke,
 * "Something went wrong while styling.", with Try again, and under that line its Stylist's Notes,
 * none for a Styling made before them. A Try again's kind is the one it tried again.
 */
export type FailedStyling = { reason: StylingFailureReason; notes: StylistNoteView[] } & (
  /** A new Consultation's: its Budget Tier, or null for a Face Photo, which has none. */
  | { kind: "first"; budgetTier: BudgetTier | null }
  | { kind: "photo_style_change"; photoStyle: PhotoStyleWords }
  | { kind: "budget_tier_change"; budgetTier: BudgetTier }
);

/** One entry of "Your AI Stylist's notes": a Styling behind the current Outfits, and its Stylist's Notes. */
export interface StylingNotesView {
  styling: StylingKindView;
  notes: StylistNoteView[];
}

/**
 * The kind of Styling an entry of "Your AI Stylist's notes" is for, which labels it: "First
 * Styling", "Show 2 more Outfits", "Budget Tier changed to Medium" or "Photo Style changed to
 * edgy". A Try again's kind is the one it tried again.
 */
export type StylingKindView =
  | { kind: "first" | "more" }
  | { kind: "budget_tier_change"; budgetTier: BudgetTier }
  | { kind: "photo_style_change"; photoStyle: PhotoStyleWords };

export interface OutfitView {
  id: string;
  /** Shown as "Outfit N". */
  position: number;
  /** Shown by name, never with Qloo's image. */
  styleIconName: string;
  preview: PreviewView;
  /**
   * What "Whole Outfit about" is followed by: its Products' prices added up, any Piece priced only by
   * its Brand's range adding that range, in the viewer's Country's currency as `PieceView`'s prices
   * are. Null when there's nothing to add up, as for a Hairstyle-only Outfit. A One-Piece's left-out
   * Bottom Brand isn't one of them, and nor is a Product no longer available.
   */
  total: string | null;
  /** How many of its Products are no longer available, which `total` leaves out and says it does. */
  leftOutOfTotal: number;
  /** One row per Piece, in Category order, whether or not there's a Preview: a One-Piece is one row. */
  pieces: PieceView[];
}

/** What an Outfit's card shows beside its Preview. */
export type OutfitCardContent = Pick<OutfitView, "position" | "styleIconName" | "total" | "leftOutOfTotal" | "pieces">;

/**
 * The Outfit's Preview: a signed link to it, valid for 1 hour from now, or why there's none: refused,
 * by the image model or by the AI Stylist, which kept neither of its images as both broke a hard
 * rule, or failed.
 */
export type PreviewView = { state: "ready"; url: string } | { state: "refused"; by: "image-model" | "stylist" } | { state: "failed" };

/**
 * A Piece's row, as its viewer is shown it: every price in whole units of the currency of the
 * viewer's Country, marked "≈" when it was converted from another, or in its own when no rate is
 * stored for either. Its `details` are for the Preview, never shown.
 */
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
   * An older Piece's price: its Brand's Qloo price range, such as "≈ Rp 359,720–Rp 2,158,320", or
   * null when Qloo has no price for it. Null for a Product, which shows its own price.
   */
  priceRange: string | null;
  /**
   * Where an older Piece's "Visit <Brand>" goes: its official site when that's an https URL, or null
   * for no link. Null for a Product, which links to its own page.
   */
  visitUrl: string | null;
}

/**
 * What a Product Piece's row shows of its Product, beside its title: its offer, or, once a check
 * finds it no longer offered where it was found, "No longer available" in place of a price and link.
 */
export type ProductView = OfferView | { available: false };

/** A Product's offer, as its row shows it: its price, dated, and where to buy it. */
export interface OfferView {
  available: true;
  /** Its offer's price, such as "≈ Rp 809,370" or "€45". */
  price: string;
  /** The UTC date its price was found or last checked, as YYYY-MM-DD: "on 21 Oct". */
  pricedOn: string;
  /** Its offer's page, where "View at <shop domain>" goes. */
  url: string;
  shopDomain: string;
}

/**
 * A Piece as it's stored, its prices as they were found: a Product's in its offer's own currency, an
 * older Piece's Brand range in US dollars. The landing page's samples are frozen in this form.
 */
export interface StoredPiece extends Omit<PieceView, "brand" | "product"> {
  brand: (Omit<BrandView, "priceRange"> & { priceRange: PriceRangeUsd | null }) | null;
  product: (Omit<OfferView, "price"> & { price: Price }) | { available: false } | null;
}

/** The columns of a Piece that its row shows. */
export const storedPieceColumns = {
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
  available: piece.available,
};

/** A Piece as it's stored, from its `storedPieceColumns`. */
export function storedPiece({
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
  available,
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
  available: boolean | null;
}): StoredPiece {
  // The check constraint keeps a Product Piece's fields all set, and any other Piece's all empty.
  let product: StoredPiece["product"] = null;
  if (offerUrl !== null && offerShopDomain !== null && price !== null && currency !== null && pricedAt !== null) {
    product = available
      ? { available, price: { amount: price, currency }, pricedOn: pricedOn(pricedAt), url: offerUrl, shopDomain: offerShopDomain }
      : { available: false };
  }
  let brand: StoredPiece["brand"] = null;
  if (brandName !== null) {
    brand = product
      ? { name: brandName, priceRange: null, visitUrl: null }
      : { name: brandName, priceRange: brandPriceRange(brandPriceUsdMin, brandPriceUsdMax), visitUrl: visitUrl(brandOfficialSite) };
  }
  return { category, item, why, brand, product };
}

/**
 * An Outfit's Pieces as `viewer` is shown them, every price as `priceText` writes it, and their
 * total, which leaves out any Product no longer available.
 */
export function piecesAsShown(pieces: readonly StoredPiece[], viewer: PriceViewer): Pick<OutfitView, "total" | "leftOutOfTotal" | "pieces"> {
  return {
    total: outfitTotalText(
      pieces.flatMap(({ brand, product }) => (product ? (product.available ? product.price : []) : (brand?.priceRange ?? []))),
      viewer,
    ),
    leftOutOfTotal: pieces.filter(({ product }) => product?.available === false).length,
    pieces: pieces.map(({ brand, product, ...shown }) => ({
      ...shown,
      brand: brand && { ...brand, priceRange: brand.priceRange && priceText(brand.priceRange, viewer) },
      product: product && (product.available ? { ...product, price: priceText(product.price, viewer) } : product),
    })),
  };
}

/**
 * One of the viewer's own Consultations, or null with no viewer, for anyone else's, or for one that
 * doesn't exist. Its prices are in the currency of the viewer's Country as it is now.
 */
export async function readConsultation(
  ctx: Pick<OperationContext, "auth" | "db" | "blob" | "clock" | "requestHeaders">,
  consultationId: string,
): Promise<ConsultationView | null> {
  const viewer = await readViewer(ctx);
  if (!viewer) return null;
  const [row] = await ctx.db
    .select()
    .from(consultation)
    .where(viewersConsultation(viewer, consultationId));
  if (!row) return null;
  const linkValidUntil = signedLinkValidUntil(ctx.clock);
  const outfitRows = await ctx.db
    .select({
      id: outfit.id,
      stylingId: outfit.stylingId,
      position: outfit.position,
      styleIconName: styleIcon.name,
      previewState: outfit.previewState,
      previewPathname: outfit.previewPathname,
      previewRefusalReason: outfit.previewRefusalReason,
    })
    .from(outfit)
    .innerJoin(styleIcon, eq(styleIcon.id, outfit.styleIconId))
    .where(and(eq(outfit.consultationId, row.id), eq(outfit.current, true)))
    .orderBy(asc(outfit.position));
  const pieceRows =
    outfitRows.length === 0
      ? []
      : await ctx.db
          .select({ outfitId: piece.outfitId, ...storedPieceColumns })
          .from(piece)
          .where(
            inArray(
              piece.outfitId,
              outfitRows.map((outfitRow) => outfitRow.id),
            ),
          );
  // Prices are shown in the currency of the viewer's Country now, whichever it was in when they were found.
  const priceViewer: PriceViewer = {
    countryCode: viewer.countryCode,
    rates: await readExchangeRates(ctx.db, [countryCurrency(viewer.countryCode), ...pieceRows.flatMap(({ currency }) => currency ?? [])]),
  };
  const outfits = await Promise.all(
    outfitRows.map(
      async ({ id, position, styleIconName, previewState, previewPathname, previewRefusalReason }): Promise<OutfitView> => ({
        id,
        position,
        styleIconName,
        preview: await previewView(ctx.blob, { previewState, previewPathname, previewRefusalReason }, linkValidUntil),
        ...piecesAsShown(
          pieceRows
            .filter((pieceRow) => pieceRow.outfitId === id)
            .toSorted(byCategoryOrder)
            .map(storedPiece),
          priceViewer,
        ),
      }),
    ),
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
    everyPreviewRefused: outfits.length > 0 && outfits.every(({ preview }) => preview.state === "refused" && preview.by === "image-model"),
    everyOutfitBuilt: !(await hasCurrentStyleIconLeft(ctx.db, row.id)),
    failedStyling: await failedStylingView(ctx.db, await readLatestFailedStyling(ctx.db, row.id)),
    // Outfits are shown in the order their Stylings made them, so each Styling's first is oldest first.
    stylistNotes: await stylistNotesView(ctx.db, row.id, [...new Set(outfitRows.map(({ stylingId }) => stylingId))]),
    productsToCheck: pieceRows.some(({ pricedAt }) => pricedAt !== null && isDueForCheck(pricedAt, ctx.clock.now())),
    // A Guest's only Consultation is their Guest Consultation.
    isGuestConsultation: viewer.isGuest,
  };
}

/** What the page says of the Consultation's latest Styling, if it failed: what it tried to build for, and its Stylist's Notes. */
async function failedStylingView(db: Database, failed: LatestFailedStyling | null): Promise<FailedStyling | null> {
  if (!failed) return null;
  const { stylingId, kind, budgetTier, photoStyle, reason } = failed;
  const notes = (await readStylistNotesOf(db, [stylingId])).get(stylingId) ?? [];
  switch (kind) {
    case "first":
      return { kind, budgetTier, reason, notes };
    case "photo_style_change":
      return { kind, photoStyle, reason, notes };
    case "budget_tier_change":
      // A Budget Tier change always has a Budget Tier to build at.
      return budgetTier && { kind, budgetTier, reason, notes };
  }
}

/** "Your AI Stylist's notes": an entry for each of these Stylings, in order, that has any. */
async function stylistNotesView(db: Database, consultationId: string, stylingIds: readonly string[]): Promise<StylingNotesView[]> {
  const notesOf = await readStylistNotesOf(db, stylingIds);
  const stylings =
    stylingIds.length === 0
      ? []
      : await db
          .select({ id: styling.id, kind: styling.kind, budgetTier: styling.budgetTier, photoStyle: styling.photoStyle, startedAt: styling.startedAt })
          .from(styling)
          .where(inArray(styling.id, [...stylingIds]));
  const entries = await Promise.all(
    stylingIds.map(async (stylingId): Promise<StylingNotesView | null> => {
      const notes = notesOf.get(stylingId);
      const behind = stylings.find(({ id }) => id === stylingId);
      if (!notes || !behind) return null;
      const kind = await readShownStylingKind(db, consultationId, behind);
      switch (kind) {
        case "first":
        case "more":
          return { styling: { kind }, notes };
        case "budget_tier_change":
          return behind.budgetTier && { styling: { kind, budgetTier: behind.budgetTier }, notes };
        case "photo_style_change":
          return { styling: { kind, photoStyle: behind.photoStyle }, notes };
        case null:
          return null;
      }
    }),
  );
  return entries.filter((entry) => entry !== null);
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
  {
    previewState: state,
    previewPathname: pathname,
    previewRefusalReason: reason,
  }: { previewState: PreviewState; previewPathname: string | null; previewRefusalReason: PreviewRefusalReason | null },
  validUntil: Date,
): Promise<PreviewView> {
  if (state === "ready" && pathname) return { state, url: await blob.signedUrl(pathname, validUntil) };
  if (state === "refused") return { state, by: reason === "not_kept" ? "stylist" : "image-model" };
  // Finishing a Styling marks every Preview not ready failed, so a current Outfit's is never pending.
  return { state: "failed" };
}
