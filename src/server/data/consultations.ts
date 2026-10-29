import "server-only";

import { getReadContext } from "@/server/app/context";
import {
  type ConsultationSummary,
  type ConsultationView,
  listConsultations,
  readConsultation,
} from "@/server/operations/consultations";
import { readStylingStatus, type StylingStatusView } from "@/server/operations/stylings";

/** My Consultations: the signed-in user's own, newest first, with fresh 1-hour links to their photos. */
export async function getMyConsultations(): Promise<ConsultationSummary[]> {
  return listConsultations(await getReadContext());
}

/** One of the viewer's own Consultations, with fresh 1-hour links to its photo and Previews. */
export async function getConsultation(consultationId: string): Promise<ConsultationView | null> {
  return readConsultation(await getReadContext(), consultationId);
}

/** The Styling status of one of the viewer's own Consultations, with the Stylist's Notes after its first `notesAfter`. */
export async function getStylingStatus(consultationId: string, notesAfter = 0): Promise<StylingStatusView | null> {
  return readStylingStatus(await getReadContext(), consultationId, { notesAfter });
}
