import "server-only";

import { getReadContext } from "@/server/app/context";
import { type ConsultationView, readConsultation } from "@/server/operations/consultations";
import { readStylingStatus, type StylingStatusView } from "@/server/operations/stylings";

/** One of the signed-in user's own Consultations, with fresh 1-hour links to its photo and Previews. */
export async function getConsultation(consultationId: string): Promise<ConsultationView | null> {
  return readConsultation(await getReadContext(), consultationId);
}

/** The Styling status of one of the signed-in user's own Consultations. */
export async function getStylingStatus(consultationId: string): Promise<StylingStatusView | null> {
  return readStylingStatus(await getReadContext(), consultationId);
}
