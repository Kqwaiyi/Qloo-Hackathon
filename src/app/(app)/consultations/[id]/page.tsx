import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LocalDate } from "@/components/local-date";
import { textLink } from "@/components/ui";
import {
  BUDGET_TIER_LABELS,
  CATEGORY_LABELS,
  hasBudgetTier,
  PHOTO_TYPE_LABELS,
  photoStyleText,
  type PriceRangeUsd,
} from "@/config/consultations";
import { COPY } from "@/config/copy";
import { ROUTES } from "@/config/routes";
import { addsToCurrentOutfits } from "@/config/stylings";
import { getConsultation, getStylingStatus } from "@/server/data/consultations";
import { getUsageSummary } from "@/server/data/usage";
import type { ConsultationView, FailedRestyling, OutfitView, PieceView, PreviewView } from "@/server/operations/consultations";

import { Stepper } from "../stepper";
import { MoreOutfits } from "./more-outfits";
import { PhotoStyleEditor } from "./photo-style-editor";
import { StylingProgress } from "./styling-progress";

export const metadata: Metadata = { title: "Your Outfits" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The status first: a Styling that finishes between the two reads shows its Outfits.
  const status = await getStylingStatus(id);
  const consultation = status && (await getConsultation(id));
  if (!status || !consultation) notFound();
  const { progress } = status;

  // Opened mid-Styling, from here or on coming back, it's the Styling step again. "Show 2 more
  // Outfits" instead keeps the Outfits in view, with its own compact checklist below them.
  if (progress && !addsToCurrentOutfits(progress.kind)) {
    return (
      <>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your Outfits</h1>
        <StylingProgress
          consultationId={consultation.id}
          photoUrl={consultation.photoUrl}
          photoType={consultation.photoType}
          initial={progress}
        />
      </>
    );
  }
  const usage = await getUsageSummary();
  if (!usage) redirect(ROUTES.signIn);

  return (
    <>
      <Stepper current={4} />
      {/* Top-aligned, so the photo stays put as the Photo Style editor opens. */}
      <header className="flex flex-wrap items-start gap-4">
        {/* A signed link, valid for 1 hour from when this page rendered. */}
        <img
          src={consultation.photoUrl}
          alt={`Your ${PHOTO_TYPE_LABELS[consultation.photoType]}`}
          className="h-28 w-21 rounded-lg bg-stone-100 object-cover"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your Outfits</h1>
          <p className="text-sm text-stone-600">
            {PHOTO_TYPE_LABELS[consultation.photoType]} · <LocalDate date={consultation.createdAt} />
            {consultation.budgetTier && <> · Budget Tier: {BUDGET_TIER_LABELS[consultation.budgetTier]}</>}
          </p>
          <PhotoStyleEditor
            consultationId={consultation.id}
            photoStyle={consultation.photoStyle}
            stylingRunning={progress !== null}
            stylingStart={usage.stylingStart}
            outfitsLeft={usage.outfitsLeft}
          />
        </div>
      </header>
      {consultation.failedRestyling && (
        <p role="status" className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {failedRestylingLine(consultation.failedRestyling, consultation)}
        </p>
      )}
      {consultation.outfits.length > 0 ? (
        <>
          {consultation.everyPreviewRefused && (
            <p role="status" className="mt-8 rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-700">
              {COPY.everyPreviewRefused}
            </p>
          )}
          <ol aria-label="Outfits" className="mt-8 space-y-5">
            {consultation.outfits.map((outfit) => (
              <li key={outfit.id}>
                <OutfitCard outfit={outfit} />
              </li>
            ))}
          </ol>
          <MoreOutfits
            consultationId={consultation.id}
            running={progress}
            everyOutfitBuilt={consultation.everyOutfitBuilt}
            suggestBudgetTier={hasBudgetTier(consultation.photoType)}
            stylingStart={usage.stylingStart}
            outfitsLeft={usage.outfitsLeft}
          />
        </>
      ) : (
        <p className="mt-8 rounded-xl border-2 border-dashed border-stone-200 p-8 text-center text-stone-600">No Outfits</p>
      )}
    </>
  );
}

/** What a failed re-styling says, and that the Outfits from before it are still here, if there are any. */
function failedRestylingLine(failedRestyling: FailedRestyling, { photoStyle, outfits, photoType }: ConsultationView): string {
  const previous = outfits.length > 0 ? photoStyleText(photoStyle) : null;
  return failedRestyling.reason === "something_broke"
    ? COPY.photoStyleChangeBroke(previous)
    : COPY.photoStyleChangeBuiltNothing(photoStyleText(failedRestyling.photoStyle), previous, hasBudgetTier(photoType));
}

/** One Outfit, its Preview beside it. Its Style Icon is shown by name only, never with Qloo's image of them. */
function OutfitCard({ outfit }: { outfit: OutfitView }) {
  return (
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-white md:flex">
      <OutfitPreview preview={outfit.preview} styleIconName={outfit.styleIconName} />
      <div className="flex-1 p-5">
        <h2 className="text-lg font-semibold">
          Outfit {outfit.position} · Inspired by {outfit.styleIconName}
        </h2>
        {outfit.priceRange && <p className="text-sm text-stone-600">Whole Outfit about {usdRange(outfit.priceRange)}</p>}
        {outfit.pieces.length > 0 && (
          <ul aria-label="Pieces" className="mt-3">
            {outfit.pieces.map((piece) => (
              <li key={piece.category}>
                <PieceRow piece={piece} styleIconName={outfit.styleIconName} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** The Preview, always badged as AI-generated, or a placeholder saying why there's none. */
function OutfitPreview({ preview, styleIconName }: { preview: PreviewView; styleIconName: string }) {
  if (preview.state !== "ready") {
    return (
      <p className="flex min-h-32 items-center justify-center bg-stone-100 p-6 text-center text-sm text-stone-600 md:aspect-[3/4] md:w-64 md:shrink-0 md:self-start">
        {preview.state === "refused" ? COPY.previewRefused : COPY.previewFailed}
      </p>
    );
  }
  return (
    <div className="relative aspect-[3/4] bg-stone-100 md:w-64 md:shrink-0 md:self-start">
      {/* A signed link, valid for 1 hour from when this page rendered. */}
      <img
        src={preview.url}
        alt={`Preview of you in the Outfit inspired by ${styleIconName}`}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute top-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-xs font-semibold text-white">{COPY.aiGenerated}</span>
    </div>
  );
}

/**
 * A Piece's row. A Brand Piece names its Brand, with the Brand's price range and a "Visit <Brand>"
 * link when it has them. The Hairstyle names its Style Icon instead, with no price or link: it
 * isn't something to buy.
 */
function PieceRow({ piece, styleIconName }: { piece: PieceView; styleIconName: string }) {
  const { brand } = piece;
  return (
    <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 border-t border-stone-100 py-3 sm:grid-cols-[80px_1fr_auto]">
      <div className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{CATEGORY_LABELS[piece.category]}</div>
      <div>
        <div className="font-medium">{piece.item}</div>
        <div className="text-sm text-stone-600">{brand ? brand.name : `Style Icon: ${styleIconName}`}</div>
        <p className="mt-1 text-sm text-stone-600 italic">{piece.why}</p>
      </div>
      {brand && (brand.priceRange || brand.visitUrl) && (
        <div className="col-start-2 text-sm sm:col-start-auto sm:text-right">
          {brand.priceRange && <div className="font-medium">{usdRange(brand.priceRange)}</div>}
          {brand.visitUrl && (
            <a href={brand.visitUrl} target="_blank" rel="noopener noreferrer" className={textLink}>
              Visit {brand.name}
              {/* U+FE0E keeps the arrow a plain glyph, not an emoji. */}
              <span aria-hidden="true"> {"↗︎"}</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** A price range in whole US dollars, such as "$20–$120". */
function usdRange({ min, max }: PriceRangeUsd): string {
  const usd = (amount: number) => `$${Math.round(amount).toLocaleString("en-US")}`;
  return min === max ? usd(min) : `${usd(min)}–${usd(max)}`;
}
