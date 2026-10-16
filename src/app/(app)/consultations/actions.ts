"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { ROUTES } from "@/config/routes";
import { getOperationContext } from "@/server/app/context";
import { deleteConsultation } from "@/server/operations/consultations";

/**
 * Delete, confirmed on My Consultations. The list then shows without it, as it does when it was
 * already gone, deleted in another tab.
 */
export async function deleteConsultationAction(consultationId: string): Promise<void> {
  const result = await deleteConsultation(await getOperationContext(), z.string().parse(consultationId));
  if (!result.ok && result.refusal === "signed-out") redirect(ROUTES.signIn);
  refresh();
}
