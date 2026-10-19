"use client";

import { useFormStatus } from "react-dom";

import { COPY } from "@/config/copy";

/**
 * The submit button of a form that signs out: Sign out in the header, or "Sign out of all devices"
 * in Settings. While its form is signing out, it says "Signing out…" and takes no more clicks.
 */
export function SignOutButton({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:cursor-not-allowed disabled:opacity-40`}>
      {pending ? COPY.signingOut : label}
    </button>
  );
}
