import type { Metadata } from "next";
import Link from "next/link";

import { LocalDate } from "@/components/local-date";
import { SharedDemoAccountNote } from "@/components/shared-demo-account-note";
import { textLink } from "@/components/ui";
import { BUDGET_TIER_LABELS, PHOTO_TYPE_LABELS } from "@/config/consultations";
import { consultationRoute, ROUTES } from "@/config/routes";
import { getMyConsultations } from "@/server/data/consultations";
import { requireSignedInUser } from "@/server/data/session";
import type { ConsultationSummary } from "@/server/operations/consultations";

import { DeleteConsultation } from "./delete-consultation";

export const metadata: Metadata = { title: "My Consultations" };

export default async function Page() {
  const user = await requireSignedInUser();
  const consultations = await getMyConsultations();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">My Consultations</h1>
      <p className="mt-1 text-stone-600">
        Every photo {user.isDemoAccount ? "submitted on this account" : <>you&apos;ve submitted</>} and the Outfits it got.
      </p>
      {user.isDemoAccount && <SharedDemoAccountNote className="mt-4" />}
      {consultations.length === 0 ? (
        <p className="mt-8 rounded-xl border-2 border-dashed border-stone-200 p-10 text-center text-stone-600">
          No Consultations yet.{" "}
          <Link href={ROUTES.newConsultation} className={textLink}>
            Start one
          </Link>
        </p>
      ) : (
        <ul aria-label="Consultations" className="mt-6 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {consultations.map((consultation) => (
            <li key={consultation.id}>
              <ConsultationRow consultation={consultation} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** One Consultation: its photo through a signed link, valid for 1 hour from when this page rendered, and what it holds. */
function ConsultationRow({ consultation }: { consultation: ConsultationSummary }) {
  const photoType = PHOTO_TYPE_LABELS[consultation.photoType];
  // Read out after "Open" and "Delete", which say nothing of their row on their own.
  const whichConsultation = (
    <span className="sr-only">
      {" "}
      the {photoType} Consultation from <LocalDate date={consultation.createdAt} />
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
      <img
        src={consultation.photoUrl}
        alt={`Your ${photoType}`}
        className="h-16 w-12 shrink-0 rounded-md bg-stone-100 object-cover"
      />
      <div className="min-w-40 flex-1">
        <p className="font-medium">
          {photoType} · {outfitsLine(consultation)}
        </p>
        <p className="text-sm text-stone-600">
          <LocalDate date={consultation.createdAt} />
          {consultation.budgetTier && <> · Budget Tier: {BUDGET_TIER_LABELS[consultation.budgetTier]}</>}
        </p>
      </div>
      <div className="flex gap-2">
        <Link
          href={consultationRoute(consultation.id)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
        >
          Open{whichConsultation}
        </Link>
        <DeleteConsultation consultationId={consultation.id}>{whichConsultation}</DeleteConsultation>
      </div>
    </div>
  );
}

/** How many Outfits it shows, or that it's still Styling, or that none could be built. */
function outfitsLine({ state, outfitCount }: ConsultationSummary): string {
  if (state === "styling") return "Styling…";
  if (state === "no_outfits") return "No Outfits";
  return outfitCount === 1 ? "1 Outfit" : `${outfitCount} Outfits`;
}
