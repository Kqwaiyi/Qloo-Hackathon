import "server-only";

import { connection } from "next/server";

import { getServices } from "@/server/app/services";

/**
 * The site key the forms' Bot Check widget needs, or null while the Bot Check is off. A page that
 * reads it renders for each request, so it never opens the database at build time or keeps the key
 * it had then.
 */
export async function getBotCheckSiteKey(): Promise<string | null> {
  await connection();
  return (await getServices()).botCheckSiteKey;
}
