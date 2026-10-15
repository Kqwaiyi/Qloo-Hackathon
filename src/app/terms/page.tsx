import type { Metadata } from "next";

import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Terms" };

// Placeholder until the Privacy Policy and Terms ticket writes the text.
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Placeholder title="Terms">The Terms are being written. They will state the 18+ rule, the content rules, and that this is a free hackathon project.</Placeholder>
    </main>
  );
}
