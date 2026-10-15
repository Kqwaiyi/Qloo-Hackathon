import Link from "next/link";

import { primaryButton, secondaryButton } from "@/components/ui";
import { ROUTES } from "@/config/routes";

// A minimal public page until the landing page replaces it.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Outfit Recommender</h1>
      <p className="mt-3 max-w-xl text-stone-600">
        Take one photo of yourself and get complete Outfits, picked with Qloo&apos;s taste data and shown on you.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={ROUTES.signUp} className={primaryButton}>
          Create a free account
        </Link>
        <Link href={ROUTES.signIn} className={secondaryButton}>
          Sign in
        </Link>
      </div>
    </main>
  );
}
