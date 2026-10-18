import "server-only";

import { getReadContext } from "@/server/app/context";
import { LANDING_SAMPLES } from "@/server/landing-samples";
import { type LandingPageView, readLandingPage } from "@/server/operations/landing";

/** The landing page, with fresh 1-hour links to its frozen samples' images. */
export async function getLandingPage(): Promise<LandingPageView> {
  return readLandingPage(await getReadContext(), LANDING_SAMPLES);
}
