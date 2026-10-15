import type { Metadata } from "next";

import { Placeholder } from "@/components/placeholder";
import { requireSignedInUser } from "@/server/data/session";

export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  await requireSignedInUser();
  return <Placeholder title="Settings">Your profile and sign-in settings will be here.</Placeholder>;
}
