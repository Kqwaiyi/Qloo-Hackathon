import type { Metadata } from "next";

import { requireSignedInUser } from "@/server/data/session";

import { NewConsultation } from "./new-consultation";

export const metadata: Metadata = { title: "New Consultation" };

export default async function Page() {
  await requireSignedInUser();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New Consultation</h1>
      <NewConsultation />
    </>
  );
}
