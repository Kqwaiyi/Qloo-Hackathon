import Link from "next/link";

import { LocalDate } from "@/components/local-date";
import { AiGeneratedBadge, OutfitCard, previewFrame } from "@/components/outfit-card";
import { secondaryButton } from "@/components/ui";
import { BUDGET_TIER_LABELS, hasBudgetTier, PHOTO_TYPE_LABELS, photoStyleText } from "@/config/consultations";
import { COPY } from "@/config/copy";
import { ROUTES } from "@/config/routes";
import type { ConsultationView, FailedStyling, PreviewView } from "@/server/operations/consultations";
import type { StylingProgressView } from "@/server/operations/stylings";
import type { UsageSummary } from "@/server/operations/usage";

import { Stepper } from "../stepper";
import { FailedStylingNotes, StylistNotesByStyling } from "../stylist-notes";
import { AllowanceLine } from "./allowance-line";
import { BudgetTierDropdown } from "./budget-tier-dropdown";
import { MoreOutfits } from "./more-outfits";
import { PhotoStyleEditor } from "./photo-style-editor";
import { PriceRefresh } from "./price-refresh";
import { StylingProgress } from "./styling-progress";
import { TryAgain } from "./try-again";

/** The header's allowance line, beside both the Budget Tier dropdown and the Photo Style editor. */
const RESTYLING_LINE_ID = "restyling-line";

/** The line beside a Guest's "Create an account to get more consultations". */
const WONT_CARRY_OVER_LINE_ID = "wont-carry-over-line";

/**
 * A Consultation opened while a Styling other than "Show 2 more Outfits" runs, from where it started
 * or on coming back: the Styling step again, following that Styling to its finish.
 */
export function StylingInPlace({ consultation, progress }: { consultation: ConsultationView; progress: StylingProgressView }) {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your Outfits</h1>
      <StylingProgress consultationId={consultation.id} photoUrl={consultation.photoUrl} photoType={consultation.photoType} initial={progress} />
    </>
  );
}

/**
 * A Consultation's results, once no Styling runs in the Styling step's place: its photo and what it
 * was styled for, a failed Styling's line, the Outfits and "Your AI Stylist's notes", for a signed-in
 * user's Consultation page and the Guest Page alike. `progress` is the "Show 2 more Outfits"
 * Styling running below the Outfits, if one is. `usage` is the viewer's, for the controls that
 * start Stylings beside their allowance lines.
 *
 * A Guest Consultation has no re-styling: no Budget Tier dropdown or Photo Style editor, and
 * "Create an account to get more consultations" where "Show 2 more Outfits" would be. Try again
 * stays, so a Styling that broke doesn't cost the Guest their Guest Consultation.
 */
export function ConsultationResults({
  consultation,
  progress,
  usage,
}: {
  consultation: ConsultationView;
  progress: StylingProgressView | null;
  usage: UsageSummary;
}) {
  // Re-stylings start from the header, but not while "Show 2 more Outfits" runs.
  const canRestyle = usage.stylingStart.ok && progress === null;

  return (
    <>
      {/* The stored prices show at once; any Product not checked today is checked in the background. */}
      {consultation.productsToCheck && <PriceRefresh consultationId={consultation.id} />}
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
          </p>
          {!consultation.isGuestConsultation && (
            <div className="mt-2 space-y-2 text-sm">
              {/* A Face Photo has no Budget Tier. */}
              {consultation.budgetTier && (
                <BudgetTierDropdown
                  consultationId={consultation.id}
                  budgetTier={consultation.budgetTier}
                  canStart={canRestyle}
                  allowanceLineId={RESTYLING_LINE_ID}
                />
              )}
              <PhotoStyleEditor
                consultationId={consultation.id}
                photoStyle={consultation.photoStyle}
                canStart={canRestyle}
                allowanceLineId={RESTYLING_LINE_ID}
              />
              <AllowanceLine id={RESTYLING_LINE_ID} stylingStart={usage.stylingStart} outfitsLeft={usage.outfitsLeft} className="text-stone-600" />
            </div>
          )}
        </div>
      </header>
      {consultation.failedStyling && (
        <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p role="status">{failedStylingLine(consultation.failedStyling, consultation)}</p>
          {consultation.failedStyling.reason === "something_broke" && (
            <TryAgain
              consultationId={consultation.id}
              stylingStart={usage.stylingStart}
              outfitsLeft={usage.outfitsLeft}
              onGuestPage={consultation.isGuestConsultation}
            />
          )}
          {/* None for a Styling made before the Stylist's Notes. */}
          {consultation.failedStyling.notes.length > 0 && <FailedStylingNotes notes={consultation.failedStyling.notes} className="mt-3" />}
        </div>
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
                <OutfitCard outfit={outfit} preview={<OutfitPreview preview={outfit.preview} styleIconName={outfit.styleIconName} />} />
              </li>
            ))}
          </ol>
          {/* None on a Consultation made before the Stylist's Notes. */}
          {consultation.stylistNotes.length > 0 && <StylistNotesByStyling entries={consultation.stylistNotes} className="mt-8" />}
          {consultation.isGuestConsultation ? (
            <MoreConsultationsWithAnAccount />
          ) : (
            <MoreOutfits
              consultationId={consultation.id}
              running={progress}
              everyOutfitBuilt={consultation.everyOutfitBuilt}
              suggestBudgetTier={hasBudgetTier(consultation.photoType)}
              stylingStart={usage.stylingStart}
              outfitsLeft={usage.outfitsLeft}
            />
          )}
        </>
      ) : (
        <p className="mt-8 rounded-xl border-2 border-dashed border-stone-200 p-8 text-center text-stone-600">No Outfits</p>
      )}
    </>
  );
}

/**
 * Below a Guest's Outfits, in place of "Show 2 more Outfits": the way to more, which is an account,
 * and that the Guest Consultation won't go with them.
 */
function MoreConsultationsWithAnAccount() {
  return (
    <section aria-label="More consultations" className="mt-8 flex flex-col items-center gap-1.5 text-center">
      <Link href={ROUTES.signUp} aria-describedby={WONT_CARRY_OVER_LINE_ID} className={secondaryButton}>
        {COPY.createAnAccountForMore}
      </Link>
      <p id={WONT_CARRY_OVER_LINE_ID} className="text-sm text-stone-600">
        {COPY.guestResultsWontCarryOver}
      </p>
    </section>
  );
}

/**
 * What a failed Styling says. A re-styling's also says the Outfits from before it are still here, if
 * there are any, by the Budget Tier or Photo Style it changed. A first Styling had none. A Guest
 * Consultation's suggests no other Budget Tier or Photo Style, which a Guest can't change.
 */
function failedStylingLine(
  failedStyling: FailedStyling,
  { budgetTier, photoStyle, outfits, photoType, isGuestConsultation }: ConsultationView,
): string {
  const byBudgetTier = failedStyling.kind === "budget_tier_change";
  // Only a body photo's Budget Tier can change, and it always has one.
  const previous = outfits.length === 0 ? null : byBudgetTier ? budgetTier && BUDGET_TIER_LABELS[budgetTier] : photoStyleText(photoStyle);
  if (failedStyling.reason === "something_broke") return COPY.stylingBroke(previous);
  switch (failedStyling.kind) {
    case "first": {
      const tier = failedStyling.budgetTier && BUDGET_TIER_LABELS[failedStyling.budgetTier];
      return isGuestConsultation ? COPY.guestFirstStylingBuiltNothing(tier) : COPY.firstStylingBuiltNothing(tier);
    }
    case "budget_tier_change":
      return COPY.budgetTierChangeBuiltNothing(BUDGET_TIER_LABELS[failedStyling.budgetTier], previous);
    case "photo_style_change":
      return COPY.photoStyleChangeBuiltNothing(photoStyleText(failedStyling.photoStyle), previous, hasBudgetTier(photoType));
  }
}

/** The Preview, always badged as AI-generated, or a placeholder saying why there's none. */
function OutfitPreview({ preview, styleIconName }: { preview: PreviewView; styleIconName: string }) {
  if (preview.state !== "ready") {
    return (
      <p className="flex min-h-32 items-center justify-center bg-stone-100 p-6 text-center text-sm text-stone-600 @2xl:aspect-[3/4] @2xl:w-64 @2xl:shrink-0 @2xl:self-start">
        {preview.state === "failed" ? COPY.previewFailed : preview.by === "stylist" ? COPY.previewNotKept : COPY.previewRefused}
      </p>
    );
  }
  return (
    <div className={previewFrame}>
      {/* A signed link, valid for 1 hour from when this page rendered. */}
      <img
        src={preview.url}
        alt={`Preview of you in the Outfit inspired by ${styleIconName}`}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <AiGeneratedBadge />
    </div>
  );
}
