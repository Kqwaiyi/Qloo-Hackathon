import type { ReactNode } from "react";

import { AppFrame } from "@/components/app-frame";
import { NavLink } from "@/components/nav-link";
import { Wordmark } from "@/components/wordmark";
import { APP_HOME, ROUTES } from "@/config/routes";
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
    <>
      <RenewSignIn />
      <AppFrame
        header={
          <>
            <Wordmark href={APP_HOME} />
            <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
              <NavLink href={ROUTES.newConsultation}>New Consultation</NavLink>
              <NavLink href={ROUTES.myConsultations}>My Consultations</NavLink>
              <NavLink href={ROUTES.settings}>Settings</NavLink>
              <form action={signOutAction}>
                <SignOutButton label="Sign out" className="rounded-lg px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-100" />
              </form>
            </nav>
          </>
        }
        banner={
          verification &&
          !verification.verified && <VerifyEmailBanner email={verification.email} deletionDate={deletionDateText(verification.deletionDate)} />
        }
      >
        {children}
      </AppFrame>
    </>
  );
}
