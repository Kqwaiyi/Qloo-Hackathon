import Link from "next/link";
import type { ReactNode } from "react";

import { APP_HOME, ROUTES } from "@/config/routes";
import { requireSignedInUser } from "@/server/data/session";

import { signOutAction } from "./actions";
import { NavLink } from "./nav-link";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSignedInUser();
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Link href={APP_HOME} className="font-semibold tracking-tight">
            Outfit Recommender
          </Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
            <NavLink href={ROUTES.newConsultation}>New Consultation</NavLink>
            <NavLink href={ROUTES.myConsultations}>My Consultations</NavLink>
            <NavLink href={ROUTES.settings}>Settings</NavLink>
            <form action={signOutAction}>
              <button type="submit" className="rounded-lg px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-100">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
