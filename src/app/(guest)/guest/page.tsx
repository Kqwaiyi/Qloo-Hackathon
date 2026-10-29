import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ConsultationResults, StylingInPlace } from "@/app/(app)/consultations/[id]/consultation-results";
import { NewConsultation } from "@/app/(app)/consultations/new/new-consultation";
import { Stepper } from "@/app/(app)/consultations/stepper";
import { stepHeading } from "@/app/(app)/consultations/ui";
import { LimitMessage } from "@/components/limit-message";
import { COPY } from "@/config/copy";
import { COUNTRY_OPTIONS } from "@/config/countries";
import { APP_HOME, ROUTES } from "@/config/routes";
import { addsToCurrentOutfits } from "@/config/stylings";
import { getConsultation, getStylingStatus } from "@/server/data/consultations";
import { getGuestPage } from "@/server/data/guests";
import { getSignedInUser } from "@/server/data/session";
import type { GuestPageView } from "@/server/operations/guest-consultations";

export const metadata: Metadata = { title: COPY.guestPageTitle };

/**
 * The Guest Page: the app as a Guest sees it. With a guest cookie that works, it's their Guest
 * Consultation, running or finished; otherwise it's the New Consultation steps, unless something
 * keeps every Styling from starting. Someone signed in has the app itself instead: their session
 * is who the Consultation operations act for, so a guest cookie in the same browser couldn't be.
 */
export default async function GuestPage() {
  if (await getSignedInUser()) redirect(APP_HOME);
  const page = await getGuestPage();
  switch (page.show) {
    case "guest-consultation":
      return <GuestConsultation consultationId={page.consultationId} />;
    case "new-consultation":
      return (
        <>
          {/* The page's name, kept quiet: each step's question is the headline. */}
          <h1 className="mb-3 font-medium sm:mb-4">New Consultation</h1>
          <NewConsultation guest={{ countries: COUNTRY_OPTIONS, countryCode: page.countryCode ?? "" }} />
        </>
      );
    case "closed":
      return <GuestPageClosed refusal={page.refusal} />;
  }
}

/** The Guest Consultation, as a signed-in user's Consultation page shows theirs. */
async function GuestConsultation({ consultationId }: { consultationId: string }) {
  // The status first: a Styling that finishes between the two reads shows its Outfits.
  const status = await getStylingStatus(consultationId);
  const consultation = status && (await getConsultation(consultationId));
  // Gone since the Guest Page found it: the page opens on what's there now.
  if (!status || !consultation) redirect(ROUTES.guest);
  const { progress } = status;
  if (progress && !addsToCurrentOutfits(progress.kind)) return <StylingInPlace consultation={consultation} progress={progress} />;
  return <ConsultationResults consultation={consultation} progress={progress} usage={null} />;
}

/**
 * Instead of the Photo Type step while no Guest Consultation can start: to a browser the age gate
 * has blocked, as sign-up is, or while the region gate, an app-wide cap or a backstop stops every
 * Styling, saying why and, where the limit says, when that changes.
 */
function GuestPageClosed({ refusal }: { refusal: Extract<GuestPageView, { show: "closed" }>["refusal"] }) {
  return (
    <>
      <h1 className="mb-3 font-medium sm:mb-4">New Consultation</h1>
      <Stepper current={1} />
      <section aria-labelledby="guest-page-closed-heading">
        <h2 id="guest-page-closed-heading" className={`${stepHeading} max-w-[24ch]`}>
          {refusal.refusal === "under-18" ? COPY.under18 : <LimitMessage refusal={refusal} />}
        </h2>
      </section>
    </>
  );
}
