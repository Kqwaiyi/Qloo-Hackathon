import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ROUTES } from "@/config/routes";
import { addsToCurrentOutfits } from "@/config/stylings";
import { getConsultation, getStylingStatus } from "@/server/data/consultations";
import { getUsageSummary } from "@/server/data/usage";

import { ConsultationResults, StylingInPlace } from "./consultation-results";

export const metadata: Metadata = { title: "Your Outfits" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The status first: a Styling that finishes between the two reads shows its Outfits.
  const status = await getStylingStatus(id);
  const consultation = status && (await getConsultation(id));
  if (!status || !consultation) notFound();
  const { progress } = status;

  // Opened mid-Styling, from here or on coming back, it's the Styling step again. "Show 2 more
  // Outfits" instead keeps the Outfits in view, with its own compact checklist below them.
  if (progress && !addsToCurrentOutfits(progress.kind)) return <StylingInPlace consultation={consultation} progress={progress} />;
  const usage = await getUsageSummary();
  if (!usage) redirect(ROUTES.signIn);
  return <ConsultationResults consultation={consultation} progress={progress} usage={usage} />;
}
