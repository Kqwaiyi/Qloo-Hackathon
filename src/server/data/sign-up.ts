import "server-only";

import { isBlockedByAgeGate } from "@/server/accounts/age-gate";
import { getReadContext } from "@/server/app/context";

/** True while this browser carries the cookie from an under-18 date of birth. */
export async function isSignUpBlockedByAgeGate(): Promise<boolean> {
  return isBlockedByAgeGate((await getReadContext()).requestHeaders);
}
