"use server";

import { getOperationContext } from "@/server/app/context";
import {
  type RequestPasswordResetInput,
  requestPasswordReset,
  requestPasswordResetInputSchema,
} from "@/server/operations/password-reset";

export async function requestPasswordResetAction(input: RequestPasswordResetInput) {
  return requestPasswordReset(await getOperationContext(), requestPasswordResetInputSchema.parse(input));
}
