import "server-only";

import { getServices } from "@/server/app/services";

/** The site key the forms' Bot Check widget needs, or null while the Bot Check is off. */
export async function getBotCheckSiteKey(): Promise<string | null> {
  return (await getServices()).botCheckSiteKey;
}
