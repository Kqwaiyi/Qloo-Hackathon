import type { Metadata } from "next";

import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Privacy Policy" };

// Placeholder until the Privacy Policy and Terms ticket writes the text.
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Placeholder title="Privacy Policy">The Privacy Policy is being written. It will say what we collect, why, who receives it, and how long it is kept.</Placeholder>
    </main>
  );
}
