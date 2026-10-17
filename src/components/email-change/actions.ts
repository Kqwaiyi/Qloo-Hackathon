"use server";

import { refresh } from "next/cache";
import * as z from "zod";

import { getOperationContext } from "@/server/app/context";
import { changeEmail } from "@/server/operations/email-change";

/**
 * "Change email" in the verification banner or Settings. The page then shows the new address, or
 * the step the change waits on.
 */
export async function changeEmailAction(newEmail: string) {
  const result = await changeEmail(await getOperationContext(), z.string().parse(newEmail));
  if (result.ok) refresh();
  return result;
}
