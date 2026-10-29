import Link from "next/link";
import type { ReactNode } from "react";

import { AppFrame } from "@/components/app-frame";
import { Wordmark } from "@/components/wordmark";
import { COPY } from "@/config/copy";
import { ROUTES } from "@/config/routes";

/**
 * The Guest Page's own layout, outside the signed-in app's: it never sends anyone to sign-in. Its
 * header has the wordmark, tagged "Guest", and one way on, to create an account: no New
 * Consultation, My Consultations, Settings or Sign out, since a Guest has none of those.
 */
export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame
      header={
        <>
          <div className="flex items-center gap-2">
            <Wordmark href={ROUTES.home} />
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">{COPY.guestTag}</span>
          </div>
          <Link href={ROUTES.signUp} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
            {COPY.createAnAccount}
          </Link>
        </>
      }
    >
      {children}
    </AppFrame>
  );
}
