import type { Metadata } from "next";

import { Placeholder } from "@/components/placeholder";
import { requireSignedInUser } from "@/server/data/session";

export const metadata: Metadata = { title: "New Consultation" };

export default async function Page() {
  await requireSignedInUser();
  return <Placeholder title="New Consultation">Taking a photo and getting Outfits arrives here soon.</Placeholder>;
}
