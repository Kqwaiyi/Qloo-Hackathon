import "server-only";

import { teamEmailAddress } from "@/server/email/gmail";

/**
 * The team's email address, which users write to for a copy of their data, a correction or a
 * complaint. It needs no other service, so public pages can show it without opening the database.
 */
export function getTeamEmail(): string {
  return teamEmailAddress();
}
