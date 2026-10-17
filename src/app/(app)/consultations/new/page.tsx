import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LimitMessage, type LimitRefusal } from "@/components/limit-message";
import { successNotice, textLink } from "@/components/ui";
import { COPY } from "@/config/copy";
import { EMAIL_VERIFIED_PARAM, ROUTES } from "@/config/routes";
import { needsPhotoConsent } from "@/server/accounts/photo-consent";
import { requireSignedInUser } from "@/server/data/session";
import { getUsageSummary } from "@/server/data/usage";

import { Stepper } from "../stepper";
import { NewConsultation } from "./new-consultation";

export const metadata: Metadata = { title: "New Consultation" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSignedInUser();
  const [usage, params] = await Promise.all([getUsageSummary(), searchParams]);
  if (!usage) redirect(ROUTES.signIn);
  const { stylingStart } = usage;
  return (
    <>
      {params[EMAIL_VERIFIED_PARAM] !== undefined && user.emailVerified && (
        <p role="status" className={successNotice}>
          {COPY.emailVerified}
        </p>
      )}
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New Consultation</h1>
      {stylingStart.ok ? (
        <NewConsultation
          outfitsWanted={stylingStart.outfitsWanted}
          outfitsLeft={usage.outfitsLeft}
          photoConsentNeeded={needsPhotoConsent(user)}
        />
      ) : stylingStart.refusal === "unverified" ? (
        <VerifyFirst email={user.email} />
      ) : (
        <StylingUnavailable refusal={stylingStart} />
      )}
    </>
  );
}

/** Instead of the Photo Type step until the user verifies, so nobody takes a photo only to be stopped. */
function VerifyFirst({ email }: { email: string }) {
  return (
    <>
      <Stepper current={1} />
      <section aria-labelledby="verify-first-heading" className="rounded-xl border-2 border-dashed border-stone-200 p-8 text-center">
        <h2 id="verify-first-heading" className="text-xl font-semibold tracking-tight">
          Verify your email first
        </h2>
        <p className="mx-auto mt-2 max-w-md text-stone-600">
          Open the link we sent to <span className="font-medium text-stone-900">{email}</span> to start your first Consultation.
          Can&apos;t find it? Resend it, or fix the address, from the banner above.
        </p>
      </section>
    </>
  );
}

/**
 * Instead of the Photo Type step while no Styling can start, such as once today's Outfits are made,
 * an app-wide cap is reached or the request comes from a country Gemini doesn't serve, saying why
 * and, where the limit says, when that changes.
 */
function StylingUnavailable({ refusal }: { refusal: LimitRefusal }) {
  return (
    <>
      <Stepper current={1} />
      <section aria-labelledby="styling-unavailable-heading" className="rounded-xl border-2 border-dashed border-stone-200 p-8 text-center">
        <h2 id="styling-unavailable-heading" className="text-xl font-semibold tracking-tight">
          <LimitMessage refusal={refusal} />
        </h2>
        <p className="mx-auto mt-2 max-w-md text-stone-600">
          You can still open and delete your Consultations in{" "}
          <Link href={ROUTES.myConsultations} className={textLink}>
            My Consultations
          </Link>
          .
        </p>
      </section>
    </>
  );
}
