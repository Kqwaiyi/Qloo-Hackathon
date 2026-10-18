import "server-only";

import { getReadContext } from "@/server/app/context";
import { getServices } from "@/server/app/services";
import type { Result } from "@/server/operations/context";
import { readSignUpGate, type SignUpGateRefusal } from "@/server/operations/sign-up";

/** Whether the sign-up page shows its steps to this browser, or why not. */
export async function getSignUpGate(): Promise<Result<object, SignUpGateRefusal>> {
  return readSignUpGate(await getReadContext());
}

/** The site key the forms' Bot Check widget needs, or null while the Bot Check is off. */
export async function getBotCheckSiteKey(): Promise<string | null> {
  return (await getServices()).botCheckSiteKey;
}
