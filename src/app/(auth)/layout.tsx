import Link from "next/link";
import type { ReactNode } from "react";

import { ROUTES } from "@/config/routes";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link href={ROUTES.home} className="font-semibold tracking-tight">
            Outfit Recommender
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-10">{children}</main>
    </div>
  );
}
