import type { LanguageModelV4 } from "@ai-sdk/provider";

import { type BuildOutfitsSteps, buildOutfits } from "./build-outfits";
import { runStylist, type StylistSteps } from "./stylist";

// Which way a Styling is carried out. It imports nothing but types and the two ways' own modules,
// which the Workflow's sandbox can load, so the sandbox can load it too.

/** Every step a Styling may run: the "build Outfits" steps and the Stylist's. */
export type StylingSteps = BuildOutfitsSteps & StylistSteps;

/**
 * Carries out a Styling: a Face Photo's through the Stylist, on `stylistModel`, and a body photo's
 * through the fixed "build Outfits" order, until it moves to the Stylist too. A Styling whose way
 * can't be read breaks, keeping what it had.
 */
export async function runStyling(stylingId: string, steps: StylingSteps, stylistModel: LanguageModelV4): Promise<void> {
  let usesStylist: boolean;
  try {
    usesStylist = await steps.usesStylist(stylingId);
  } catch (error) {
    console.error("A Styling step failed:", error instanceof Error ? error.message : "unknown error");
    await steps.finish(stylingId, "broke");
    return;
  }
  if (usesStylist) await runStylist(stylingId, steps, stylistModel);
  else await buildOutfits(stylingId, steps);
}
