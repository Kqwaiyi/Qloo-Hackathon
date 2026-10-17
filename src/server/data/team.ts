import "server-only";

import { getServices } from "@/server/app/services";

/** The team's email address, which users write to for a copy of their data or a correction. */
export async function getTeamEmail(): Promise<string> {
  return (await getServices()).teamEmail;
}
