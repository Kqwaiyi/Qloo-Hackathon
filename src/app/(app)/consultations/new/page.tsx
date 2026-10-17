import type { Metadata } from "next";

import { successNotice } from "@/components/ui";
import { COPY } from "@/config/copy";
import { EMAIL_VERIFIED_PARAM } from "@/config/routes";
import { getEmailVerification, requireSignedInUser } from "@/server/data/session";

import { Stepper } from "../stepper";
import { NewConsultation } from "./new-consultation";

export const metadata: Metadata = { title: "New Consultation" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSignedInUser();
  const [verification, params] = await Promise.all([getEmailVerification(), searchParams]);
  return (
    <>
      {params[EMAIL_VERIFIED_PARAM] !== undefined && verification?.verified && (
        <p role="status" className={successNotice}>
          {COPY.emailVerified}
        </p>
      )}
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New Consultation</h1>
      {verification && !verification.verified ? <VerifyFirst email={verification.email} /> : <NewConsultation />}
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
