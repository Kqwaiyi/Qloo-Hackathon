import "server-only";

import { getReadContext } from "@/server/app/context";
import { type ConsultationView, readConsultation } from "@/server/operations/consultations";

/** One of the signed-in user's own Consultations, with a fresh 1-hour link to its photo. */
export async function getConsultation(consultationId: string): Promise<ConsultationView | null> {
  return readConsultation(await getReadContext(), consultationId);
}
