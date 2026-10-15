import type { Metadata } from "next";

import { Placeholder } from "@/components/placeholder";
import { requireSignedInUser } from "@/server/data/session";

export const metadata: Metadata = { title: "My Consultations" };

export default async function Page() {
  await requireSignedInUser();
  return <Placeholder title="My Consultations">Your past Consultations will be listed here.</Placeholder>;
}
