import type { ReactNode } from "react";

import { NavLink } from "@/components/nav-link";
import { Wordmark } from "@/components/wordmark";
import { ROUTES } from "@/config/routes";

/** The Privacy Policy and Terms: public, with no sign-in. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4">
          <Wordmark href={ROUTES.home} />
          <nav aria-label="Legal" className="flex gap-1 text-sm">
            <NavLink href={ROUTES.privacy}>Privacy</NavLink>
            <NavLink href={ROUTES.terms}>Terms</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">{children}</main>
    </div>
  );
}
