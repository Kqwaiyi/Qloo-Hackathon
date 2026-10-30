import "server-only";

import { getReadContext } from "@/server/app/context";
import { type GuestPageView, readGuestPage } from "@/server/operations/guest-consultations";

/** What the Guest Page opens on, for this request's browser. */
export async function getGuestPage(): Promise<GuestPageView> {
  return readGuestPage(await getReadContext());
}
