import "server-only";

import { getReadContext } from "@/server/app/context";
import { readUsageSummary, type UsageSummary } from "@/server/operations/usage";

/** The signed-in user's Outfits left today, and whether a Styling can start now. */
export async function getUsageSummary(): Promise<UsageSummary | null> {
  return readUsageSummary(await getReadContext());
}
