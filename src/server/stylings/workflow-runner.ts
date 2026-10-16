import "server-only";

import { start } from "workflow/api";

import { buildOutfitsWorkflow } from "@/workflows/build-outfits";

import type { StylingRunner } from "./runner";

/** Stylings as the "build Outfits" Vercel Workflow: Vercel's in deployments, the Local World in development. */
export const workflowStylingRunner: StylingRunner = {
  async start(stylingId) {
    const run = await start(buildOutfitsWorkflow, [stylingId]);
    return run.runId;
  },
};
