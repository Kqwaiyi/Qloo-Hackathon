import type { ReactNode } from "react";

import { Wordmark } from "@/components/wordmark";
import { ROUTES } from "@/config/routes";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Wordmark href={ROUTES.home} />
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-10">{children}</main>
    </div>
  );
}
