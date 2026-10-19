import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LocalDate } from "@/components/local-date";
import { PhotoTypeSketch } from "@/components/photo-type-silhouette";
import { SharedDemoAccountNote } from "@/components/shared-demo-account-note";
import { BUDGET_TIER_LABELS, PHOTO_TYPE_LABELS, PHOTO_TYPES } from "@/config/consultations";
import { consultationRoute, ROUTES } from "@/config/routes";
import { getMyConsultations } from "@/server/data/consultations";
import { requireSignedInUser } from "@/server/data/session";
import { getUsageSummary } from "@/server/data/usage";
import type { ConsultationSummary } from "@/server/operations/consultations";
import type { UsageSummary } from "@/server/operations/usage";

import { AllowanceLine } from "./[id]/allowance-line";
import { DeleteConsultation } from "./delete-consultation";
import { inkPill } from "./ui";

export const metadata: Metadata = { title: "My Consultations" };

/** The line under "New Consultation": what a new one would use of today's Outfits, or why none can start. */
const ALLOWANCE_LINE_ID = "allowance-line";

export default async function Page() {
  const user = await requireSignedInUser();
  const [consultations, usage] = await Promise.all([getMyConsultations(), getUsageSummary()]);
  if (!usage) redirect(ROUTES.signIn);
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <div>
          <h1 className="text-[2rem] leading-[1.1] font-medium tracking-[-0.02em] sm:text-[2.5rem]">My Consultations</h1>
          <p className="mt-2 text-mute">
            Every photo {user.isDemoAccount ? "submitted on this account" : <>you&apos;ve submitted</>} and the Outfits it got.
          </p>
        </div>
        {consultations.length > 0 && <StartOne usage={usage} className="sm:items-end sm:text-right" />}
      </header>
      {user.isDemoAccount && <SharedDemoAccountNote className="mt-6" />}
      {consultations.length === 0 ? (
        <NoConsultations usage={usage} />
      ) : (
        <ul aria-label="Consultations" className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6">
          {consultations.map((consultation) => (
            <li key={consultation.id}>
              <ConsultationTile consultation={consultation} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** "New Consultation", with what it would use of today's Outfits under it. */
function StartOne({ usage, className = "" }: { usage: UsageSummary; className?: string }) {
  return (
    <div className={`flex flex-col items-start gap-2.5 ${className}`}>
      <Link href={ROUTES.newConsultation} aria-describedby={ALLOWANCE_LINE_ID} className={inkPill}>
        New Consultation
      </Link>
      <AllowanceLine
        id={ALLOWANCE_LINE_ID}
        stylingStart={usage.stylingStart}
        outfitsLeft={usage.outfitsLeft}
        className="max-w-[34ch] text-sm text-mute empty:hidden"
      />
    </div>
  );
}

/** Before the first Consultation: the three photos one can start from, and the way to start. */
function NoConsultations({ usage }: { usage: UsageSummary }) {
  return (
    <section aria-labelledby="no-consultations-heading" className="mt-10 rounded-xl border border-dashed border-ink/20 px-6 py-10 sm:px-10 sm:py-12">
      <div aria-hidden="true" className="flex gap-3">
        {PHOTO_TYPES.map((type) => (
          <PhotoTypeSketch key={type} photoType={type} className="aspect-[4/5] w-14 rounded bg-white text-ash ring-1 ring-ink/10" />
        ))}
      </div>
      <h2 id="no-consultations-heading" className="mt-8 text-xl font-medium tracking-[-0.01em]">
        No Consultations yet.
      </h2>
      <p className="mt-2 max-w-[48ch] text-mute">
        Each one starts with a photo of you, and ends with complete Outfits picked with Qloo&apos;s taste data and shown on you.
      </p>
      <StartOne usage={usage} className="mt-6" />
    </section>
  );
}

/**
 * One Consultation as a print on a contact sheet: its photo through a signed link, valid for 1 hour
 * from when this page rendered, what it holds, and when it was made. The whole print opens it;
 * Delete sits above that.
 */
function ConsultationTile({ consultation }: { consultation: ConsultationSummary }) {
  const photoType = PHOTO_TYPE_LABELS[consultation.photoType];
  const outfits = outfitsLine(consultation);
  // Read out after "Delete", which says nothing of its print on its own.
  const whichConsultation = (
    <span className="sr-only">
      {" "}
      the {photoType} Consultation from <LocalDate date={consultation.createdAt} />
    </span>
  );
  return (
    <article className="group relative flex flex-col">
      <h2 className="mt-3 leading-snug font-medium">
        <Link
          href={consultationRoute(consultation.id)}
          className="decoration-1 underline-offset-[3px] outline-none group-hover:underline after:absolute after:-inset-1.5 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-ink"
        >
          <span className="sr-only">Open the </span>
          {photoType}
          <span className="sr-only">
            {" "}
            Consultation from <LocalDate date={consultation.createdAt} />, {outfits}
          </span>
        </Link>
      </h2>
      <div className="flex items-baseline justify-between gap-2 text-sm text-mute">
        <LocalDate date={consultation.createdAt} />
        <DeleteConsultation consultationId={consultation.id}>{whichConsultation}</DeleteConsultation>
      </div>
      {consultation.budgetTier && (
        <p className="text-sm text-mute">Budget Tier: {BUDGET_TIER_LABELS[consultation.budgetTier]}</p>
      )}
      <div className="relative order-first aspect-[4/5] overflow-hidden rounded-md bg-card">
        {/* Named by the link above. */}
        <img src={consultation.photoUrl} alt="" className="size-full object-cover" />
        <span
          aria-hidden="true"
          className={`absolute bottom-2 left-2 inline-flex h-7 items-center gap-2 rounded-full px-3 text-sm font-medium ${
            consultation.state === "styling" ? "bg-ink text-paper" : consultation.state === "no_outfits" ? "bg-white/90 text-mute" : "bg-white/90 text-ink"
          }`}
        >
          {consultation.state === "styling" && <span className="size-1.5 rounded-full bg-paper motion-safe:animate-pulse" />}
          {outfits}
        </span>
      </div>
    </article>
  );
}

/** How many Outfits it shows, or that it's still Styling, or that none could be built. */
function outfitsLine({ state, outfitCount }: ConsultationSummary): string {
  if (state === "styling") return "Styling…";
  if (state === "no_outfits") return "No Outfits";
  return outfitCount === 1 ? "1 Outfit" : `${outfitCount} Outfits`;
}
