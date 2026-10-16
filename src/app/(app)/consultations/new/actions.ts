"use server";

import { getOperationContext } from "@/server/app/context";
import {
  startConsultation,
  startConsultationInputSchema,
  type StartConsultationRefusal,
} from "@/server/operations/consultations";
import type { Result } from "@/server/operations/context";

/** "Get my Outfits". A form without a photo file or a known Photo Type is refused like an unusable file. */
export async function startConsultationAction(form: FormData): Promise<Result<{ consultationId: string }, StartConsultationRefusal>> {
  const input = startConsultationInputSchema.safeParse({ photo: form.get("photo"), photoType: form.get("photoType") });
  if (!input.success) return { ok: false, refusal: "unusable-file" };
  return startConsultation(await getOperationContext(), input.data);
}
