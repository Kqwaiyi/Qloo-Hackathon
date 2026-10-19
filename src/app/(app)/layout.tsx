import type { ReactNode } from "react";

import { NavLink } from "@/components/nav-link";
import { Wordmark } from "@/components/wordmark";
import { APP_HOME, ROUTES } from "@/config/routes";
import { onest } from "@/fonts/onest";
import { deletionDateText } from "@/server/accounts/verification";
import { getEmailVerification, requireSignedInUser } from "@/server/data/session";

import { signOutAction } from "./actions";
import { RenewSignIn } from "./renew-sign-in";
import { SignOutButton } from "./sign-out-button";
import { VerifyEmailBanner } from "./verify-email-banner";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSignedInUser();
  const verification = await getEmailVerification();
  return (
    // A page with a data-fit-screen part (each New Consultation step) is exactly the screen's
    // height, never shorter than 34rem: the header and banner take what they need, and the page the
    // rest, to fit its step into without the window scrolling.
    <div
      className={`min-h-screen ${onest.className} has-[[data-fit-screen]]:flex has-[[data-fit-screen]]:h-dvh has-[[data-fit-screen]]:min-h-[34rem] has-[[data-fit-screen]]:flex-col`}
    >
      <RenewSignIn />
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Wordmark href={APP_HOME} />
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
            <NavLink href={ROUTES.newConsultation}>New Consultation</NavLink>
            <NavLink href={ROUTES.myConsultations}>My Consultations</NavLink>
            <NavLink href={ROUTES.settings}>Settings</NavLink>
            <form action={signOutAction}>
              <SignOutButton label="Sign out" className="rounded-lg px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-100" />
            </form>
          </nav>
        </div>
      </header>
      {verification && !verification.verified && (
        <VerifyEmailBanner email={verification.email} deletionDate={deletionDateText(verification.deletionDate)} />
      )}
      <main className="mx-auto max-w-3xl px-4 py-8 has-[[data-fit-screen]]:flex has-[[data-fit-screen]]:min-h-0 has-[[data-fit-screen]]:w-full has-[[data-fit-screen]]:flex-1 has-[[data-fit-screen]]:flex-col has-[[data-fit-screen]]:pt-5 has-[[data-fit-screen]]:pb-4 sm:has-[[data-fit-screen]]:pt-7 sm:has-[[data-fit-screen]]:pb-6">
        {children}
      </main>
    </div>
  );
}
