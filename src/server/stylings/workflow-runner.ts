import "server-only";

import { getRun, start } from "workflow/api";

import { buildOutfitsWorkflow } from "@/workflows/build-outfits";

import type { StylingRunner } from "./runner";

/** Stylings as the "build Outfits" Vercel Workflow: Vercel's in deployments, the Local World in development. */
export const workflowStylingRunner: StylingRunner = {
  async start(stylingId) {
    // Each step saves its output to the database, so nothing reads a run's data afterwards. It's
    // deleted as soon as the run finishes, rather than kept for the plan's retention (7 days on
    // Pro), which keeps the deletion promise that leftovers are gone within a day.
    const run = await start(buildOutfitsWorkflow, [stylingId], { experimental_retention: 0 });
    return run.runId;
  },

  async cancel(runId) {
    await getRun(runId).cancel();
  },
};
