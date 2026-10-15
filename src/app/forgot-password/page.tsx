import type { Metadata } from "next";

import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Reset your password" };

// Placeholder until the password reset ticket builds the form.
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Placeholder title="Reset your password">Password reset by email is coming soon.</Placeholder>
    </main>
  );
}
